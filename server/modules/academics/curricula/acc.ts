/**
 * BSBA – Accounting. Transcribed from "5.2 Accounting Program" (Aug 2026), 127 credits.
 */
import type { PlanTerm } from '../curriculum.ts';
import { HSS_ELECTIVES } from '../curriculum.ts';
import type { ProgramCurriculum } from './index.ts';
import { HSS, NAT_SCI, MAJOR_EL, COLLEGE_EL, T, MBA_ELECTIVES, bsbaCourses, bsbaRequirements } from './cob-shared.ts';

const MAJOR = ['ACC 311', 'ACC 321', 'ACC 312', 'ACC 326', 'ACC 418', 'ACC 430', 'ACC 401', 'ACC 498'];
const MAJOR_ELECTIVES = ['ACC 416', 'ACC 421', 'ACC 424', 'ACC 428', 'ACC 432', 'ACC 434', 'ACC 440'];
const COLLEGE_ELECTIVES = [
  'MGT 315', 'MGT 317', 'MGT 321', 'MGT 331', 'MGT 410', 'MGT 429', 'MGT 442', 'MGT 305', 'MGT 350', 'MGT 360', 'MGT 422', 'MGT 430', 'MGT 480',
  'MKT 311', 'MKT 318', 'MKT 324', 'MKT 326', 'MKT 411', 'MKT 420', 'MKT 315', 'MKT 316', 'MKT 370', 'MKT 414', 'MKT 417',
  'FIN 311', 'FIN 313', 'FIN 320', 'FIN 330', 'FIN 411', 'FIN 418', 'FIN 324', 'FIN 325', 'FIN 335', 'FIN 340', 'FIN 412', 'FIN 414', 'FIN 420',
  'MIS 308', 'MIS 316', 'MIS 317', 'MIS 318', 'MIS 326', 'MIS 327', 'MIS 328', 'MIS 329', 'MIS 423', 'MIS 427', 'MIS 428', 'MIS 429', 'MIS 430', 'MIS 435', 'MIS 432', 'MIS 433', 'MIS 434', 'MIS 436',
  ...MBA_ELECTIVES
];

const plan: PlanTerm[] = [
  T(1, 1, ['ECO 101', 'MGT 101', 'MTH 100', 'ISL 101', 'ARB 102', HSS('I', '1')]),
  T(1, 2, ['ENG 101', 'ECO 105', 'MTH 110', 'ACC 201', 'MIS 110', NAT_SCI]),
  T(2, 1, ['MKT 201', 'MGT 220', 'MIS 201', 'ACC 202', 'FIN 202', 'MGT 210']),
  T(2, 2, ['ARB 202', 'ACC 311', 'ENG 202', 'MGT 314', HSS('II', '2'), 'STT 201']),
  T(3, 1, ['MGT 306', 'MGT 304', 'ACC 321', 'ACC 312', 'MGT 310', 'ISL 202', COLLEGE_EL('I', '1')]),
  T(3, 2, ['MGT 308', 'MGT 330', 'ACC 326', 'ACC 418', MAJOR_EL('I', '1'), COLLEGE_EL('II', '2')]),
  T(4, 1, ['MGT 495', 'ACC 430', 'ACC 401', MAJOR_EL('II', '2'), COLLEGE_EL('III', '3'), COLLEGE_EL('IV', '4')]),
  T(4, 2, ['ACC 498'])
];

export const accCurriculum: ProgramCurriculum = {
  program: {
    id: 'acc', code: 'ACC', name_en: 'Accounting', name_ar: 'المحاسبة',
    college_id: 'cob', college_en: 'College of Business', college_ar: 'كلية الأعمال',
    degree: 'B.S. in Business Administration (Accounting)', total_credits: 127, duration_years: 4,
    source_url: 'https://yu.edu.sa/wp-content/uploads/2026/08/5.2-Accounting-Program.pdf',
    source_version: 'Study plan 5.2 (Aug 2026)',
    source_note: 'Semester tables sum to 127 as stated. College electives: any four from the listed pool (55 courses) plus the three MBA courses allowed with 90 credits, GPA 3.60 and dean approval. The pool lists MIS 428/MIS 430 with prerequisite MIS 329 while the MIS plan lists MIS 327; the MIS plan value is used. Orientation (ORN) prerequisites omitted; natural-science pool not listed in the plan; HSS pool is the university list.',
    campus_ids: ['riyadh', 'khobar']
  },
  courses: bsbaCourses(plan, { major: MAJOR, major_elective: MAJOR_ELECTIVES, business: COLLEGE_ELECTIVES }),
  plan,
  requirements: bsbaRequirements('acc', { major_label_en: 'Accounting major core', major_label_ar: 'متطلبات تخصص المحاسبة', major: MAJOR, major_electives: MAJOR_ELECTIVES, college_electives: COLLEGE_ELECTIVES }),
  electivePools: { hss: HSS_ELECTIVES, major: MAJOR_ELECTIVES, business: COLLEGE_ELECTIVES }
};
