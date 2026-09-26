/**
 * LL.B. – Public Law track. Transcribed from LLB-Public-updated.pdf (yu.edu.sa, 2021).
 * Semester totals 18+16+17+17+15+17+17+18 = 135 credits.
 */
import type { CourseDef, PlanTerm } from '../curriculum.ts';
import { HSS_ELECTIVES } from '../curriculum.ts';
import type { ProgramCurriculum } from './index.ts';
import { C, LAW_COMMON_COURSES, LAW_COMMON_PLAN, FREE_EL, T, lawRequirements } from './law-shared.ts';

const TRACK: CourseDef[] = [
  // ---- Semester 7
  C('LAW 311', 'Environmental Law', 'قانون البيئة', 3, 7, 'major', 'Environmental protection regulation and liability for environmental harm.', [], { min_credits: 90 }),
  C('LAW 312', 'International Humanitarian Law', 'القانون الدولي الإنساني', 3, 7, 'major', 'Rules protecting persons and property in armed conflict.', [['LAW 104']]),
  C('LAW 313', 'Public Procurement Law', 'قانون المشتريات الحكومية', 3, 7, 'major', 'Government tenders, procurement procedures and public contracts.', [['LAW 223']]),
  C('LAW 321', 'Legal Implementation', 'التنفيذ القانوني', 2, 7, 'major', 'Enforcing judgments and executing against debtors\' assets.', [['LAW 216']]),
  C('LAW 335', 'Private International Law', 'القانون الدولي الخاص', 3, 7, 'major', 'Conflict of laws, jurisdiction and enforcement of foreign judgments.', [], { min_credits: 90 }),
  // ---- Semester 8
  C('LAW 322', 'Medical Law', 'القانون الطبي', 3, 8, 'major', 'Liability of medical practitioners, patient rights and health regulation.', [['LAW 111']]),
  C('LAW 341', 'Criminology & Penology', 'علم الإجرام والعقاب', 2, 8, 'major', 'Causes of crime and the theory and practice of punishment.', [['LAW 101']]),
  C('LAW 342', 'Oil & Gas Law', 'قانون النفط والغاز', 3, 8, 'major', 'Concessions, licensing and contracts in the petroleum sector.', [['LAW 213']]),
  C('LAW 343', 'International Law of the Sea', 'القانون الدولي للبحار', 2, 8, 'major', 'Maritime zones, navigation rights and resources under the law of the sea.', [['LAW 113']]),
  C('LAW 344', 'Zakat & Taxation Law', 'قانون الزكاة والضرائب', 3, 8, 'major', 'Zakat and tax obligations of individuals and companies and related disputes.', [['LAW 224']]),
  C('LAW 345', 'Rights of Women & Children', 'حقوق المرأة والطفل', 2, 8, 'major', 'Legal protection of women and children in national and international law.', [], { min_credits: 90 })
];

const courses = [...LAW_COMMON_COURSES, ...TRACK];
const plan: PlanTerm[] = [
  ...LAW_COMMON_PLAN,
  T(7, ['LAW 311', 'LAW 312', 'LAW 313', 'LAW 321', 'LAW 335', FREE_EL('I', '1')]),
  T(8, ['LAW 322', 'LAW 341', 'LAW 342', 'LAW 343', 'LAW 344', 'LAW 345', FREE_EL('II', '2')])
];

export const lawPublicCurriculum: ProgramCurriculum = {
  program: {
    id: 'law_public', code: 'LAW-PUB', name_en: 'Public Law', name_ar: 'القانون العام',
    college_id: 'law', college_en: 'College of Law', college_ar: 'كلية القانون',
    degree: 'Bachelor of Laws (LL.B.) – Public Law', total_credits: 135, duration_years: 4,
    source_url: 'https://yu.edu.sa/wp-content/uploads/2021/01/LLB-Public-updated.pdf',
    source_version: 'LLB Public Law plan (updated, Jan 2021)',
    source_note: 'The plan states no grand total; the eight semester totals sum to 135 credits. "30/60/90 CH" rules are mapped to min_credits; orientation (ORN, MTH 001, CMP 001) prerequisites omitted. The law-elective and free-elective pools are not listed in the plan. FIN 202 and MGT 102 keep the plan\'s codes and prerequisites (the business plans use FIN 202 with ACC 201 and MGT 220 for Organizational Behavior). HSS pool is the university list.',
    campus_ids: ['riyadh', 'khobar']
  },
  courses,
  plan,
  requirements: lawRequirements('law_public', courses, { label_en: 'Public law track', label_ar: 'مقررات مسار القانون العام', codes: TRACK.map((c) => c.code) }),
  electivePools: { hss: HSS_ELECTIVES }
};
