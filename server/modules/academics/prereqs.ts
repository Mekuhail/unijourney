/**
 * Prerequisite chains for every college and programme (ITU Helper "prerequisite chain" idea, implemented independently).
 * Exposes a catalogue of colleges/programmes and, per programme, the plan laid out by semester with prerequisite
 * edges, so the client can draw the chain and highlight what a course requires and what it unlocks.
 */
import { Router } from 'express';
import { db, pj } from '../../core/db.ts';
import { h, ok, notFound } from '../../core/http.ts';
import { requireUser } from '../../core/auth.ts';
import { COURSES, COURSE_BY_CODE, PLANS, REQUIREMENTS, PROGRAM_PREREQS, HSS_ELECTIVES, SWE_ELECTIVES, CNE_ELECTIVES, type CourseDef, type PlanTerm, type PlanSlot, type RequirementDef } from './curriculum.ts';
import { EXTRA_PROGRAMS, COLLEGES, type ProgramDef, type ProgramCurriculum } from './curricula/index.ts';

const BUILT_IN: ProgramCurriculum[] = [
  {
    program: { id: 'bse', code: 'BSE', name_en: 'Software Engineering', name_ar: 'هندسة البرمجيات', college_id: 'coea', college_en: 'College of Engineering & Architecture', college_ar: 'كلية الهندسة والعمارة', degree: 'B.Sc. in Software Engineering', total_credits: 142, duration_years: 4, source_url: 'https://yu.edu.sa/wp-content/uploads/2026/08/SP-Software-Engineering-Study-Plan-V9.8-05Aug2026.pdf', source_version: 'Study plan V9.8 (5 Aug 2026)', source_note: 'Transcribed from the official study plan; orientation-year prerequisites omitted.', campus_ids: ['riyadh', 'khobar'] },
    courses: COURSES, plan: PLANS.bse, requirements: REQUIREMENTS.bse, electivePools: { hss: HSS_ELECTIVES, swe: SWE_ELECTIVES }
  },
  {
    program: { id: 'bcne', code: 'BCNE', name_en: 'Computer Network Engineering', name_ar: 'هندسة شبكات الحاسب', college_id: 'coea', college_en: 'College of Engineering & Architecture', college_ar: 'كلية الهندسة والعمارة', degree: 'B.Sc. in Computer Network Engineering', total_credits: 142, duration_years: 4, source_url: 'https://yu.edu.sa/wp-content/uploads/2026/08/CNE.pdf', source_version: 'Study plan V.2 (Aug 2026)', source_note: 'Transcribed from the official study plan; orientation-year prerequisites omitted. Elective pool is illustrative.', campus_ids: ['riyadh', 'khobar'] },
    courses: COURSES, plan: PLANS.bcne, requirements: REQUIREMENTS.bcne, electivePools: { hss: HSS_ELECTIVES, cne: CNE_ELECTIVES }
  }
];

export function allPrograms(): ProgramCurriculum[] {
  return [...BUILT_IN, ...EXTRA_PROGRAMS];
}

export function findProgram(id: string): ProgramCurriculum | undefined {
  return allPrograms().find((p) => p.program.id === id);
}

function courseLookup(pc: ProgramCurriculum): Map<string, CourseDef> {
  const m = new Map<string, CourseDef>();
  for (const c of pc.courses) if (!m.has(c.code)) m.set(c.code, c);
  for (const c of COURSES) if (!m.has(c.code)) m.set(c.code, c);
  return m;
}

function ruleFor(pc: ProgramCurriculum, code: string, lookup: Map<string, CourseDef>): { prereqs: string[][]; coreqs: string[][]; min_credits: number } {
  const own = pc.courses.find((c) => c.code === code);
  const override = PROGRAM_PREREQS[pc.program.id]?.[code];
  const base = own ?? lookup.get(code) ?? COURSE_BY_CODE.get(code);
  return { prereqs: override?.prereqs ?? own?.prereqs ?? base?.prereqs ?? [], coreqs: own?.coreqs ?? base?.coreqs ?? [], min_credits: override?.min_credits ?? own?.min_credits ?? base?.min_credits ?? 0 };
}

export interface ChainCourse {
  code: string; title_en: string; title_ar: string; credits: number; category: string; description_en: string;
  prereqs: string[][]; coreqs: string[][]; min_credits: number; year: number; sem: number; elective?: { kind: string; label_en: string; label_ar: string; pool: string[] } | null;
  unlocks: string[]; depth: number; in_program: boolean;
}

export function buildChain(pc: ProgramCurriculum) {
  const lookup = courseLookup(pc);
  const terms: Array<{ year: number; sem: number; label_en: string; label_ar: string; credits: number; slots: ChainCourse[] }> = [];
  const nodes = new Map<string, ChainCourse>();
  let electiveIdx = 0;
  for (const term of pc.plan as PlanTerm[]) {
    const slots: ChainCourse[] = [];
    for (const slot of term.slots as PlanSlot[]) {
      if (typeof slot === 'string') {
        const c = lookup.get(slot);
        const rule = ruleFor(pc, slot, lookup);
        const node: ChainCourse = { code: slot, title_en: c?.title_en ?? slot, title_ar: c?.title_ar ?? slot, credits: c?.credits ?? 3, category: c?.category ?? 'core', description_en: c?.description_en ?? '', prereqs: rule.prereqs, coreqs: rule.coreqs, min_credits: rule.min_credits, year: term.year, sem: term.sem, elective: null, unlocks: [], depth: 0, in_program: true };
        nodes.set(slot, node);
        slots.push(node);
      } else {
        const pool = slot.pool ?? pc.electivePools?.[slot.elective] ?? [];
        const code = `ELECTIVE:${slot.elective}:${++electiveIdx}`;
        slots.push({ code, title_en: slot.label_en, title_ar: slot.label_ar, credits: slot.credits ?? 3, category: 'elective', description_en: pool.length ? `Choose from: ${pool.join(', ')}` : '', prereqs: [], coreqs: [], min_credits: 0, year: term.year, sem: term.sem, elective: { kind: slot.elective, label_en: slot.label_en, label_ar: slot.label_ar, pool }, unlocks: [], depth: 0, in_program: true });
      }
    }
    terms.push({ year: term.year, sem: term.sem, label_en: term.label_en, label_ar: term.label_ar, credits: slots.reduce((s, c) => s + c.credits, 0), slots });
  }
  // Elective pool members that have their own prerequisites (so the chain can show them on demand)
  const poolCourses: ChainCourse[] = [];
  for (const [kind, pool] of Object.entries(pc.electivePools ?? {})) {
    for (const code of pool) {
      if (nodes.has(code)) continue;
      const c = lookup.get(code); if (!c) continue;
      const rule = ruleFor(pc, code, lookup);
      poolCourses.push({ code, title_en: c.title_en, title_ar: c.title_ar, credits: c.credits, category: c.category, description_en: c.description_en, prereqs: rule.prereqs, coreqs: rule.coreqs, min_credits: rule.min_credits, year: 0, sem: 0, elective: { kind, label_en: kind, label_ar: kind, pool: [] }, unlocks: [], depth: 0, in_program: false });
    }
  }
  const all = [...nodes.values(), ...poolCourses];
  const byCode = new Map(all.map((n) => [n.code, n]));
  const edges: Array<{ from: string; to: string; alt: boolean; kind: 'prereq' | 'coreq' }> = [];
  for (const n of all) {
    for (const g of n.prereqs) for (const p of g) if (byCode.has(p)) { edges.push({ from: p, to: n.code, alt: g.length > 1, kind: 'prereq' }); byCode.get(p)!.unlocks.push(n.code); }
    for (const g of n.coreqs) for (const p of g) if (byCode.has(p)) edges.push({ from: p, to: n.code, alt: g.length > 1, kind: 'coreq' });
  }
  // Depth = longest prerequisite path (for "how deep is this chain")
  const memo = new Map<string, number>();
  const depth = (code: string, seen = new Set<string>()): number => {
    if (memo.has(code)) return memo.get(code)!;
    if (seen.has(code)) return 0;
    seen.add(code);
    const n = byCode.get(code); if (!n) return 0;
    const d = n.prereqs.flat().filter((p) => byCode.has(p)).reduce((m, p) => Math.max(m, depth(p, seen) + 1), 0);
    memo.set(code, d);
    return d;
  };
  for (const n of all) n.depth = depth(n.code);
  const stats = { courses: nodes.size, credits: terms.reduce((s, t) => s + t.credits, 0), edges: edges.length, longestChain: Math.max(0, ...all.map((n) => n.depth)) + 1, gateways: [...all].sort((a, b) => b.unlocks.length - a.unlocks.length).slice(0, 5).map((n) => ({ code: n.code, unlocks: n.unlocks.length })) };
  return { terms, pool: poolCourses, edges, stats };
}

export const prereqsRouter = Router();

prereqsRouter.get('/catalog', h((req, res) => {
  const u = requireUser(req);
  const programs = allPrograms().map((p) => ({ ...p.program, courses: p.plan.reduce((s, t) => s + t.slots.length, 0), mine: u.program_id === p.program.id }));
  ok(res, { colleges: COLLEGES.map((c) => ({ ...c, programs: programs.filter((p) => p.college_id === c.id) })), mine: u.program_id });
}));

prereqsRouter.get('/:programId', h((req, res) => {
  const u = requireUser(req);
  const pc = findProgram(req.params.programId as string);
  if (!pc) throw notFound('Unknown programme');
  const chain = buildChain(pc);
  // Personal overlay when it is the student's own programme
  let my: Record<string, { status: string; term?: string; grade?: string | null }> | null = null;
  if (u.program_id === pc.program.id) {
    my = {};
    const rows = db().all('SELECT course_code, term, status, grade FROM transcript_entries WHERE student_id = ? ORDER BY term', u.id);
    const rank: Record<string, number> = { completed: 4, equivalent: 4, enrolled: 3, planned: 2, failed: 1, withdrawn: 1 };
    for (const r of rows) { const prev = my[r.course_code as string]; if (!prev || (rank[r.status as string] ?? 0) > (rank[prev.status] ?? 0)) my[r.course_code as string] = { status: r.status as string, term: r.term as string, grade: (r.grade as string | null) ?? null }; }
    const earnedCredits = rows.filter((r) => r.status === 'completed' || r.status === 'equivalent').reduce((s, r) => s + Number(r.credits ?? 0), 0);
    const done = new Set(Object.entries(my).filter(([, v]) => v.status === 'completed' || v.status === 'equivalent').map(([k]) => k));
    for (const n of [...chain.terms.flatMap((t) => t.slots), ...chain.pool]) {
      if (n.elective && n.code.startsWith('ELECTIVE:')) continue;
      if (my[n.code]) continue;
      const okPrereq = n.prereqs.every((g) => g.some((p) => done.has(p)));
      my[n.code] = { status: okPrereq && earnedCredits >= n.min_credits ? 'available' : 'blocked' };
    }
  }
  ok(res, { program: pc.program, ...chain, my });
}));

export { pj as _pj };
