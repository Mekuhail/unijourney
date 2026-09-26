import type { User } from '../../../shared/types.ts';
import { db } from '../../core/db.ts';
import { type CareerProfile, type Opportunity } from './shared.ts';
import { academicRecord, skillEvidence, type SkillEvidence } from './portfolio.ts';
import { coverage, skillKey } from './skills.ts';

/** A localizable explanation line: the client renders `key` with `params`; `text` is the English fallback. */
export interface Explain { key: string; params: Record<string, string | number>; text: string }
export interface MatchResult {
  score: number; reasons: string[]; missing: string[]; weak: string[]; eligible: boolean | null; eligibility_note: string;
  explain: Explain[]; eligibility: Explain; breakdown: Array<{ key: 'skills' | 'interest' | 'stage' | 'location' | 'availability'; points: number; max: number }>;
}

const CITY_OF_CAMPUS: Record<string, string> = { riyadh: 'Riyadh', khobar: 'Khobar' };
const ex = (key: string, params: Record<string, string | number>, text: string): Explain => ({ key, params, text });

/**
 * Deterministic, explainable ranking (v2). Recommendation (score/reasons) stays separate from eligibility.
 * Skills are scored by evidence, not by claims: each required skill earns the strength of the best evidence the
 * student has (self-declared 0.4, course 0.6–0.8, project 0.7, GitHub 0.75, work/certificate 0.85, verified award 1),
 * with 80% credit when a more specific skill covers it (PostgreSQL → SQL). Nothing is claimed that the student lacks.
 */
export function matchOpportunity(opp: Opportunity, user: User, profile: CareerProfile, evidence?: Map<string, SkillEvidence>): MatchResult {
  const ev = evidence ?? skillEvidence(user, profile);
  const explain: Explain[] = [];
  const held = [...ev.values()];
  const need = opp.skills.map((raw) => {
    const key = skillKey(raw);
    let best = 0, from: SkillEvidence | null = null;
    for (const h of held) { const v = coverage(h.key, key) * h.strength; if (v > best) { best = v; from = h; } }
    return { raw, best, from };
  });
  const proven = need.filter((n) => n.best >= 0.55);
  const weak = need.filter((n) => n.best > 0 && n.best < 0.55);
  const missing = need.filter((n) => n.best === 0);
  const skillPts = need.length ? Math.round((50 * need.reduce((a, n) => a + n.best, 0)) / need.length) : 20;
  if (proven.length) {
    const list = proven.map((n) => { const src = n.from?.evidence.slice().sort((a, b) => b.weight - a.weight)[0]; return src && src.kind !== 'self' ? `${n.raw} (${src.ref})` : n.raw; }).join(', ');
    explain.push(ex('match.proven', { skills: list }, `Skills with evidence: ${list}`));
  }
  if (weak.length) explain.push(ex('match.weak', { skills: weak.map((n) => n.raw).join(', ') }, `Listed but not yet shown in your work: ${weak.map((n) => n.raw).join(', ')}`));

  let interestPts = 0;
  const interests = user.interests.map((i) => i.toLowerCase());
  const text = `${opp.field} ${opp.title} ${opp.description}`.toLowerCase();
  const hitInterests = interests.filter((i) => i.split('/').some((part) => part.trim().length > 1 && text.includes(part.trim())));
  if (hitInterests.length) {
    interestPts = 20;
    const list = hitInterests.slice(0, 2).join(', ');
    explain.push(ex('match.interest', { interests: list }, `Matches your interest in ${list}`));
  }

  let stagePts = 0;
  const stageWantsEntry = user.stage === 'graduating' || user.stage === 'alumni';
  if ((stageWantsEntry && (opp.type === 'entry' || opp.type === 'coop')) || (!stageWantsEntry && (opp.type === 'internship' || opp.type === 'coop' || opp.type === 'research'))) {
    stagePts = 10;
    explain.push(stageWantsEntry ? ex('match.stageGraduating', {}, 'Suited to graduating students') : ex('match.stageFit', { type: opp.type }, `${label(opp.type)} fits your current stage`));
  }

  let locPts = 0;
  const city = CITY_OF_CAMPUS[user.campus_id] ?? '';
  if (opp.remote === 'remote') { locPts = 10; explain.push(ex('match.remote', {}, 'Remote: no relocation needed')); }
  else if (city && opp.city.toLowerCase() === city.toLowerCase()) { locPts = 10; explain.push(ex('match.city', { city }, `In ${city}, your campus city`)); }
  else if (opp.remote === 'hybrid') { locPts = 5; explain.push(ex('match.hybrid', {}, 'Hybrid schedule')); }

  let availPts = 0;
  if (profile.availability && opp.type === 'coop' && /co-?op/i.test(profile.availability)) { availPts = 5; explain.push(ex('match.availability', { availability: profile.availability }, `Availability: ${profile.availability}`)); }

  const elig = checkEligibility(opp.eligibility, user, opp.type);
  let score = skillPts + interestPts + stagePts + locPts + availPts;
  if (elig.eligible === false) score = Math.min(score, 35);
  return {
    score: Math.max(0, Math.min(100, score)),
    reasons: explain.map((e) => e.text), explain,
    missing: missing.map((n) => n.raw), weak: weak.map((n) => n.raw),
    eligible: elig.eligible, eligibility_note: elig.note.text, eligibility: elig.note,
    breakdown: [
      { key: 'skills', points: skillPts, max: 50 }, { key: 'interest', points: interestPts, max: 20 }, { key: 'stage', points: stagePts, max: 10 },
      { key: 'location', points: locPts, max: 10 }, { key: 'availability', points: availPts, max: 5 }
    ]
  };
}

function label(type: string) {
  return { internship: 'Internship', coop: 'Co-op', entry: 'Entry-level role', research: 'Research assistantship', competition: 'Competition' }[type] ?? type;
}

/** Credit hours the co-op course requires (CIS 490 in the YU plans), or null when the plan has no such rule. */
function coopMinCredits(): number | null {
  const r = db().get<{ min_credits: number | null }>(`SELECT MAX(min_credits) AS min_credits FROM courses WHERE code = 'CIS 490'`);
  return r?.min_credits ? Number(r.min_credits) : null;
}

/**
 * Structured rules first (co-op credit hours from the transcript), then simple explicit rules parsed from the posting.
 * Anything else stays null ("check with the provider"). Every result carries a localizable note.
 */
export function checkEligibility(text: string, user: User, type?: string): { eligible: boolean | null; note: Explain } {
  const t = (text ?? '').toLowerCase();
  const isStudent = user.roles.includes('student') && ['current', 'graduating', 'orientation'].includes(user.stage);
  if (type === 'coop' && isStudent) {
    const min = coopMinCredits();
    if (min) {
      const credits = academicRecord(user.id).credits;
      if (credits < min) return { eligible: false, note: ex('elig.coopShort', { left: min - credits, min }, `Not yet: ${min - credits} credit hours to go (co-op needs ${min}).`) };
      const extra = /completed \d+|gpa|portfolio|security course|ai or data course|coursework/.test(t);
      return extra
        ? { eligible: null, note: ex('elig.coopMetExtra', { credits, min }, `You meet the co-op credit rule (${credits} of ${min} credit hours); confirm the other conditions.`) }
        : { eligible: true, note: ex('elig.coopMet', { credits, min }, `You meet the co-op credit rule (${credits} of ${min} credit hours).`) };
    }
  }
  if (!t) return { eligible: null, note: ex('elig.none', {}, 'No eligibility stated. Check with the provider.') };
  const extraConditions = /completed \d+|gpa|portfolio|security course|ai or data course|teams of|coach|coursework/.test(t);
  const levelMatch = t.match(/level\s*(\d)\s*(?:or above|\+|and above)/);
  if (levelMatch) {
    const min = Number(levelMatch[1]);
    const note = ex('elig.level', { min, level: user.level }, `Requires level ${min}+; you are level ${user.level}.`);
    return user.level >= min && isStudent ? { eligible: true, note } : { eligible: false, note };
  }
  if (/graduat(es|ing|ed)|final[- ]year|alumni/.test(t) && !/current/.test(t)) {
    return user.stage === 'graduating' || user.stage === 'alumni' || user.level >= 7
      ? { eligible: true, note: ex('elig.graduates', {}, 'Open to graduating students and graduates.') }
      : { eligible: false, note: ex('elig.graduatesOnly', {}, 'Open to graduating students and graduates only.') };
  }
  if (/current (yu )?students|enrolled students|undergraduate/.test(t)) {
    if (!isStudent) return { eligible: false, note: ex('elig.currentOnly', {}, 'Open to current students only.') };
    return extraConditions
      ? { eligible: null, note: ex('elig.currentExtra', {}, 'Open to current students with extra conditions. Confirm you meet them.') }
      : { eligible: true, note: ex('elig.current', {}, 'Open to current students.') };
  }
  return { eligible: null, note: ex('elig.descriptive', {}, 'The eligibility text is descriptive. Confirm with the provider.') };
}
