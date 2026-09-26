import type { User } from '../../../shared/types.ts';
import { normSkill, type CareerProfile, type Opportunity, userSkillSet } from './shared.ts';

export interface MatchResult { score: number; reasons: string[]; missing: string[]; eligible: boolean | null; eligibility_note: string }

const CITY_OF_CAMPUS: Record<string, string> = { riyadh: 'Riyadh', khobar: 'Khobar' };

/**
 * Deterministic, explainable ranking. Recommendation (score/reasons) is separate from eligibility: `eligible` is only set
 * when the posting states an explicit rule the profile clearly satisfies or fails; otherwise it stays null ("check").
 * The score never claims a skill the student does not list; missing requirements are surfaced instead.
 */
export function matchOpportunity(opp: Opportunity, user: User, profile: CareerProfile): MatchResult {
  const reasons: string[] = [];
  let score = 0;
  const mine = userSkillSet(user, profile);
  const need = opp.skills.map((s) => ({ raw: s, n: normSkill(s) }));
  const have = need.filter((s) => mine.has(s.n));
  const missing = need.filter((s) => !mine.has(s.n)).map((s) => s.raw);
  if (need.length) {
    const ratio = have.length / need.length;
    score += Math.round(50 * ratio);
    if (have.length) reasons.push(`Skills you list: ${have.map((s) => s.raw).join(', ')}`);
  } else {
    score += 20;
  }

  const interests = user.interests.map((i) => i.toLowerCase());
  const text = `${opp.field} ${opp.title} ${opp.description}`.toLowerCase();
  const hitInterests = interests.filter((i) => i.split('/').some((part) => part.trim().length > 1 && text.includes(part.trim())));
  if (hitInterests.length) {
    score += 20;
    reasons.push(`Matches your interest in ${hitInterests.slice(0, 2).join(' and ')}`);
  }

  const stageWantsEntry = user.stage === 'graduating' || user.stage === 'alumni';
  if ((stageWantsEntry && (opp.type === 'entry' || opp.type === 'coop')) || (!stageWantsEntry && (opp.type === 'internship' || opp.type === 'coop' || opp.type === 'competition' || opp.type === 'research'))) {
    score += 10;
    reasons.push(stageWantsEntry ? 'Suited to graduating students' : `${label(opp.type)} fits your current stage`);
  }

  const city = CITY_OF_CAMPUS[user.campus_id] ?? '';
  if (opp.remote === 'remote') { score += 10; reasons.push('Remote – no relocation needed'); }
  else if (city && opp.city.toLowerCase() === city.toLowerCase()) { score += 10; reasons.push(`In ${city}, your campus city`); }
  else if (opp.remote === 'hybrid') { score += 5; reasons.push('Hybrid schedule'); }

  if (profile.availability && opp.type === 'coop' && /co-?op/i.test(profile.availability)) { score += 5; reasons.push(`Availability: ${profile.availability}`); }

  const { eligible, note } = checkEligibility(opp.eligibility, user);
  if (eligible === false) score = Math.min(score, 35);
  return { score: Math.max(0, Math.min(100, score)), reasons, missing, eligible, eligibility_note: note };
}

function label(type: string) {
  return { internship: 'Internship', coop: 'Co-op', entry: 'Entry-level role', research: 'Research assistantship', competition: 'Competition' }[type] ?? type;
}

/** Parses only explicit, simple rules from the posting text. Anything else → null (student must check). */
export function checkEligibility(text: string, user: User): { eligible: boolean | null; note: string } {
  const t = (text ?? '').toLowerCase();
  if (!t) return { eligible: null, note: 'No eligibility stated – check with the provider.' };
  const isStudent = user.roles.includes('student') && ['current', 'graduating', 'orientation'].includes(user.stage);
  const extraConditions = /completed \d+|gpa|portfolio|security course|ai or data course|teams of|coach|coursework/.test(t);
  const levelMatch = t.match(/level\s*(\d)\s*(?:or above|\+|and above)/);
  if (levelMatch) {
    const min = Number(levelMatch[1]);
    return user.level >= min && isStudent ? { eligible: true, note: `Requires level ${min}+; you are level ${user.level}.` } : { eligible: false, note: `Requires level ${min}+; you are level ${user.level}.` };
  }
  if (/graduat(es|ing|ed)|final[- ]year|alumni/.test(t) && !/current/.test(t)) {
    return user.stage === 'graduating' || user.stage === 'alumni' || user.level >= 7 ? { eligible: true, note: 'Open to graduating students / graduates.' } : { eligible: false, note: 'Open to graduating students / graduates only.' };
  }
  if (/current (yu )?students|enrolled students|undergraduate/.test(t)) {
    if (!isStudent) return { eligible: false, note: 'Open to current students only.' };
    return extraConditions ? { eligible: null, note: 'Open to current students with extra conditions – confirm you meet them.' } : { eligible: true, note: 'Open to current students.' };
  }
  return { eligible: null, note: 'Eligibility text is descriptive – confirm with the provider.' };
}
