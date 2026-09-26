import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { freshDb, startServer, type TestServer } from './helpers.ts';
import { db, j } from '../server/core/db.ts';
import { newId } from '../server/core/ids.ts';
import { nowIso } from '../server/core/clock.ts';
import { computeDegreeAudit } from '../server/modules/academics/audit.ts';

interface Bucket { earned_credits: number; planned_credits: number; in_progress_credits: number; courses: Array<{ code: string; credits: number; status: string }> }
interface AuditRes { audit: { earned: number; planned: number; in_progress: number; remaining: number; total_required: number; buckets: Bucket[]; unmet: unknown[]; estimate: { assumptions: string } | null }; clearances: Array<{ key: string; status: string }>; coop: { code: string; status: string }; blockers: Array<{ key: string; message: string }>; canRequest: boolean; request: { status: string } | null }

let s: TestServer;
beforeAll(async () => {
  freshDb();
  // If the academics curriculum seed is not present (built in parallel), install a minimal BSE fixture so the audit has
  // real requirements: three completed courses, one planned, CIS 490 missing.
  if (db().count('degree_requirements', "program_id = 'bse'") === 0) {
    const courses = [['CIS 491', 'Graduation Project I', 3], ['CIS 492', 'Graduation Project II', 3], ['SWE 401', 'Software Quality Assurance', 3], ['SWE 410', 'Exit Exam Preparation', 1], ['CIS 490', 'Cooperative Assignment', 6]] as const;
    for (const [code, title, cr] of courses) if (!db().get('SELECT code FROM courses WHERE code = ?', code)) db().insert('courses', { code, title_en: title, title_ar: '', credits: cr, dept: 'CIS', level: 8, prereqs: '[]', coreqs: '[]', min_credits: 0, category: 'core', description_en: '', source: 'test-fixture' });
    db().insert('degree_requirements', { id: 'req_test_core', program_id: 'bse', category: 'core', label_en: 'College core (test fixture)', label_ar: 'متطلبات الكلية', required_credits: 16, course_codes: j(['CIS 491', 'CIS 492', 'SWE 401', 'SWE 410', 'CIS 490']), min_courses: 0, sort: 1 });
    const t = (code: string, status: string, term: string, credits: number, grade: string | null) => db().insert('transcript_entries', { id: newId('tr'), student_id: 'u_graduating', course_code: code, term, status, grade, credits, section_id: null, evidence: null, created_at: nowIso() });
    t('CIS 491', 'completed', '2025-2', 3, 'A'); t('CIS 492', 'completed', '2026-1', 3, 'B+'); t('SWE 401', 'completed', '2026-1', 3, 'A-'); t('SWE 410', 'planned', '2026-2', 1, null);
  }
  s = await startServer();
});
afterAll(async () => { await s.close(); });

describe('graduation journey', () => {
  const noura = () => s.as('u_graduating');

  it('audit shows an unmet requirement, never counts planned/enrolled credits and blocks the request', async () => {
    const r = await noura().get<AuditRes>('/graduation/audit');
    expect(r.status).toBe(200);
    const a = r.body.data!.audit;
    expect(a.total_required).toBeGreaterThan(0);
    expect(a.remaining).toBeGreaterThan(0);
    expect(a.buckets.length).toBeGreaterThan(0);
    for (const b of a.buckets) {
      const earned = b.courses.filter((c) => c.status === 'completed' || c.status === 'equivalent').reduce((x, c) => x + c.credits, 0);
      const notEarned = b.courses.filter((c) => c.status === 'planned' || c.status === 'enrolled').reduce((x, c) => x + c.credits, 0);
      expect(b.earned_credits).toBeLessThanOrEqual(earned);
      expect(b.planned_credits + b.in_progress_credits).toBe(notEarned);
    }
    expect(r.body.data!.coop.code).toBe('CIS 490');
    expect(r.body.data!.canRequest).toBe(false);
    expect(r.body.data!.blockers.some((b) => b.key === 'credits')).toBe(true);
    expect(r.body.data!.clearances.find((c) => c.key === 'finance')!.status).toBe('pending');
    expect(r.body.data!.audit.estimate?.assumptions).toMatch(/Assumes/);
    // adding a planned entry for a missing course changes planned, not earned
    const missing = a.buckets.flatMap((b) => b.courses).find((c) => c.status === 'missing');
    expect(missing).toBeTruthy();
    db().insert('transcript_entries', { id: newId('tr'), student_id: 'u_graduating', course_code: missing!.code, term: '2027-1', status: 'planned', grade: null, credits: missing!.credits, section_id: null, evidence: null, created_at: nowIso() });
    const after = computeDegreeAudit('u_graduating');
    expect(after.earned).toBe(a.earned);
    expect(after.planned).toBe(a.planned + missing!.credits);
    expect(after.remaining).toBe(a.remaining);
    db().run("DELETE FROM transcript_entries WHERE student_id = 'u_graduating' AND course_code = ? AND term = '2027-1'", missing!.code);
    const blocked = await noura().post('/graduation/requests');
    expect(blocked.status).toBe(422);
    const reasons = (blocked.body.error!.details as { reasons: string[] }).reasons;
    expect(reasons.some((x) => /credit/.test(x))).toBe(true);
    expect(reasons.some((x) => /Finance/.test(x))).toBe(true);
  });

  it('demo fixture fulfils the unmet requirement; clearances then allow a demo request with a receipt', async () => {
    let remaining = (await noura().get<AuditRes>('/graduation/audit')).body.data!.audit.remaining;
    for (let i = 0; i < 60 && remaining > 0; i++) {
      const f = await noura().post<AuditRes & { simulated: boolean; course: string }>('/graduation/demo/fulfil-requirement');
      expect(f.status).toBe(200);
      expect(f.body.data!.simulated).toBe(true);
      remaining = f.body.data!.audit.remaining;
    }
    expect(remaining).toBe(0);
    const fixtures = db().all("SELECT course_code, evidence FROM transcript_entries WHERE student_id = 'u_graduating' AND status = 'equivalent' AND evidence LIKE '%demo fixture%'");
    expect(fixtures.length).toBeGreaterThan(0);
    expect(fixtures.some((e) => e.course_code === 'CIS 490')).toBe(true); // the co-op milestone is fulfilled first
    const stillBlocked = await noura().post('/graduation/requests');
    expect(stillBlocked.status).toBe(422);
    expect((stillBlocked.body.error!.details as { reasons: string[] }).reasons.every((x) => !/credit/.test(x))).toBe(true);
    const cleared = await noura().post<AuditRes>('/graduation/demo/clear-clearances');
    expect(cleared.body.data!.canRequest).toBe(true);
    const req = await noura().post<{ request: { status: string; audit_snapshot: { remaining: number } }; receipt: { ref: string; simulated: boolean; label: string } }>('/graduation/requests');
    expect(req.status).toBe(201);
    expect(req.body.data!.receipt.ref).toMatch(/^GRD-/);
    expect(req.body.data!.receipt.simulated).toBe(true);
    expect(req.body.data!.request.status).toBe('submitted');
    expect(req.body.data!.request.audit_snapshot.remaining).toBe(0);
    expect((await noura().post('/graduation/requests')).status).toBe(422); // already submitted
    const mine = await noura().get<{ items: Array<{ status: string }> }>('/graduation/requests/mine');
    expect(mine.body.data!.items.length).toBe(1);
  });

  it('registrar role is required; approval notifies the student with the career handoff link', async () => {
    expect((await s.as('u_student').get('/graduation/review/requests')).status).toBe(403);
    expect((await s.as('u_student').post('/graduation/clearances/finance/clear', { studentId: 'u_graduating' })).status).toBe(403);
    expect((await s.as('u_reviewer').get('/graduation/review/requests')).status).toBe(403);
    const reg = s.as('u_admissions');
    const q = await reg.get<{ items: Array<{ id: string; status: string; student: { id: string } }> }>('/graduation/review/requests');
    expect(q.status).toBe(200);
    const item = q.body.data!.items.find((r) => r.student.id === 'u_graduating')!;
    expect(item.status).toBe('submitted');
    const detail = await reg.get<{ live_audit: { remaining: number } }>('/graduation/review/requests/' + item.id);
    expect(detail.body.data!.live_audit.remaining).toBe(0);
    expect((await reg.post('/graduation/review/requests/' + item.id + '/decision', { decision: 'approved', note: 'x' })).status).toBe(400); // note too short
    const dec = await reg.post<{ status: string }>('/graduation/review/requests/' + item.id + '/decision', { decision: 'approved', note: 'Audit verified against the study plan (demo).' });
    expect(dec.status).toBe(200);
    expect(dec.body.data!.status).toBe('approved');
    const n = db().get("SELECT title, link FROM notifications WHERE user_id = 'u_graduating' AND kind = 'approved'")!;
    expect(n.title).toMatch(/career handoff ready/);
    expect(n.link).toBe('/career?handoff=1');
    expect((await reg.post('/graduation/review/requests/' + item.id + '/decision', { decision: 'rejected', note: 'too late' })).status).toBe(409);
    const handoff = await noura().get<{ graduation: { status: string }; checklist: Array<{ key: string; done: boolean }> }>('/career/handoff');
    expect(handoff.body.data!.graduation.status).toBe('approved');
    expect(handoff.body.data!.checklist.find((c) => c.key === 'coop_evidence')!.done).toBe(true);
  });

  it('registrar can clear a clearance for a student', async () => {
    const r = await s.as('u_admissions').post<{ items: Array<{ key: string; status: string; cleared_by: string }> }>('/graduation/clearances/finance/clear', { studentId: 'u_student', note: 'Cleared in test' });
    expect(r.status).toBe(200);
    expect(r.body.data!.items.find((c) => c.key === 'finance')).toMatchObject({ status: 'cleared', cleared_by: 'u_admissions' });
  });
});
