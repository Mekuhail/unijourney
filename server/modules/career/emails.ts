import type { User } from '../../../shared/types.ts';
import { db, j, pj } from '../../core/db.ts';
import { newId } from '../../core/ids.ts';
import { nowIso } from '../../core/clock.ts';
import { bad, forbidden, notFound } from '../../core/http.ts';
import { getSetting, setSetting } from '../../core/settings.ts';
import { audit } from '../../core/audit.ts';
import { notify } from '../../core/notify.ts';
import { CATEGORY_TO_STATUS, isTerminal, movesForward, normalizeCompany, type ApplicationRow, type EmailCategory } from './shared.ts';
import { getApplicationRow, recordEvent, transitionApplication } from './applications.ts';

/*
 * Deterministic hiring-email classifier (no model needed). Email text is untrusted data: it is matched with keyword rules
 * and never interpreted as instructions. Category → suggested status mapping and the "never downgrade" rule are adapted
 * from "AI Job Tracker" (MIT License, Copyright (c) 2024 Job Application Tracker).
 */
export interface HiringEmailRow {
  id: string; student_id: string; from_address: string; subject: string; snippet: string; body: string; received_at: string; category: string | null; confidence: number;
  suggested_application_id: string | null; suggested_status: string | null; review_status: string; matched_by: string | null; created_at: string;
}
export interface MatchedBy { method: 'domain' | 'company_name' | 'fuzzy' | 'none'; candidates: string[]; ambiguous: boolean }

const RULES: Array<{ category: EmailCategory; re: RegExp; confidence: number }> = [
  { category: 'offer', re: /\b(offer letter|pleased to offer|delighted to offer|job offer|extend an offer)\b/i, confidence: 0.92 },
  { category: 'interview_invite', re: /\b(interview)\b/i, confidence: 0.88 },
  { category: 'assessment_invite', re: /\b(assessment|coding test|online test|technical challenge|take-home|hackerrank|codility)\b/i, confidence: 0.86 },
  { category: 'rejection', re: /\b(unfortunately|not (be )?moving forward|regret to inform|not selected|other candidates|decided to pursue other)\b/i, confidence: 0.85 },
  { category: 'application_confirmation', re: /\b(received your application|thank you for applying|application (has been )?(received|submitted)|we have received|confirm(s|ing)? (that )?(we )?received)\b/i, confidence: 0.82 },
  { category: 'recruiter_outreach', re: /\b(came across your profile|would you be interested|we are hiring|open role|opportunity for you)\b/i, confidence: 0.6 }
];

export function classifyText(subject: string, body: string): { category: EmailCategory; confidence: number } {
  const text = `${subject}\n${body}`;
  for (const r of RULES) if (r.re.test(text)) return { category: r.category, confidence: r.confidence };
  if (/\b(thank you for your interest|your application)\b/i.test(text)) return { category: 'other', confidence: 0.45 };
  return { category: 'other', confidence: 0.3 };
}

export function senderDomain(address: string): string {
  const m = address.toLowerCase().match(/@([a-z0-9.-]+)/);
  return m ? m[1] : '';
}

/** Match by sender domain → company name in text → loose token overlap. Two or more candidates = ambiguous. */
export function matchApplications(email: { from_address: string; subject: string; body: string }, apps: ApplicationRow[]): MatchedBy {
  const domain = senderDomain(email.from_address).replace(/\.(example-demo\.sa|com|sa|net|org|io)$/i, '');
  const text = `${email.subject} ${email.body}`.toLowerCase();
  const active = apps.filter((a) => !isTerminal(a.status));
  const pool = active.length ? active : apps;
  const strong = pool.filter((a) => { const c = normalizeCompany(a.company); return c.length >= 3 && domain.replace(/[^a-z0-9]/g, '').includes(c); });
  if (strong.length) return { method: 'domain', candidates: strong.map((a) => a.id), ambiguous: strong.length > 1 };
  const byName = pool.filter((a) => { const clean = a.company.toLowerCase().replace(/\(.*?\)/g, '').replace(/[–-]\s*demo/g, '').trim(); return clean.length >= 3 && text.includes(clean); });
  if (byName.length) return { method: 'company_name', candidates: byName.map((a) => a.id), ambiguous: byName.length > 1 };
  const tokens = (s: string) => s.toLowerCase().replace(/\(.*?\)/g, '').split(/[^a-z0-9]+/).filter((t) => t.length >= 4 && !['demo', 'digital', 'group', 'saudi', 'national', 'studio', 'studios', 'agency'].includes(t));
  const fuzzy = pool.filter((a) => tokens(a.company).some((tok) => domain.includes(tok) || text.includes(tok)));
  if (fuzzy.length) return { method: 'fuzzy', candidates: fuzzy.map((a) => a.id), ambiguous: fuzzy.length > 1 };
  return { method: 'none', candidates: [], ambiguous: false };
}

export function autoApplyEnabled(userId: string): boolean {
  return getSetting<boolean>(`career.autoApply.${userId}`, false);
}
export function setAutoApply(userId: string, v: boolean) {
  setSetting(`career.autoApply.${userId}`, v);
}

/**
 * Classifies one stored email. Confident single-candidate matches are auto-applied only when the student enabled it AND
 * the suggestion moves the application forward (older emails never downgrade). Otherwise the email waits for review.
 */
export function classifyEmail(emailId: string): HiringEmailRow {
  const e = db().get<HiringEmailRow>('SELECT * FROM hiring_emails WHERE id = ?', emailId);
  if (!e) throw notFound('Email not found');
  const { category, confidence: baseConf } = classifyText(e.subject, e.body);
  const apps = db().all<ApplicationRow>('SELECT * FROM applications WHERE student_id = ?', e.student_id);
  const match = matchApplications(e, apps);
  let confidence = baseConf;
  if (match.ambiguous) confidence = Math.min(confidence, 0.5);
  else if (match.method === 'fuzzy') confidence = Math.min(confidence, 0.7);
  else if (match.method === 'none') confidence = Math.min(confidence, 0.55);
  const suggestedApp = !match.ambiguous && match.candidates.length === 1 ? match.candidates[0] : null;
  const suggestedStatus = CATEGORY_TO_STATUS[category] ?? null;
  let review = e.review_status === 'accepted' || e.review_status === 'dismissed' ? e.review_status : 'pending';
  db().update('hiring_emails', e.id, { category, confidence, suggested_application_id: suggestedApp, suggested_status: suggestedStatus, matched_by: j(match), review_status: review });
  if (review === 'pending' && suggestedApp && suggestedStatus && confidence >= 0.8 && autoApplyEnabled(e.student_id)) {
    const app = getApplicationRow(suggestedApp)!;
    if (movesForward(app.status, suggestedStatus)) {
      transitionApplication(app, { status: suggestedStatus, source: 'email', note: `Email: ${e.subject}`, actorId: null });
      review = 'auto_applied';
      db().update('hiring_emails', e.id, { review_status: review });
      notify(e.student_id, { module: 'career', kind: 'email_auto', title: `${app.company}: status moved to ${suggestedStatus}`, body: `From email "${e.subject}" (auto-applied; you can correct it).`, link: `/career/applications/${app.id}` });
    }
  }
  return db().get<HiringEmailRow>('SELECT * FROM hiring_emails WHERE id = ?', e.id)!;
}

export function insertEmail(studentId: string, m: { from_address: string; subject: string; snippet: string; body: string; received_at: string }): HiringEmailRow {
  const row = { id: newId('hml'), student_id: studentId, from_address: m.from_address, subject: m.subject, snippet: m.snippet, body: m.body, received_at: m.received_at, category: null, confidence: 0, suggested_application_id: null, suggested_status: null, review_status: 'pending', matched_by: null, created_at: nowIso() };
  db().insert('hiring_emails', row);
  return classifyEmail(row.id);
}

export function requireOwnedEmail(user: User, id: string): HiringEmailRow {
  const e = db().get<HiringEmailRow>('SELECT * FROM hiring_emails WHERE id = ?', id);
  if (!e) throw notFound('Email not found');
  if (e.student_id !== user.id) throw forbidden();
  return e;
}

/** The student resolves the review: link to an application and apply the suggested status only if it moves forward. */
export function acceptEmail(user: User, emailId: string, applicationId?: string | null): { email: HiringEmailRow; applied: boolean; application: ApplicationRow | null; note: string } {
  const e = requireOwnedEmail(user, emailId);
  const match = pj<MatchedBy>(e.matched_by, { method: 'none', candidates: [], ambiguous: false });
  const targetId = applicationId ?? e.suggested_application_id;
  if (!targetId) throw bad('Choose which application this email belongs to', { candidates: match.candidates });
  const app = getApplicationRow(targetId);
  if (!app || app.student_id !== user.id) throw forbidden('Application does not belong to you');
  return db().tx(() => {
    let applied = false;
    let note = '';
    if (e.suggested_status && movesForward(app.status, e.suggested_status)) {
      transitionApplication(app, { status: e.suggested_status as never, source: 'email', note: `Email: ${e.subject}`, actorId: user.id });
      applied = true;
      note = `Status moved ${app.status} → ${e.suggested_status}`;
    } else {
      note = e.suggested_status ? `Email linked; status kept at ${app.status} (an older "${e.suggested_status}" email never downgrades)` : 'Email linked; no status change';
      recordEvent(app.id, app.status, app.status, user.id, 'email', `${note}: ${e.subject}`);
    }
    db().update('hiring_emails', e.id, { review_status: 'accepted', suggested_application_id: app.id });
    audit(user.id, 'career.email.accept', 'hiring_email', e.id, { application_id: app.id, applied });
    return { email: db().get<HiringEmailRow>('SELECT * FROM hiring_emails WHERE id = ?', e.id)!, applied, application: getApplicationRow(app.id) ?? null, note };
  });
}

export function dismissEmail(user: User, emailId: string): HiringEmailRow {
  const e = requireOwnedEmail(user, emailId);
  db().update('hiring_emails', e.id, { review_status: 'dismissed' });
  return db().get<HiringEmailRow>('SELECT * FROM hiring_emails WHERE id = ?', e.id)!;
}

export function listEmails(userId: string, status?: string) {
  const rows = status
    ? db().all<HiringEmailRow>('SELECT * FROM hiring_emails WHERE student_id = ? AND review_status = ? ORDER BY received_at DESC', userId, status)
    : db().all<HiringEmailRow>(`SELECT * FROM hiring_emails WHERE student_id = ? ORDER BY CASE review_status WHEN 'pending' THEN 0 ELSE 1 END, received_at DESC`, userId);
  const apps = new Map(db().all<ApplicationRow>('SELECT * FROM applications WHERE student_id = ?', userId).map((a) => [a.id, a]));
  const brief = (id: string | null) => { const a = id ? apps.get(id) : undefined; return a ? { id: a.id, company: a.company, title: a.title, status: a.status } : null; };
  return rows.map((e) => {
    const match = pj<MatchedBy>(e.matched_by, { method: 'none', candidates: [], ambiguous: false });
    return { ...e, matched_by: match, suggested_application: brief(e.suggested_application_id), candidates: match.candidates.map(brief).filter(Boolean), ambiguous: match.ambiguous };
  });
}
