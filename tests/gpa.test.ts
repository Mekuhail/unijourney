import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { freshDb, startServer, type TestServer } from './helpers.ts';
import { db } from '../server/core/db.ts';
import { registeredMigrations, runMigrations } from '../server/core/migrations.ts';
import { setSetting } from '../server/core/settings.ts';
import { academicRecord } from '../server/modules/career/portfolio.ts';
import {
  YU_POLICY, computeGpa, roundGpa, letterForPercent, estimateCourse, neededOnRemaining, requiredAverage, targetStatus,
  type CourseInput, type GradeComponent, type GradeRow
} from '../shared/gpa.ts';

const row = (course_code: string, grade: string | null, credits = 3, term = '2025-1', status = 'completed'): GradeRow => ({ course_code, grade, credits, term, status });
const comp = (name: string, weight: number | null, score: { earned?: number; max?: number; percent?: number } = {}): GradeComponent =>
  ({ id: name, name, category: 'other', weight, earned: score.earned ?? null, max: score.max ?? null, percent: score.percent ?? null });
const course = (components: GradeComponent[], extra: Partial<CourseInput> = {}): CourseInput =>
  ({ id: 'c', code: 'CIS 321', title: 'Operating Systems', credits: 3, mode: 'components', finalGrade: null, finalPercent: null, components, assumeRemaining: null, passFail: false, ...extra });

describe('YU grade policy', () => {
  it('uses the published letters, marks and points', () => {
    expect(YU_POLICY.points).toMatchObject({ 'A+': 4, A: 3.75, 'B+': 3.5, B: 3, 'C+': 2.5, C: 2, 'D+': 1.5, D: 1, F: 0 });
    expect(YU_POLICY.points['A-']).toBeUndefined();
    expect([95, 94.99, 90, 89.5, 85, 80, 75, 70, 65, 60, 59.99].map((p) => letterForPercent(p))).toEqual(['A+', 'A', 'A', 'B+', 'B+', 'B', 'C+', 'C', 'D+', 'D', 'F']);
  });

  it('weights by GPA-eligible credits and leaves pass, transfer, zero-credit and withdrawn courses out of the denominator', () => {
    const r = computeGpa([row('CIS 103', 'A+', 4), row('ENG 101', 'B', 3), row('CSK 001', 'A', 0), row('PE 101', 'P', 2), row('MTH 100', 'TR', 3, '2023-1', 'equivalent'), row('HIS 101', 'W', 3)]);
    expect(r.raw).toBeCloseTo((4 * 4 + 3 * 3) / 7, 10);
    expect(r.gpa).toBe(3.57);
    expect(r.gpaCredits).toBe(7);
    expect(r.earnedCredits).toBe(4 + 3 + 2 + 3);
    expect(r.excluded.map((x) => [x.row.course_code, x.reason])).toEqual([['CSK 001', 'zero_credit'], ['PE 101', 'credit_only'], ['MTH 100', 'credit_only'], ['HIS 101', 'no_credit']]);
  });

  it('never turns a missing grade into zero', () => {
    const r = computeGpa([row('CIS 103', 'A', 3), row('CIS 321', null, 3, '2026-1', 'enrolled')]);
    expect(r.gpa).toBe(3.75);
    expect(r.gpaCredits).toBe(3);
    expect(r.excluded[0].reason).toBe('no_grade');
    expect(computeGpa([row('CIS 321', null)]).gpa).toBeNull();
  });

  it('counts every attempt of a repeated course (YU), with latest and highest available as settings', () => {
    const rows = [row('MTH 104', 'F', 3, '2024-1'), row('MTH 104', 'B+', 3, '2024-2'), row('CIS 103', 'A', 3)];
    const all = computeGpa(rows);
    expect(all.gpaCredits).toBe(9);
    expect(all.raw).toBeCloseTo((0 + 3.5 * 3 + 3.75 * 3) / 9, 10);
    expect(all.earnedCredits).toBe(6); // the course is earned once
    const latest = computeGpa(rows, { ...YU_POLICY, repeat: 'latest' });
    expect(latest.gpaCredits).toBe(6);
    expect(latest.excluded.find((x) => x.reason === 'repeat_replaced')!.row.grade).toBe('F');
    const highest = computeGpa([row('X', 'B', 3, '2024-2'), row('X', 'C', 3, '2025-1')], { ...YU_POLICY, repeat: 'highest' });
    expect(highest.gpa).toBe(3);
  });

  it('rounds at the policy boundary without floating-point surprises', () => {
    expect(roundGpa(3.745)).toBe(3.75);
    expect(roundGpa(3.745, { rounding: 'truncate', decimals: 2 })).toBe(3.74);
    expect(roundGpa(3.7499999)).toBe(3.75);
  });
});

describe('course estimates from assessment components', () => {
  it('combines earned/max and direct percentages by weight, projecting the rest at the average so far', () => {
    const e = estimateCourse(course([comp('Midterm', 30, { earned: 42, max: 50 }), comp('Quiz 1', 10, { percent: 90 }), comp('Project', 20), comp('Final', 40)]));
    expect(e.status).toBe('partial');
    expect(e.gradedWeight).toBe(40);
    expect(e.soFar).toBe(85.5); // (30×84 + 10×90) / 40
    expect(e.projected).toBe(85.5);
    expect(e.assumption).toBe('same_as_so_far');
    expect(e.min).toBe(34.2); // everything left at 0 %
    expect(e.max).toBe(94.2); // everything left at 100 %
    expect(e.letter).toBe('B+');
    expect(e.points).toBe(3.5);
  });

  it('uses an explicit assumption for the remaining work when given', () => {
    const e = estimateCourse(course([comp('Midterm', 50, { percent: 80 }), comp('Final', 50)], { assumeRemaining: 100 }));
    expect(e.projected).toBe(90);
    expect(e.letter).toBe('A');
  });

  it('reports an incomplete plan (weights under 100, a missing weight) separately from an impossible one (over 100)', () => {
    const under = estimateCourse(course([comp('Midterm', 30, { percent: 70 }), comp('Final', 50), comp('Lab', null)]));
    expect(under.status).toBe('partial');
    expect(under.issues.map((i) => i.code)).toEqual(['missing_weight', 'weights_under']);
    const over = estimateCourse(course([comp('Midterm', 60, { percent: 70 }), comp('Final', 50)]));
    expect(over.status).toBe('invalid');
    expect(over.projected).toBeNull();
    expect(over.issues[0]).toEqual({ code: 'weights_over', total: 110 });
  });

  it('keeps an ungraded course out of every figure instead of scoring it zero', () => {
    const e = estimateCourse(course([comp('Midterm', 40), comp('Final', 60)]));
    expect(e.status).toBe('empty');
    expect(e.projected).toBeNull();
    expect(e.points).toBeNull();
    expect(estimateCourse(course([], { mode: 'none' })).points).toBeNull();
  });

  it('accepts a manually entered final grade (letter or percentage) and flags unknown letters', () => {
    expect(estimateCourse(course([], { mode: 'final', finalGrade: 'B+' })).points).toBe(3.5);
    expect(estimateCourse(course([], { mode: 'final', finalPercent: 91 })).letter).toBe('A');
    expect(estimateCourse(course([], { mode: 'final', finalGrade: 'A-' })).status).toBe('invalid');
  });

  it('says what is needed on the remaining work for a target letter', () => {
    const c = course([comp('Midterm', 40, { percent: 80 }), comp('Final', 60)]);
    expect(neededOnRemaining(c, 'A')).toEqual({ state: 'possible', percent: 96.67 }); // (90 − 32) / 60
    expect(neededOnRemaining(c, 'A+').state).toBe('impossible');
    expect(neededOnRemaining(course([comp('All', 100, { percent: 97 })]), 'A').state).toBe('secured');
  });
});

describe('cumulative targets', () => {
  it('says a target is impossible when it needs more than 4.0 on every remaining credit', () => {
    const r = requiredAverage({ points: 3.5 * 60, credits: 60 }, 30, 3.75); // (3.75 × 90 − 210) / 30 = 4.25
    expect(r.state).toBe('impossible');
    expect(r.average).toBeCloseTo(4.25, 10);
  });

  it('distinguishes possible, impossible, already-secured and no-credit cases', () => {
    const known = { points: 3.5 * 60, credits: 60 };
    expect(requiredAverage(known, 30, 3.6)).toMatchObject({ state: 'possible' });
    expect(requiredAverage(known, 30, 3.6).average).toBeCloseTo(3.8, 10);
    expect(requiredAverage(known, 30, 3.9).state).toBe('impossible');
    expect(requiredAverage(known, 30, 2.0).state).toBe('secured');
    expect(requiredAverage(known, 0, 3.75).state).toBe('no_credits');
    expect(requiredAverage(known, 30, 3.6).range).toEqual([210 / 90, 330 / 90]);
  });

  it('classifies target status exactly at the boundaries', () => {
    expect(targetStatus(3.749, 3.75)).toBe('close'); // rounds to 3.75: meets the line
    expect(targetStatus(3.744, 3.75)).toBe('below');
    expect(targetStatus(3.75, 3.75)).toBe('close');
    expect(targetStatus(3.849, 3.75)).toBe('on_track'); // 3.85 = target + 0.10
    expect(targetStatus(3.84, 3.75)).toBe('close');
    expect(targetStatus(3.29, 3.3)).toBe('below');
  });
});

describe('one grade policy across the app', () => {
  let s: TestServer;
  beforeAll(async () => { freshDb(); s = await startServer(); });
  afterAll(async () => { await s.close(); });

  it('seeds YU letters only, and the portfolio GPA uses the shared policy', () => {
    const letters = db().all<{ grade: string }>('SELECT DISTINCT grade FROM transcript_entries WHERE grade IS NOT NULL').map((r) => r.grade).sort();
    expect(letters.every((g) => g in YU_POLICY.points || YU_POLICY.creditOnly.includes(g))).toBe(true);
    const rows = db().all<GradeRow>("SELECT course_code, term, credits, grade, status FROM transcript_entries WHERE student_id = 'u_student' AND status = 'completed'");
    expect(academicRecord('u_student').gpa).toBe(computeGpa(rows).gpa);
  });

  it('relabels an old A/A- transcript to YU letters without changing any GPA', () => {
    const before = academicRecord('u_student').gpa;
    db().exec("UPDATE transcript_entries SET grade = CASE grade WHEN 'A' THEN 'A-' WHEN 'A+' THEN 'A' ELSE grade END WHERE grade IN ('A', 'A+')");
    expect(db().count('transcript_entries', "grade = 'A-'")).toBeGreaterThan(0);
    setSetting('migrations_applied', registeredMigrations().filter((id) => id !== 'grades-yu-scale-v1'));
    expect(runMigrations(db())).toEqual(['grades-yu-scale-v1']);
    expect(db().count('transcript_entries', "grade = 'A-'")).toBe(0);
    expect(academicRecord('u_student').gpa).toBe(before);
    expect(runMigrations(db())).toEqual([]);
  });
});
