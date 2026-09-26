import { describe, it, expect } from 'vitest';
import { EXTRA_PROGRAMS, type ProgramCurriculum } from '../server/modules/academics/curricula/index.ts';
import { COURSE_BY_CODE, requirementCredits, type CourseDef } from '../server/modules/academics/curriculum.ts';

/**
 * Prerequisite codes that are intentionally not defined anywhere (none at the moment: orientation-year ORN codes and
 * placement codes such as MTH 001 / CMP 001 are dropped at transcription time). Add `{ 'XYZ 123': 'why' }` here if a
 * plan ever references a course outside every transcribed programme.
 */
const knownExternalCodes: Record<string, string> = {};

/** Totals derived by summing the semester tables of each official plan (see each programme's source_note). */
const EXPECTED_TOTALS: Record<string, number> = { mis: 127, acc: 127, fin: 127, mkt: 127, mgt: 127, ie: 136, aia: 161, law_private: 135, law_public: 135 };

function lookupFor(pc: ProgramCurriculum) {
  const own = new Map<string, CourseDef>();
  for (const c of pc.courses) if (!own.has(c.code)) own.set(c.code, c);
  return (code: string) => own.get(code) ?? COURSE_BY_CODE.get(code);
}

function planCodes(pc: ProgramCurriculum): string[] {
  return pc.plan.flatMap((t) => t.slots.filter((s): s is string => typeof s === 'string'));
}

function poolCodes(pc: ProgramCurriculum): string[] {
  const fromPools = Object.values(pc.electivePools ?? {}).flat();
  const fromSlots = pc.plan.flatMap((t) => t.slots.flatMap((s) => (typeof s === 'string' ? [] : s.pool ?? [])));
  return [...new Set([...fromPools, ...fromSlots])];
}

describe('extra programme registry', () => {
  it('registers the nine programmes in the agreed order', () => {
    expect(EXTRA_PROGRAMS.map((p) => p.program.id)).toEqual(['mis', 'acc', 'fin', 'mkt', 'mgt', 'ie', 'aia', 'law_private', 'law_public']);
    expect(new Set(EXTRA_PROGRAMS.map((p) => p.program.code)).size).toBe(EXTRA_PROGRAMS.length);
  });
});

for (const pc of EXTRA_PROGRAMS) {
  describe(`curriculum ${pc.program.id} (${pc.program.name_en})`, () => {
    const lookup = lookupFor(pc);

    it('has unique course codes with complete definitions', () => {
      const codes = pc.courses.map((c) => c.code);
      expect(new Set(codes).size).toBe(codes.length);
      expect(pc.courses.length).toBeGreaterThanOrEqual(30);
      for (const c of pc.courses) {
        expect(c.code).toMatch(/^[A-Z]{2,4} \d{3}$/);
        expect(c.title_en.length).toBeGreaterThan(2);
        expect(c.title_ar).toMatch(/[؀-ۿ]/);
        expect(c.description_en.length).toBeGreaterThan(20);
        expect(c.credits).toBeGreaterThanOrEqual(0);
        expect(c.level).toBeGreaterThanOrEqual(1);
        expect(c.level).toBeLessThanOrEqual(10);
        expect(c.dept).toBe(c.code.split(' ')[0]);
      }
    });

    it('resolves every plan slot and elective-pool code', () => {
      const missing = [...planCodes(pc), ...poolCodes(pc)].filter((code) => !lookup(code));
      expect(missing).toEqual([]);
      for (const term of pc.plan) for (const slot of term.slots) if (typeof slot !== 'string') {
        expect(slot.label_en.length).toBeGreaterThan(0);
        expect(slot.label_ar).toMatch(/[؀-ۿ]/);
      }
    });

    it('resolves every prerequisite and co-requisite code', () => {
      const unresolved: string[] = [];
      for (const c of pc.courses) {
        for (const code of [...c.prereqs.flat(), ...(c.coreqs ?? []).flat()]) {
          if (!lookup(code) && !(code in knownExternalCodes)) unresolved.push(`${c.code} -> ${code}`);
        }
      }
      expect(unresolved).toEqual([]);
    });

    it('has no prerequisite cycles', () => {
      const codes = new Set([...pc.courses.map((c) => c.code), ...planCodes(pc), ...poolCodes(pc)]);
      const state = new Map<string, 'visiting' | 'done'>();
      const cycles: string[] = [];
      const visit = (code: string, path: string[]) => {
        const st = state.get(code);
        if (st === 'done') return;
        if (st === 'visiting') { cycles.push([...path, code].join(' -> ')); return; }
        state.set(code, 'visiting');
        for (const p of lookup(code)?.prereqs.flat() ?? []) visit(p, [...path, code]);
        state.set(code, 'done');
      };
      for (const code of codes) visit(code, []);
      expect(cycles).toEqual([]);
    });

    it('sums requirement credits and plan credits to the programme total', () => {
      expect(pc.program.total_credits).toBe(EXPECTED_TOTALS[pc.program.id]);
      const reqTotal = pc.requirements.reduce((s, r) => s + requirementCredits(r), 0);
      expect(reqTotal).toBe(pc.program.total_credits);
      const planTotal = pc.plan.reduce((s, t) => s + t.slots.reduce((ss, slot) => ss + (typeof slot === 'string' ? (lookup(slot)?.credits ?? 0) : (slot.credits ?? 3)), 0), 0);
      expect(planTotal).toBe(pc.program.total_credits);
      for (const r of pc.requirements) {
        expect(new Set(r.course_codes).size).toBe(r.course_codes.length);
        if ((r.min_courses ?? 0) > 0) expect(r.required_credits).toBeDefined();
      }
      // every plan course belongs to exactly one bucket
      const bucketOf = new Map<string, string[]>();
      for (const r of pc.requirements) for (const code of r.course_codes) bucketOf.set(code, [...(bucketOf.get(code) ?? []), r.id]);
      const stray = planCodes(pc).filter((code) => (bucketOf.get(code)?.length ?? 0) !== 1);
      expect(stray).toEqual([]);
    });

    it('carries complete programme metadata', () => {
      const p = pc.program;
      expect(p.name_ar).toMatch(/[؀-ۿ]/);
      expect(p.source_url).toMatch(/^https:\/\/yu\.edu\.sa\//);
      expect(p.source_version.length).toBeGreaterThan(0);
      expect(p.source_note.length).toBeGreaterThan(20);
      expect(p.campus_ids).toContain('riyadh');
      expect(['coea', 'cob', 'law']).toContain(p.college_id);
      expect(p.duration_years).toBe(p.id === 'aia' ? 5 : 4);
      expect(pc.plan.length).toBeGreaterThanOrEqual(8);
    });
  });
}
