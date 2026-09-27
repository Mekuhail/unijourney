import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { freshDb, startServer, type TestServer } from './helpers.ts';
import { db } from '../server/core/db.ts';
import { computeDegreeAudit } from '../server/modules/academics/audit.ts';
import { REQUIREMENTS, requirementCredits, COURSES } from '../server/modules/academics/curriculum.ts';

let srv: TestServer;
beforeAll(async () => { freshDb(); srv = await startServer(); });
afterAll(async () => { await srv.close(); });

describe('curriculum and degree audit', () => {
  it('seeds both programs with buckets that sum to 142 credits', () => {
    for (const program of ['bse', 'bcne']) {
      const total = REQUIREMENTS[program].reduce((s, r) => s + requirementCredits(r), 0);
      expect(total).toBe(142);
      expect(db().count('degree_requirements', 'program_id = ?', program)).toBe(REQUIREMENTS[program].length);
    }
    expect(db().count('courses')).toBe(COURSES.length);
    expect(db().count('courses', "source LIKE 'yu.edu.sa%'")).toBe(COURSES.length);
    expect(db().count('course_sections', "term = '2026-2'")).toBeGreaterThan(50);
  });

  it('never counts enrolled or planned credits as earned and reports the unmet co-op for the graduating persona', () => {
    const sara = computeDegreeAudit('u_student');
    expect(sara.earned).toBe(91);
    expect(sara.in_progress).toBe(15);
    expect(sara.total_required).toBe(142);
    expect(sara.remaining).toBe(51);
    const noura = computeDegreeAudit('u_graduating');
    expect(noura.earned).toBe(124);
    expect(noura.in_progress).toBe(12);
    expect(noura.remaining).toBe(18);
    const college = noura.buckets.find((b) => b.category === 'college_core')!;
    expect(college.courses.find((c) => c.code === 'CIS 490')!.status).toBe('missing');
    expect(noura.unmet.some((u) => u.suggestions.includes('CIS 490'))).toBe(true);
    const hss = noura.buckets.find((b) => b.category === 'hss_elective')!;
    expect(hss.courses.find((c) => c.code === 'ENG 103')!.status).toBe('equivalent');
    expect(hss.earned_credits).toBe(6);
    // a planned entry must not move the earned total
    db().insert('transcript_entries', { id: 'tr_test_planned', student_id: 'u_graduating', course_code: 'CIS 490', term: '2026-3', status: 'planned', grade: null, credits: 6, section_id: null, evidence: null, created_at: '2026-09-27T06:00:00.000Z' });
    const after = computeDegreeAudit('u_graduating');
    expect(after.earned).toBe(124);
    expect(after.planned).toBe(6);
  });

  it('exposes the plan and audit through the API for the current student only', async () => {
    const sara = srv.as('u_student');
    const plan = await sara.get<{ terms: Array<{ courses: Array<{ code: string | null; status: string }> }>; graph: { nodes: unknown[]; edges: Array<{ from: string; to: string }> }; audit: { earned: number } }>('/academics/plan');
    expect(plan.status).toBe(200);
    const all = plan.body.data!.terms.flatMap((t) => t.courses);
    expect(all.find((c) => c.code === 'CIS 321')!.status).toBe('enrolled');
    expect(all.find((c) => c.code === 'CIS 443')!.status).toBe('available');
    expect(all.find((c) => c.code === 'CIS 492')!.status).toBe('blocked');
    expect(all.find((c) => c.code === 'PHL 101')!.status).toBe('completed');
    expect(plan.body.data!.graph.edges.some((e) => e.from === 'CIS 304' && e.to === 'CIS 321')).toBe(true);
    expect(plan.body.data!.audit.earned).toBe(91);
    const tt = await sara.get<{ sections: Array<{ course_code: string }>; credits: number }>('/academics/timetable');
    expect(tt.body.data!.sections.map((s) => s.course_code).sort()).toEqual(['CIS 316', 'CIS 321', 'SWE 302', 'SWE 312', 'SWE 322']);
    expect(tt.body.data!.credits).toBe(15);
    const course = await sara.get<{ status: string; links: { resources: string } }>('/academics/courses/CIS%20443');
    expect(course.body.data!.status).toBe('available');
    expect(course.body.data!.links.resources).toBe('/campus/resources?course=CIS%20443');
    // Role → capability matrix (shared/access.ts): academic pages are for students only.
    expect((await srv.as('u_applicant').get('/academics/overview')).status).toBe(403);
    expect((await srv.as('u_security').get('/academics/plan')).status).toBe(403);
  });
});
