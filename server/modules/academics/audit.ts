import { db, pj } from '../../core/db.ts';
import { getPolicies } from '../../core/settings.ts';

/**
 * Degree audit contract shared with the graduation module. Planned/enrolled credits are never counted as earned.
 * The academics module owns curriculum semantics and may refine this implementation; keep the signature stable.
 */
export interface AuditBucket {
  id: string;
  category: string;
  label_en: string;
  label_ar: string;
  required_credits: number;
  earned_credits: number;      // completed + approved equivalents
  in_progress_credits: number; // enrolled this term
  planned_credits: number;     // planned (not counted)
  remaining_credits: number;
  courses: Array<{ code: string; title_en: string; credits: number; status: 'completed' | 'equivalent' | 'enrolled' | 'planned' | 'missing' | 'failed' | 'withdrawn'; term?: string; grade?: string | null }>;
}
export interface DegreeAudit {
  student_id: string;
  program_id: string | null;
  total_required: number;
  earned: number;
  in_progress: number;
  planned: number;
  remaining: number;
  buckets: AuditBucket[];
  unmet: Array<{ bucket: string; remaining_credits: number; suggestions: string[] }>;
  estimate: { terms_remaining: number; assumptions: string; earliest_completion_term: string } | null;
  generated_at: string;
}

const EARNED = new Set(['completed', 'equivalent']);

export function computeDegreeAudit(studentId: string): DegreeAudit {
  const user = db().get('SELECT program_id FROM users WHERE id = ?', studentId);
  const programId = (user?.program_id as string | null) ?? null;
  const reqs = programId ? db().all('SELECT * FROM degree_requirements WHERE program_id = ? ORDER BY sort', programId) : [];
  const entries = db().all('SELECT * FROM transcript_entries WHERE student_id = ? ORDER BY term', studentId);
  const courses = new Map(db().all('SELECT code, title_en, credits FROM courses').map((c) => [c.code as string, c]));
  const best = new Map<string, typeof entries[number]>();
  for (const e of entries) {
    const prev = best.get(e.course_code as string);
    const rank = (s: string) => (EARNED.has(s) ? 3 : s === 'enrolled' ? 2 : s === 'planned' ? 1 : 0);
    if (!prev || rank(e.status as string) > rank(prev.status as string)) best.set(e.course_code as string, e);
  }
  const used = new Set<string>();
  const buckets: AuditBucket[] = reqs.map((r) => {
    const codes = pj<string[]>(r.course_codes, []);
    const b: AuditBucket = { id: r.id as string, category: r.category as string, label_en: r.label_en as string, label_ar: r.label_ar as string, required_credits: r.required_credits as number, earned_credits: 0, in_progress_credits: 0, planned_credits: 0, remaining_credits: 0, courses: [] };
    const isElectivePool = codes.length === 0 || (r.min_courses as number) > 0;
    const candidates = codes.length ? codes : [...best.keys()].filter((c) => !used.has(c));
    for (const code of candidates) {
      const e = best.get(code);
      const c = courses.get(code);
      const credits = (e?.credits as number | undefined) ?? (c?.credits as number | undefined) ?? 0;
      if (e && !used.has(code)) {
        const st = e.status as AuditBucket['courses'][number]['status'];
        if (EARNED.has(st)) { if (b.earned_credits + credits <= b.required_credits || !isElectivePool) { b.earned_credits += credits; used.add(code); b.courses.push({ code, title_en: (c?.title_en as string) ?? code, credits, status: st, term: e.term as string, grade: (e.grade as string | null) ?? null }); } }
        else if (st === 'enrolled') { b.in_progress_credits += credits; used.add(code); b.courses.push({ code, title_en: (c?.title_en as string) ?? code, credits, status: st, term: e.term as string }); }
        else if (st === 'planned') { b.planned_credits += credits; used.add(code); b.courses.push({ code, title_en: (c?.title_en as string) ?? code, credits, status: st, term: e.term as string }); }
        else { b.courses.push({ code, title_en: (c?.title_en as string) ?? code, credits, status: st, term: e.term as string, grade: (e.grade as string | null) ?? null }); }
      } else if (codes.length && !e) {
        b.courses.push({ code, title_en: (c?.title_en as string) ?? code, credits, status: 'missing' });
      }
    }
    b.remaining_credits = Math.max(0, b.required_credits - b.earned_credits);
    return b;
  });
  const totalRequired = reqs.length ? reqs.reduce((s, r) => s + (r.required_credits as number), 0) : getPolicies().graduationCredits.value;
  const earned = buckets.reduce((s, b) => s + b.earned_credits, 0);
  const inProgress = buckets.reduce((s, b) => s + b.in_progress_credits, 0);
  const planned = buckets.reduce((s, b) => s + b.planned_credits, 0);
  const remaining = Math.max(0, totalRequired - earned);
  const unmet = buckets.filter((b) => b.remaining_credits > 0).map((b) => ({ bucket: b.label_en, remaining_credits: b.remaining_credits, suggestions: b.courses.filter((c) => c.status === 'missing').slice(0, 4).map((c) => c.code) }));
  const perTerm = 16;
  const afterCurrent = Math.max(0, remaining - inProgress);
  const termsRemaining = remaining === 0 ? 0 : 1 + Math.ceil(afterCurrent / perTerm);
  return {
    student_id: studentId, program_id: programId, total_required: totalRequired, earned, in_progress: inProgress, planned, remaining, buckets, unmet,
    estimate: remaining === 0 ? null : { terms_remaining: termsRemaining, assumptions: `Assumes current enrolment completes and ~${perTerm} credits per term with all required courses offered (demo estimate).`, earliest_completion_term: termsRemaining <= 1 ? '2026-1' : termsRemaining === 2 ? '2026-2' : termsRemaining === 3 ? '2027-1' : '2027-2' },
    generated_at: new Date().toISOString()
  };
}
