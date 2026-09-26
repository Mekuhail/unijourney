import type { User } from '../../../shared/types.ts';
import { db, pj } from '../../core/db.ts';
import { newId } from '../../core/ids.ts';
import { nowIso, todayIso } from '../../core/clock.ts';
import { bad, forbidden, notFound, unprocessable } from '../../core/http.ts';
import { upsertEntry, removeEntry, findConflicts, type Conflict } from '../../core/calendar.ts';
import { audit } from '../../core/audit.ts';
import { getUser } from '../../core/auth.ts';
import { APP_STATUSES, getProfile, isTerminal, movesForward, normalizeUrl, rowToOpportunity, type AppStatus, type ApplicationRow, type OpportunityRow } from './shared.ts';
import { matchOpportunity } from './match.ts';

export interface ApplicationEvent { id: string; application_id: string; from_status: string | null; to_status: string; actor_id: string | null; source: string; note: string | null; created_at: string }
export interface Interview { id: string; application_id: string; student_id: string; start_at: string; end_at: string; tz: string; location: string | null; link: string | null; kind: string; notes: string | null; calendar_entry_id: string | null; created_at: string }

export function getApplicationRow(id: string): ApplicationRow | undefined {
  return db().get<ApplicationRow>('SELECT * FROM applications WHERE id = ?', id);
}

/** Owner-only access. Staff roles have no access to career records (privacy). */
export function requireOwnedApplication(user: User, id: string): ApplicationRow {
  const a = getApplicationRow(id);
  if (!a) throw notFound('Application not found');
  if (a.student_id !== user.id) throw forbidden('You can only access your own applications');
  return a;
}

export function listEvents(applicationId: string): ApplicationEvent[] {
  return db().all<ApplicationEvent>('SELECT * FROM application_events WHERE application_id = ? ORDER BY created_at, rowid', applicationId);
}
export function listInterviews(applicationId: string): Interview[] {
  return db().all<Interview>('SELECT * FROM interviews WHERE application_id = ? ORDER BY start_at', applicationId);
}

export function recordEvent(applicationId: string, from: string | null, to: string, actorId: string | null, source: 'manual' | 'email' | 'correction' | 'seed' | 'system', note?: string | null, at?: string): ApplicationEvent {
  const e: ApplicationEvent = { id: newId('aev'), application_id: applicationId, from_status: from, to_status: to, actor_id: actorId, source, note: note ?? null, created_at: at ?? nowIso() };
  db().insert('application_events', e as unknown as Record<string, unknown>);
  return e;
}

export interface CreateApplicationInput { opportunityId?: string | null; company?: string; title?: string; url?: string | null; type?: string; status?: AppStatus }

/** At most one application per (student, opportunity); a second call returns the existing record with duplicate=true. */
export function createApplication(user: User, input: CreateApplicationInput, source: 'manual' | 'seed' = 'manual'): { application: ApplicationRow; duplicate: boolean } {
  return db().tx(() => {
    let opp: OpportunityRow | undefined;
    if (input.opportunityId) {
      opp = db().get<OpportunityRow>('SELECT * FROM opportunities WHERE id = ?', input.opportunityId);
      if (!opp) throw notFound('Opportunity not found');
      const existing = db().get<ApplicationRow>('SELECT * FROM applications WHERE student_id = ? AND opportunity_id = ?', user.id, opp.id);
      if (existing) return { application: existing, duplicate: true };
    }
    const url = input.url ?? opp?.url ?? null;
    const normalized = normalizeUrl(url);
    if (!opp && normalized) {
      const byUrl = db().get<ApplicationRow>('SELECT * FROM applications WHERE student_id = ? AND normalized_url = ?', user.id, normalized);
      if (byUrl) return { application: byUrl, duplicate: true };
    }
    const company = (input.company ?? opp?.company ?? '').trim();
    const title = (input.title ?? opp?.title ?? '').trim();
    if (!company || !title) throw bad('company and title are required');
    const now = nowIso();
    const status: AppStatus = input.status ?? 'saved';
    const row: ApplicationRow = {
      id: newId('app'), student_id: user.id, opportunity_id: opp?.id ?? null, company, title, url, normalized_url: normalized, type: input.type ?? opp?.type ?? 'internship',
      status, notes: '', cv_version: null, deadline: opp?.deadline ?? null, applied_at: null, attested_by: null, created_at: now, updated_at: now
    };
    db().insert('applications', row as unknown as Record<string, unknown>);
    if (opp) db().run('INSERT OR IGNORE INTO saved_opportunities (user_id, opportunity_id, created_at) VALUES (?, ?, ?)', user.id, opp.id, now);
    recordEvent(row.id, null, status, user.id, source, opp ? `Tracked from opportunity ${opp.title}` : 'Manual entry');
    audit(user.id, 'career.application.create', 'application', row.id, { opportunity_id: opp?.id ?? null, company, title });
    return { application: row, duplicate: false };
  });
}

export interface TransitionInput { status: AppStatus; note?: string | null; attest?: boolean; correction?: boolean; source?: 'manual' | 'email' | 'correction'; actorId?: string | null }

/**
 * Forward moves (Saved → Preparing → Applied → Assessment → Interview → Offer/Rejected/Withdrawn) are allowed, skipping
 * stages is fine. Backward moves or leaving a terminal status need `correction: true` plus a note. `applied` needs the
 * student's attestation ("I submitted this application myself") because saving a record never proves a submission.
 */
export function transitionApplication(app: ApplicationRow, input: TransitionInput): { application: ApplicationRow; event: ApplicationEvent } {
  if (!APP_STATUSES.includes(input.status)) throw bad('Unknown status');
  if (input.status === app.status) throw bad(`Application is already ${app.status}`);
  const forward = movesForward(app.status, input.status);
  let source: 'manual' | 'email' | 'correction' = input.source ?? 'manual';
  if (!forward) {
    if (!input.correction) throw unprocessable(`Moving from ${app.status} to ${input.status} is not a forward step. Mark it as a correction and add a note.`, { from: app.status, to: input.status, correction_required: true });
    if (!input.note || !input.note.trim()) throw unprocessable('A note is required for corrections', { note_required: true });
    source = 'correction';
  }
  const patch: Record<string, unknown> = { status: input.status, updated_at: nowIso() };
  if (input.status === 'applied') {
    if (source !== 'email' && !input.attest) throw unprocessable('Please attest that you submitted this application yourself.', { attestation_required: true });
    if (!app.applied_at) patch.applied_at = nowIso();
    patch.attested_by = source === 'email' ? 'email' : 'student';
  }
  return db().tx(() => {
    db().update('applications', app.id, patch);
    const event = recordEvent(app.id, app.status, input.status, input.actorId ?? app.student_id, source, input.note ?? null);
    audit(input.actorId ?? app.student_id, 'career.application.status', 'application', app.id, { from: app.status, to: input.status, source });
    return { application: getApplicationRow(app.id)!, event };
  });
}

export interface InterviewInput { start_at: string; end_at: string; location?: string | null; link?: string | null; kind?: string; notes?: string | null }

/** Creates the interview and exactly one calendar entry (idempotent per interview id); reports class/event conflicts. */
export function addInterview(user: User, app: ApplicationRow, input: InterviewInput, advance = false): { interview: Interview; conflicts: Conflict[]; statusChanged: boolean } {
  if (new Date(input.end_at).getTime() <= new Date(input.start_at).getTime()) throw bad('end_at must be after start_at');
  return db().tx(() => {
    const id = newId('int');
    const now = nowIso();
    const entry = upsertEntry(user.id, {
      source_type: 'interview', source_id: id, title: `Interview – ${app.company}`, kind: 'interview', start_at: input.start_at, end_at: input.end_at,
      location_text: input.location ?? (input.link ? 'Online' : null), immovable: true, link: `/career/applications/${app.id}`, meta: { application_id: app.id, company: app.company, kind: input.kind ?? 'interview' }
    });
    const row: Interview = { id, application_id: app.id, student_id: user.id, start_at: input.start_at, end_at: input.end_at, tz: 'Asia/Riyadh', location: input.location ?? null, link: input.link ?? null, kind: input.kind ?? 'interview', notes: input.notes ?? null, calendar_entry_id: entry.id, created_at: now };
    db().insert('interviews', row as unknown as Record<string, unknown>);
    const conflicts = findConflicts(user.id, input.start_at, input.end_at, { source_type: 'interview', source_id: id });
    let statusChanged = false;
    if (advance && movesForward(app.status, 'interview')) {
      transitionApplication(app, { status: 'interview', note: 'Interview scheduled', actorId: user.id });
      statusChanged = true;
    }
    audit(user.id, 'career.interview.create', 'interview', id, { application_id: app.id, conflicts: conflicts.length });
    return { interview: row, conflicts, statusChanged };
  });
}

export function deleteInterview(user: User, interviewId: string) {
  const row = db().get<Interview>('SELECT * FROM interviews WHERE id = ?', interviewId);
  if (!row) throw notFound('Interview not found');
  if (row.student_id !== user.id) throw forbidden();
  db().tx(() => {
    removeEntry(user.id, 'interview', interviewId);
    db().run('DELETE FROM interviews WHERE id = ?', interviewId);
  });
}

export function applicationSummary(app: ApplicationRow) {
  const events = listEvents(app.id);
  const interviews = listInterviews(app.id);
  const opp = app.opportunity_id ? db().get<OpportunityRow>('SELECT * FROM opportunities WHERE id = ?', app.opportunity_id) : undefined;
  const emails = db().count('hiring_emails', 'suggested_application_id = ?', app.id);
  let opportunity: (ReturnType<typeof rowToOpportunity> & { match: ReturnType<typeof matchOpportunity> | null }) | null = null;
  if (opp) {
    const o = rowToOpportunity(opp, todayIso());
    const owner = getUser(app.student_id);
    opportunity = { ...o, match: owner ? matchOpportunity(o, owner, getProfile(owner)) : null };
  }
  return { ...app, last_event: events[events.length - 1] ?? null, interviews, next_interview: interviews.find((i) => i.end_at >= nowIso()) ?? null, opportunity, emails_count: emails, terminal: isTerminal(app.status) };
}

export function listApplicationsFor(userId: string) {
  return db().all<ApplicationRow>('SELECT * FROM applications WHERE student_id = ? ORDER BY updated_at DESC', userId).map(applicationSummary);
}

export { pj };
