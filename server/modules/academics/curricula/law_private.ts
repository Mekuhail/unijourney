/**
 * LL.B. – Private Law track. Transcribed from LLB-Private-updated.pdf (yu.edu.sa, 2021).
 * Semester totals 18+16+17+17+15+17+17+18 = 135 credits.
 */
import type { CourseDef, PlanTerm } from '../curriculum.ts';
import { HSS_ELECTIVES } from '../curriculum.ts';
import type { ProgramCurriculum } from './index.ts';
import { C, LAW_COMMON_COURSES, LAW_COMMON_PLAN, FREE_EL, T, lawRequirements } from './law-shared.ts';

const TRACK: CourseDef[] = [
  // ---- Semester 7
  C('LAW 321', 'Legal Implementation', 'التنفيذ القانوني', 2, 7, 'major', 'Enforcing judgments and executing against debtors\' assets.', [['LAW 216']]),
  C('LAW 322', 'Medical Law', 'القانون الطبي', 3, 7, 'major', 'Liability of medical practitioners, patient rights and health regulation.', [['LAW 111']]),
  C('LAW 323', 'Banking Law', 'القانون المصرفي', 3, 7, 'major', 'Bank operations, credit facilities and the regulation of banking in Saudi Arabia.', [['LAW 214']]),
  C('LAW 324', 'Capital Market Law', 'قانون السوق المالية', 3, 7, 'major', 'Securities regulation, listed companies and the Capital Market Authority.', [['LAW 224']]),
  C('LAW 344', 'Zakat & Taxation Law', 'قانون الزكاة والضرائب', 3, 7, 'major', 'Zakat and tax obligations of individuals and companies and related disputes.', [['LAW 224']]),
  // ---- Semester 8
  C('LAW 331', 'Intellectual Property', 'الملكية الفكرية', 3, 8, 'major', 'Copyright, patents, trademarks and their protection.', [], { min_credits: 90 }),
  C('LAW 332', 'Charity Law', 'قانون العمل الخيري', 3, 8, 'major', 'Legal framework of charitable organisations and non-profit activity.', [], { min_credits: 90 }),
  C('LAW 333', 'Insurance Law', 'قانون التأمين', 3, 8, 'major', 'Insurance contracts, cooperative insurance and claims.', [['LAW 111']]),
  C('LAW 334', 'Commercial Contracts', 'العقود التجارية', 3, 8, 'major', 'Agency, distribution, franchising and other contracts of trade.', [['LAW 214']], { min_credits: 90 }),
  C('LAW 335', 'Private International Law', 'القانون الدولي الخاص', 3, 8, 'major', 'Conflict of laws, jurisdiction and enforcement of foreign judgments.', [], { min_credits: 90 })
];

const courses = [...LAW_COMMON_COURSES, ...TRACK];
const plan: PlanTerm[] = [
  ...LAW_COMMON_PLAN,
  T(7, ['LAW 321', 'LAW 322', 'LAW 323', 'LAW 324', 'LAW 344', FREE_EL('I', '1')]),
  T(8, ['LAW 331', 'LAW 332', 'LAW 333', 'LAW 334', 'LAW 335', FREE_EL('II', '2')])
];

export const lawPrivateCurriculum: ProgramCurriculum = {
  program: {
    id: 'law_private', code: 'LAW-PRIV', name_en: 'Private Law', name_ar: 'القانون الخاص',
    college_id: 'law', college_en: 'College of Law', college_ar: 'كلية القانون',
    degree: 'Bachelor of Laws (LL.B.) – Private Law', total_credits: 135, duration_years: 4,
    source_url: 'https://yu.edu.sa/wp-content/uploads/2021/01/LLB-Private-updated.pdf',
    source_version: 'LLB Private Law plan (updated, Jan 2021)',
    source_note: 'The plan states no grand total; the eight semester totals sum to 135 credits. "30/60/90 CH" rules are mapped to min_credits; orientation (ORN, MTH 001, CMP 001) prerequisites omitted. The law-elective and free-elective pools are not listed in the plan. FIN 202 and MGT 102 keep the plan\'s codes and prerequisites (the business plans use FIN 202 with ACC 201 and MGT 220 for Organizational Behavior). HSS pool is the university list.',
    campus_ids: ['riyadh', 'khobar']
  },
  courses,
  plan,
  requirements: lawRequirements('law_private', courses, { label_en: 'Private law track', label_ar: 'مقررات مسار القانون الخاص', codes: TRACK.map((c) => c.code) }),
  electivePools: { hss: HSS_ELECTIVES }
};
