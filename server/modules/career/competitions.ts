import { Router } from 'express';
import { z } from 'zod';
import type { User } from '../../../shared/types.ts';
import { db, j, pj } from '../../core/db.ts';
import { h, ok, parse, notFound, unprocessable } from '../../core/http.ts';
import { requireUser } from '../../core/auth.ts';
import { newId } from '../../core/ids.ts';
import { nowIso, todayIso } from '../../core/clock.ts';
import { audit } from '../../core/audit.ts';
import { upsertEntry, removeEntry } from '../../core/calendar.ts';
import { getProfile } from './shared.ts';
import { recordVerifiedAward, skillEvidence } from './portfolio.ts';
import { skillKey } from './skills.ts';

/*
 * University competitions, kept apart from the job market: hackathons, programming contests, case, design, cyber and
 * data challenges. Their lifecycle differs from job applications (Interested → Registered → Team formed → Submitted →
 * Result). Registering here records the student's intent and puts the deadlines on their calendar; the organiser's own
 * registration stays on the organiser's site. A result on a YU-organised competition becomes a verified portfolio award.
 */

export const COMP_KINDS = ['hackathon', 'programming', 'case', 'design', 'cyber', 'ai_data'] as const;
export const COMP_SCOPES = ['yu', 'saudi', 'international', 'online'] as const;
export const ENTRY_STATUSES = ['interested', 'registered', 'team_formed', 'submitted', 'result'] as const;
type EntryStatus = (typeof ENTRY_STATUSES)[number];

export interface CompetitionRow {
  id: string; title: string; organiser: string; kind: string; scope: string; format: string; city: string; registration_opens: string | null; registration_deadline: string;
  starts_at: string; ends_at: string; team_min: number; team_max: number; eligibility: string; prizes: string; fee: string; url: string | null; skills: string; description: string; source: string; created_at: string;
}
interface EntryRow { id: string; competition_id: string; student_id: string; status: EntryStatus; team_name: string | null; result: string | null; portfolio_item_id: string | null; created_at: string; updated_at: string }

function segmentOf(c: CompetitionRow, today: string): 'open' | 'upcoming' | 'past' {
  const endDay = c.ends_at.slice(0, 10);
  if (endDay < today) return 'past';
  const opens = c.registration_opens ?? '0000-00-00';
  if (opens <= today && c.registration_deadline >= today) return 'open';
  return 'upcoming';
}

function decorateCompetition(c: CompetitionRow, u: User, strong: Map<string, string>, entry: EntryRow | undefined, today: string) {
  const skills = pj<string[]>(c.skills, []);
  const fit = skills.filter((s) => strong.has(skillKey(s)));
  const daysLeft = Math.round((new Date(`${c.registration_deadline}T00:00:00Z`).getTime() - new Date(`${today}T00:00:00Z`).getTime()) / 86400000);
  return {
    ...c, skills, segment: segmentOf(c, today), days_left: daysLeft, fit, team: { min: c.team_min, max: c.team_max },
    entry: entry ? { id: entry.id, status: entry.status, team_name: entry.team_name, result: entry.result, portfolio_item_id: entry.portfolio_item_id } : null,
    eligible_hint: c.scope === 'yu' && !u.roles.includes('student') ? 'yu_students_only' : null
  };
}

export const competitionsRouter = Router();

competitionsRouter.get('/competitions', h((req, res) => {
  const u = requireUser(req);
  const q = parse(z.object({ segment: z.enum(['open', 'upcoming', 'past', 'mine']).optional(), kind: z.enum(COMP_KINDS).optional(), scope: z.enum(COMP_SCOPES).optional() }), req.query);
  const today = todayIso();
  const evidence = skillEvidence(u, getProfile(u));
  const strong = new Map([...evidence.values()].filter((s) => s.strength >= 0.6).map((s) => [s.key, s.label_en]));
  const entries = new Map(db().all<EntryRow>('SELECT * FROM competition_entries WHERE student_id = ?', u.id).map((e) => [e.competition_id, e]));
  const all = db().all<CompetitionRow>('SELECT * FROM competitions ORDER BY registration_deadline').map((c) => decorateCompetition(c, u, strong, entries.get(c.id), today));
  const counts = { open: 0, upcoming: 0, past: 0, mine: 0 };
  for (const c of all) { counts[c.segment]++; if (c.entry) counts.mine++; }
  let items = all;
  if (q.segment === 'mine') items = items.filter((c) => c.entry);
  else if (q.segment) items = items.filter((c) => c.segment === q.segment);
  if (q.kind) items = items.filter((c) => c.kind === q.kind);
  if (q.scope) items = items.filter((c) => c.scope === q.scope);
  if (q.segment === 'past') items = [...items].reverse();
  ok(res, { items, counts, today });
}));

competitionsRouter.get('/competitions/:id', h((req, res) => {
  const u = requireUser(req);
  const c = db().get<CompetitionRow>('SELECT * FROM competitions WHERE id = ?', String(req.params.id));
  if (!c) throw notFound('Competition not found');
  const evidence = skillEvidence(u, getProfile(u));
  const strong = new Map([...evidence.values()].filter((s) => s.strength >= 0.6).map((s) => [s.key, s.label_en]));
  const entry = db().get<EntryRow>('SELECT * FROM competition_entries WHERE competition_id = ? AND student_id = ?', c.id, u.id);
  ok(res, decorateCompetition(c, u, strong, entry, todayIso()));
}));

competitionsRouter.put('/competitions/:id/entry', h((req, res) => {
  const u = requireUser(req);
  const c = db().get<CompetitionRow>('SELECT * FROM competitions WHERE id = ?', String(req.params.id));
  if (!c) throw notFound('Competition not found');
  const body = parse(z.object({ status: z.enum(ENTRY_STATUSES), team_name: z.string().trim().max(80).optional().nullable(), result: z.string().trim().max(120).optional().nullable() }), req.body);
  const today = todayIso();
  const seg = segmentOf(c, today);
  if ((body.status === 'registered' || body.status === 'team_formed') && seg !== 'open') throw unprocessable('Registration is not open for this competition.');
  if (body.status === 'result' && !body.result) throw unprocessable('Add the result, for example "2nd place".');
  const now = nowIso();
  const cur = db().get<EntryRow>('SELECT * FROM competition_entries WHERE competition_id = ? AND student_id = ?', c.id, u.id);
  const id = cur?.id ?? newId('ce');
  let portfolioItemId = cur?.portfolio_item_id ?? null;
  db().tx(() => {
    if (body.status === 'result' && body.result) {
      const verified = c.scope === 'yu';
      if (verified) {
        portfolioItemId = recordVerifiedAward(u.id, { title: `${body.result} · ${c.title}`, org: c.organiser, date: c.ends_at.slice(0, 10), description: c.description, skills: pj<string[]>(c.skills, []), ref: `competition:${c.id}`, url: c.url });
      } else if (!portfolioItemId) {
        portfolioItemId = newId('pf');
        db().insert('portfolio_items', { id: portfolioItemId, student_id: u.id, kind: 'award', title: `${body.result} · ${c.title}`, org: c.organiser, start_date: c.ends_at.slice(0, 10), end_date: c.ends_at.slice(0, 10), description: c.description, url: c.url, credential_id: null, skills: c.skills, source: 'competition', source_ref: `competition:${c.id}`, verification: 'self', visibility: 'private', created_at: now, updated_at: now });
      }
    }
    db().upsert('competition_entries', { id, competition_id: c.id, student_id: u.id, status: body.status, team_name: body.team_name ?? cur?.team_name ?? null, result: body.result ?? cur?.result ?? null, portfolio_item_id: portfolioItemId, created_at: cur?.created_at ?? now, updated_at: now });
    // Deadlines on the shared calendar while the competition is still ahead.
    if (seg !== 'past') {
      if (body.status === 'interested') upsertEntry(u.id, { source_type: 'deadline', source_id: `comp-reg:${c.id}`, title: `Registration closes: ${c.title}`, kind: 'deadline', start_at: `${c.registration_deadline}T20:00:00+03:00`, end_at: `${c.registration_deadline}T21:00:00+03:00`, link: `/career?tab=competitions&id=${c.id}` });
      if (body.status !== 'interested') {
        removeEntry(u.id, 'deadline', `comp-reg:${c.id}`);
        upsertEntry(u.id, { source_type: 'event', source_id: `comp:${c.id}`, title: c.title, kind: 'event', start_at: c.starts_at, end_at: c.ends_at, location_text: c.format === 'online' ? 'Online' : c.city, link: `/career?tab=competitions&id=${c.id}` });
      }
    }
  });
  audit(u.id, 'career.competition.entry', 'competition', c.id, { status: body.status });
  ok(res, { entry: db().get('SELECT * FROM competition_entries WHERE id = ?', id), portfolio_item_id: portfolioItemId });
}));

competitionsRouter.delete('/competitions/:id/entry', h((req, res) => {
  const u = requireUser(req);
  const id = String(req.params.id);
  const cur = db().get<EntryRow>('SELECT * FROM competition_entries WHERE competition_id = ? AND student_id = ?', id, u.id);
  if (!cur) throw notFound('No entry for this competition');
  db().tx(() => {
    db().run('DELETE FROM competition_entries WHERE id = ?', cur.id);
    removeEntry(u.id, 'deadline', `comp-reg:${id}`);
    removeEntry(u.id, 'event', `comp:${id}`);
  });
  audit(u.id, 'career.competition.withdraw', 'competition', id, {});
  ok(res, { deleted: true });
}));

// ------------------------------------------------------------------ live feed (real, optional)
interface CfContest { id: number; name: string; type: string; phase: string; durationSeconds: number; startTimeSeconds?: number }
let cfCache: { at: number; items: unknown[] } | null = null;

/** Upcoming Codeforces rounds from the public API (no key), cached for an hour. Links out; nothing is registered here. */
competitionsRouter.get('/competitions-live', h(async (_req, res) => {
  if (process.env.NODE_ENV === 'test' || process.env.DISABLE_LIVE_FEEDS === '1') { ok(res, { source: 'codeforces', items: [], disabled: true }); return; }
  if (cfCache && Date.now() - cfCache.at < 3600_000) { ok(res, { source: 'codeforces', items: cfCache.items, cached: true }); return; }
  try {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 6000);
    const r = await fetch('https://codeforces.com/api/contest.list?gym=false', { signal: ctrl.signal, headers: { 'user-agent': 'UniJourney-demo' } }).finally(() => clearTimeout(timer));
    const data = (await r.json()) as { status: string; result?: CfContest[] };
    const items = (data.result ?? []).filter((c) => c.phase === 'BEFORE' && c.startTimeSeconds).sort((a, b) => (a.startTimeSeconds ?? 0) - (b.startTimeSeconds ?? 0)).slice(0, 6)
      .map((c) => ({ id: `cf-${c.id}`, title: c.name, starts_at: new Date((c.startTimeSeconds ?? 0) * 1000).toISOString(), duration_min: Math.round(c.durationSeconds / 60), url: `https://codeforces.com/contests/${c.id}` }));
    cfCache = { at: Date.now(), items };
    ok(res, { source: 'codeforces', items });
  } catch (e) {
    ok(res, { source: 'codeforces', items: [], error: e instanceof Error ? e.message : String(e) });
  }
}));

// ------------------------------------------------------------------ seed
export function seedCompetitions(studentId: string) {
  const d = db();
  const now = nowIso();
  const comp = (c: Omit<CompetitionRow, 'created_at' | 'source' | 'skills'> & { skills: string[]; source?: string }) => d.insert('competitions', { ...c, skills: j(c.skills), source: c.source ?? 'yu', created_at: now });
  comp({ id: 'comp_farq_2026', title: 'Farq Hackathon · Student Journey track', organiser: 'Al Yamamah University', kind: 'hackathon', scope: 'yu', format: 'hybrid', city: 'Riyadh', registration_opens: '2026-09-01', registration_deadline: '2026-10-10', starts_at: '2026-10-15T09:00:00+03:00', ends_at: '2026-10-16T18:00:00+03:00', team_min: 2, team_max: 5, eligibility: 'Current YU students; teams of 2–5.', prizes: 'Awards for the top three teams in each track', fee: '', url: 'https://www.farq-hackathon-yu.com/tracks/student-journey', skills: ['JavaScript', 'UX', 'Pitching'], description: 'A build sprint on student-journey challenges. Teams prototype, demo to judges and pitch. Mentors attend both days.' });
  comp({ id: 'comp_ux_sprint', title: 'Campus UX Design Sprint', organiser: 'GDG on Campus – Al Yamamah', kind: 'design', scope: 'yu', format: 'onsite', city: 'Riyadh', registration_opens: '2026-09-15', registration_deadline: '2026-10-03', starts_at: '2026-10-08T16:00:00+03:00', ends_at: '2026-10-09T20:00:00+03:00', team_min: 1, team_max: 3, eligibility: 'Open to all YU students. No design experience needed.', prizes: 'Mentoring sessions with a product design team', fee: '', url: null, skills: ['UX', 'Figma', 'User Research', 'Prototyping'], description: 'Two evenings to research, sketch and test a better way to book study rooms. Judged on evidence from real users.' });
  comp({ id: 'comp_case', title: 'YU Business Case Challenge', organiser: 'YU College of Business Administration', kind: 'case', scope: 'yu', format: 'onsite', city: 'Riyadh', registration_opens: '2026-09-20', registration_deadline: '2026-10-12', starts_at: '2026-10-22T10:00:00+03:00', ends_at: '2026-10-22T16:00:00+03:00', team_min: 2, team_max: 4, eligibility: 'Mixed teams from any college are encouraged.', prizes: 'Internship interviews with partner companies', fee: '', url: null, skills: ['Pitching', 'Project management', 'Power BI'], description: 'Teams get a real retail case in the morning and present a recommendation to a panel in the afternoon.' });
  comp({ id: 'comp_data', title: 'Riyadh Open Data Challenge', organiser: 'Riyadh AI Lab', kind: 'ai_data', scope: 'saudi', format: 'online', city: '', registration_opens: '2026-09-10', registration_deadline: '2026-10-30', starts_at: '2026-11-01T09:00:00+03:00', ends_at: '2026-11-30T23:00:00+03:00', team_min: 1, team_max: 3, eligibility: 'Undergraduate students at Saudi universities.', prizes: 'Cash prizes and cloud credits', fee: '', url: null, skills: ['Python', 'Machine Learning', 'Statistics'], description: 'Build a model on open mobility data and explain it. A leaderboard runs for four weeks; the top ten present.' });
  comp({ id: 'comp_cpc', title: 'Riyadh Collegiate Programming Contest', organiser: 'Collegiate Programming Contest Committee', kind: 'programming', scope: 'saudi', format: 'onsite', city: 'Riyadh', registration_opens: '2026-09-15', registration_deadline: '2026-10-20', starts_at: '2026-11-07T09:00:00+03:00', ends_at: '2026-11-07T14:00:00+03:00', team_min: 3, team_max: 3, eligibility: 'Teams of three undergraduate students with a university coach.', prizes: 'Top teams advance to the regional round', fee: '', url: null, skills: ['Algorithms', 'C++', 'Problem Solving'], description: 'Five hours of algorithmic problems, one computer per team. Registration goes through the university coach.' });
  comp({ id: 'comp_ctf', title: 'YU Cyber CTF', organiser: 'YU Cybersecurity Club', kind: 'cyber', scope: 'yu', format: 'online', city: '', registration_opens: '2026-10-05', registration_deadline: '2026-11-01', starts_at: '2026-11-05T18:00:00+03:00', ends_at: '2026-11-06T18:00:00+03:00', team_min: 1, team_max: 4, eligibility: 'YU students; beginners welcome.', prizes: 'Certificates for all finishers', fee: '', url: null, skills: ['Cybersecurity', 'Linux', 'Networking'], description: 'A 24-hour jeopardy-style capture-the-flag with web, crypto and forensics challenges.' });
  comp({ id: 'comp_winter', title: 'Winter Programming Marathon', organiser: 'YU Competitive Programming Club', kind: 'programming', scope: 'yu', format: 'onsite', city: 'Riyadh', registration_opens: '2026-11-15', registration_deadline: '2026-12-01', starts_at: '2026-12-10T09:00:00+03:00', ends_at: '2026-12-10T15:00:00+03:00', team_min: 1, team_max: 1, eligibility: 'Individual contest for YU students.', prizes: 'Club awards', fee: '', url: null, skills: ['Algorithms', 'Problem Solving'], description: 'Individual practice contest before the regional season.' });
  comp({ id: 'comp_spring_2026', title: 'YU Spring Hackathon 2026', organiser: 'Al Yamamah University', kind: 'hackathon', scope: 'yu', format: 'onsite', city: 'Riyadh', registration_opens: '2026-02-01', registration_deadline: '2026-03-01', starts_at: '2026-03-10T09:00:00+03:00', ends_at: '2026-03-11T18:00:00+03:00', team_min: 2, team_max: 5, eligibility: 'Current YU students.', prizes: 'Awards for the top three teams', fee: '', url: null, skills: ['React', 'Node.js', 'UX'], description: 'A campus-services build weekend. Teams shipped working prototypes for facility booking and lost property.' });

  // Sara: a past result (becomes a verified award) and one open competition she is interested in.
  const eid = newId('ce');
  const pf = recordVerifiedAward(studentId, { title: '2nd place · YU Spring Hackathon 2026', org: 'Al Yamamah University', date: '2026-03-11', description: 'Campus services track: a room-booking prototype with live availability.', skills: ['React', 'Node.js', 'UX'], ref: 'competition:comp_spring_2026' });
  d.insert('competition_entries', { id: eid, competition_id: 'comp_spring_2026', student_id: studentId, status: 'result', team_name: 'Najd Builders', result: '2nd place', portfolio_item_id: pf, created_at: now, updated_at: now });
  d.insert('competition_entries', { id: newId('ce'), competition_id: 'comp_farq_2026', student_id: studentId, status: 'interested', team_name: null, result: null, portfolio_item_id: null, created_at: now, updated_at: now });
  upsertEntry(studentId, { source_type: 'deadline', source_id: 'comp-reg:comp_farq_2026', title: 'Registration closes: Farq Hackathon · Student Journey track', kind: 'deadline', start_at: '2026-10-10T20:00:00+03:00', end_at: '2026-10-10T21:00:00+03:00', link: '/career?tab=competitions&id=comp_farq_2026' });
}
