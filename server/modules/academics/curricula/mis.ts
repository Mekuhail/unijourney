/**
 * BSBA – Management Information Systems. Transcribed from "5.2 MIS Program" (Aug 2026), 127 credits.
 */
import type { PlanTerm } from '../curriculum.ts';
import { HSS_ELECTIVES } from '../curriculum.ts';
import type { ProgramCurriculum } from './index.ts';
import { HSS, NAT_SCI, MAJOR_EL, T, bsbaCourses, bsbaRequirements } from './cob-shared.ts';

const MAJOR = ['MIS 316', 'MIS 328', 'MIS 317', 'MIS 326', 'MIS 327', 'MIS 329', 'MIS 423', 'MIS 431', 'MIS 427', 'MIS 492', 'MIS 401', 'MIS 498'];
const MAJOR_ELECTIVES = ['MIS 308', 'MIS 318', 'MIS 428', 'MIS 429', 'MIS 430', 'MIS 435', 'MIS 432', 'MIS 433', 'MIS 434', 'MIS 436'];

const plan: PlanTerm[] = [
  T(1, 1, ['ECO 101', 'MGT 101', 'MTH 100', 'ISL 101', 'ARB 102', HSS('I', '1')]),
  T(1, 2, ['ENG 101', 'ECO 105', 'MTH 110', 'ACC 201', 'MIS 110', NAT_SCI]),
  T(2, 1, ['MKT 201', 'STT 201', 'MIS 201', 'ACC 202', 'FIN 202', 'MGT 220']),
  T(2, 2, ['ARB 202', 'MIS 316', 'MIS 328', 'ENG 202', 'MGT 210', HSS('II', '2')]),
  T(3, 1, ['MGT 304', 'MGT 310', 'MIS 317', 'MIS 326', 'MIS 327', 'MGT 314', 'ISL 202']),
  T(3, 2, ['MGT 308', 'MGT 330', 'MIS 329', 'MIS 423', 'MIS 431', 'MGT 306']),
  T(4, 1, ['MGT 495', 'MIS 427', MAJOR_EL('I', '1'), MAJOR_EL('II', '2'), 'MIS 492', 'MIS 401']),
  T(4, 2, ['MIS 498'])
];

export const misCurriculum: ProgramCurriculum = {
  program: {
    id: 'mis', code: 'MIS', name_en: 'Management Information Systems', name_ar: 'نظم المعلومات الإدارية',
    college_id: 'cob', college_en: 'College of Business', college_ar: 'كلية الأعمال',
    degree: 'B.S. in Business Administration (MIS)', total_credits: 127, duration_years: 4,
    source_url: 'https://yu.edu.sa/wp-content/uploads/2026/08/5.2-MIS-Program.pdf',
    source_version: 'Study plan 5.2 (Aug 2026)',
    source_note: 'Semester tables sum to 127 as stated. MIS 316 is 3 credits in the semester plan but 4 in the major-requirements table; the plan value is used. Orientation (ORN) prerequisites omitted. The natural-science elective pool is not listed in the plan; the HSS pool is the university list. CSK 001 is recommended before the co-op but is not in the plan.',
    campus_ids: ['riyadh', 'khobar']
  },
  courses: bsbaCourses(plan, { major: MAJOR, major_elective: MAJOR_ELECTIVES }),
  plan,
  requirements: bsbaRequirements('mis', { major_label_en: 'MIS major core', major_label_ar: 'متطلبات تخصص نظم المعلومات الإدارية', major: MAJOR, major_electives: MAJOR_ELECTIVES }),
  electivePools: { hss: HSS_ELECTIVES, major: MAJOR_ELECTIVES }
};
