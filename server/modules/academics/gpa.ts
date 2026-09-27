import { Router } from 'express';
import { z } from 'zod';
import { db, j, pj } from '../../core/db.ts';
import { h, ok, parse, conflict } from '../../core/http.ts';
import { requireCapability } from '../../core/auth.ts';
import { nowIso } from '../../core/clock.ts';
import { audit } from '../../core/audit.ts';
import { CURRENT_TERM } from '../../core/settings.ts';
import { computeGpa, YU_POLICY, POLICY_SOURCES, YU_EXCELLENCE_SCHOLARSHIP, YU_GPA_MARKERS, type GradeRow } from '../../../shared/gpa.ts';
import { termLabel } from './common.ts';
import { computeDegreeAudit } from './audit.ts';

/**
 * GPA planner. The transcript is the read-only baseline (official GPA); the student's current-course estimates and
 * future what-if scenarios are one private document per student, versioned so two tabs cannot overwrite each other.
 * Nothing here changes the transcript, and nothing is shared with anyone.
 */
export const gpaRouter = Router();

const num = (min: number, max: number) => z.number().finite().min(min).max(max);
const id = z.string().min(1).max(40);
const letter = z.string().trim().max(3);

const component = z.object({
  id, name: z.string().trim().min(1).max(60),
  category: z.enum(['midterm', 'quiz', 'assignment', 'project', 'lab', 'presentation', 'participation', 'final', 'other']),
  weight: num(0, 100).nullable(), earned: num(0, 10000).nullable(), max: num(0, 10000).nullable(), percent: num(0, 150).nullable()
});
const currentCourse = z.object({
  id, code: z.string().trim().max(12), title: z.string().trim().max(120), credits: num(0, 12),
  mode: z.enum(['components', 'final', 'none']), finalGrade: letter.nullable(), finalPercent: num(0, 150).nullable(),
  components: z.array(component).max(20), assumeRemaining: num(0, 100).nullable(), passFail: z.boolean(), target: letter.nullable().optional()
});
const futureCourse = z.object({ id, code: z.string().trim().max(12).nullable(), title: z.string().trim().max(120), credits: num(0, 12), grade: letter.nullable(), passFail: z.boolean(), repeatOf: z.string().trim().max(12).nullable() });
const scenario = z.object({ id, name: z.string().trim().min(1).max(60), terms: z.array(z.object({ id, label: z.string().trim().min(1).max(40), courses: z.array(futureCourse).max(12) })).max(8) });
export const planDoc = z.object({
  current: z.object({ term: z.string().max(10), courses: z.array(currentCourse).max(12) }),
  scenarios: z.array(scenario).max(6),
  activeScenario: z.string().max(40).nullable(),
  target: z.object({ kind: z.enum(['none', 'scholarship', 'marker', 'custom']), categoryId: z.string().max(40).nullable(), gpa: num(0, 4).nullable() }),
  settings: z.object({ repeat: z.enum(['all', 'latest', 'highest']), rounding: z.enum(['round', 'truncate']), headroom: num(0, 1) }),
  dismissed: z.array(z.string().max(80)).max(50)
});
export type PlanDoc = z.infer<typeof planDoc>;

function officialRows(studentId: string) {
  return db().all<GradeRow & { title_en: string | null; title_ar: string | null }>(
    `SELECT t.course_code, t.term, t.credits, t.grade, t.status, c.title_en, c.title_ar
     FROM transcript_entries t LEFT JOIN (SELECT code, MAX(title_en) AS title_en, MAX(title_ar) AS title_ar FROM courses GROUP BY code) c ON c.code = t.course_code
     WHERE t.student_id = ? AND t.status IN ('completed','equivalent','failed','withdrawn') ORDER BY t.term, t.course_code`, studentId);
}

gpaRouter.get('/gpa', h((req, res) => {
  const u = requireCapability(req, 'gpa');
  const rows = officialRows(u.id);
  const overall = computeGpa(rows, YU_POLICY);
  const terms = [...new Set(rows.map((r) => r.term))];
  const byTerm = terms.map((term) => { const r = computeGpa(rows.filter((x) => x.term === term), YU_POLICY); return { term, label: termLabel(term), gpa: r.gpa, gpaCredits: r.gpaCredits }; });
  const enrolled = db().all<{ code: string; title_en: string; title_ar: string; credits: number }>(
    `SELECT t.course_code AS code, COALESCE(c.title_en, t.course_code) AS title_en, COALESCE(c.title_ar, c.title_en, t.course_code) AS title_ar, t.credits
     FROM transcript_entries t LEFT JOIN (SELECT code, MAX(title_en) AS title_en, MAX(title_ar) AS title_ar FROM courses GROUP BY code) c ON c.code = t.course_code
     WHERE t.student_id = ? AND t.term = ? AND t.status = 'enrolled' ORDER BY t.course_code`, u.id, CURRENT_TERM);
  let remaining: number | null = null;
  try { remaining = computeDegreeAudit(u.id).remaining; } catch { remaining = null; }
  const saved = db().get<{ doc: string; version: number; updated_at: string }>('SELECT doc, version, updated_at FROM gpa_plans WHERE student_id = ?', u.id);
  const [y] = CURRENT_TERM.split('-').map(Number);
  const upcoming = [`${y}-2`, `${y + 1}-1`, `${y + 1}-2`, `${y + 2}-1`].map((t) => ({ id: t, label: termLabel(t) }));
  ok(res, {
    policy: YU_POLICY, sources: POLICY_SOURCES, scholarship: YU_EXCELLENCE_SCHOLARSHIP, markers: YU_GPA_MARKERS,
    official: {
      rows: rows.map((r) => ({ course_code: r.course_code, term: r.term, credits: r.credits, grade: r.grade, status: r.status, title_en: r.title_en ?? r.course_code, title_ar: r.title_ar ?? r.title_en ?? r.course_code })),
      gpa: overall.gpa, gpaCredits: overall.gpaCredits, earnedCredits: overall.earnedCredits,
      excluded: overall.excluded.map((x) => ({ course_code: x.row.course_code, term: x.row.term, grade: x.row.grade, reason: x.reason })),
      byTerm
    },
    current: { term: CURRENT_TERM, label: termLabel(CURRENT_TERM), courses: enrolled },
    upcoming,
    remainingCredits: remaining,
    plan: saved ? { doc: pj<PlanDoc | null>(saved.doc, null), version: saved.version, updated_at: saved.updated_at } : null
  });
}));

gpaRouter.put('/gpa', h((req, res) => {
  const u = requireCapability(req, 'gpa');
  const b = parse(z.object({ doc: planDoc, version: z.number().int().min(0) }), req.body);
  const at = nowIso();
  const out = db().tx(() => {
    const cur = db().get<{ version: number }>('SELECT version FROM gpa_plans WHERE student_id = ?', u.id);
    // Another tab or device saved in between: refuse, so neither edit silently disappears.
    if ((cur?.version ?? 0) !== b.version) throw conflict('Your GPA plan changed in another tab. Reload to see the latest version.', { version: cur?.version ?? 0 });
    const version = b.version + 1;
    db().run('INSERT INTO gpa_plans (student_id, doc, version, updated_at) VALUES (?, ?, ?, ?) ON CONFLICT(student_id) DO UPDATE SET doc = excluded.doc, version = excluded.version, updated_at = excluded.updated_at', u.id, j(b.doc), version, at);
    return { version, updated_at: at };
  });
  ok(res, out);
}));

gpaRouter.delete('/gpa', h((req, res) => {
  const u = requireCapability(req, 'gpa');
  const r = db().run('DELETE FROM gpa_plans WHERE student_id = ?', u.id);
  audit(u.id, 'academics.gpa.delete', 'gpa_plan', u.id, { deleted: Number(r.changes) });
  ok(res, { deleted: Number(r.changes) > 0 });
}));
