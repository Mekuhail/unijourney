/**
 * Shared definitions for the College of Law LL.B. tracks (Private Law, Public Law).
 * Semesters 1–6 are identical in both tracks (LLB-Private-updated.pdf / LLB-Public-updated.pdf, yu.edu.sa, 2021);
 * the track files add semesters 7–8. Each track sums to 135 credits.
 */
import type { CourseCategory, CourseDef, PlanSlot, PlanTerm, RequirementDef } from '../curriculum.ts';
import { COURSE_BY_CODE, HSS_ELECTIVES } from '../curriculum.ts';

export const C = (code: string, title_en: string, title_ar: string, credits: number, level: number, category: CourseCategory, description_en: string, prereqs: string[][] = [], extra: Partial<CourseDef> = {}): CourseDef => ({
  code, title_en, title_ar, credits, dept: code.split(' ')[0], level, category, description_en, prereqs, ...extra
});

/** Courses of the six common semesters. */
export const LAW_COMMON_COURSES: CourseDef[] = [
  // ---- Semester 1
  C('LAW 101', 'Introduction to Law', 'مدخل إلى القانون', 3, 1, 'major', 'The nature and sources of law, legal systems and the structure of the Saudi legal order.'),
  C('LAW 103', 'Legal Ethics in Islam', 'الأخلاقيات القانونية في الإسلام', 3, 1, 'core', 'Ethical duties of legal practitioners grounded in Islamic principles.'),
  C('LAW 104', 'Human Rights', 'حقوق الإنسان', 3, 1, 'major', 'International and Islamic human-rights frameworks and their protection mechanisms.'),
  C('MGT 101', 'Introduction to Management', 'مقدمة في الإدارة', 3, 1, 'core', 'Planning, organising, leading and controlling as the basic functions of managers in organisations.'),
  // ---- Semester 2
  C('LAW 102', 'Introduction to Islamic Jurisprudence', 'مدخل إلى الفقه الإسلامي', 3, 2, 'core', 'Sources, schools and development of Islamic jurisprudence.'),
  C('MGT 102', 'Organizational Behavior', 'السلوك التنظيمي', 3, 2, 'core', 'Individual and group behaviour at work: motivation, teams, leadership and culture.', [['MGT 101']]),
  C('FIN 202', 'Introduction to Finance', 'مقدمة في المالية', 3, 2, 'core', 'Time value of money, financial statements and basic valuation for non-specialists.'),
  // ---- Semester 3
  C('LAW 111', 'Sources of Obligations', 'مصادر الالتزام', 3, 3, 'major', 'Contracts, unilateral acts, torts and unjust enrichment as sources of civil obligations.', [['LAW 101']]),
  C('LAW 112', 'Constitutional Law', 'القانون الدستوري', 3, 3, 'major', 'The Basic Law of Governance, state institutions and constitutional principles.', [['LAW 101']], { min_credits: 30 }),
  C('LAW 113', 'Public International Law I', 'القانون الدولي العام 1', 3, 3, 'major', 'Subjects and sources of international law, treaties and state responsibility.', [['LAW 101']]),
  C('LAW 114', 'Criminal Law I', 'القانون الجنائي 1', 3, 3, 'major', 'General principles of criminal liability, offences and punishment.', [['LAW 101']], { min_credits: 30 }),
  C('LAW 115', 'Family Law', 'قانون الأسرة', 2, 3, 'major', 'Marriage, divorce, custody and maintenance under Islamic personal status law.'),
  // ---- Semester 4
  C('LAW 121', 'Effects of Obligation', 'آثار الالتزام', 3, 4, 'major', 'Performance, enforcement, transfer and extinction of obligations.', [['LAW 111']], { min_credits: 30 }),
  C('LAW 122', 'Public International Law II', 'القانون الدولي العام 2', 2, 4, 'major', 'International organisations, dispute settlement and the use of force.', [['LAW 113']], { min_credits: 30 }),
  C('LAW 123', 'Criminal Law II', 'القانون الجنائي 2', 3, 4, 'major', 'Specific offences against persons, property and the state.', [['LAW 114']], { min_credits: 30 }),
  C('LAW 124', 'Administrative Law I', 'القانون الإداري 1', 3, 4, 'major', 'Administrative organisation, public officials and administrative decisions.', [['LAW 101']]),
  C('LAW 125', 'Islamic Regulations of Inheritance, Wills and Endowments', 'أحكام المواريث والوصايا والأوقاف', 3, 4, 'major', 'Succession shares, wills and endowments under Islamic law.', [['LAW 115']], { min_credits: 30 }),
  // ---- Semester 5
  C('LAW 211', 'Labor Law & Social Security', 'قانون العمل والتأمينات الاجتماعية', 3, 5, 'major', 'Employment contracts, workers\' rights and the social insurance system.', [['LAW 104']], { min_credits: 60 }),
  C('LAW 212', 'Criminal Procedure Law', 'قانون الإجراءات الجزائية', 2, 5, 'major', 'Investigation, prosecution, trial and appeal in criminal cases.', [['LAW 123']], { min_credits: 60 }),
  C('LAW 213', 'Administrative Law II', 'القانون الإداري 2', 2, 5, 'major', 'Public contracts, public property and administrative liability.', [['LAW 124']], { min_credits: 60 }),
  C('LAW 214', 'Commercial Law', 'القانون التجاري', 3, 5, 'major', 'Merchants, commercial acts, the commercial register and business establishments.', [], { min_credits: 60 }),
  C('LAW 215', 'Property Law', 'قانون الملكية', 2, 5, 'major', 'Ownership, possession and real rights over property.', [], { min_credits: 60 }),
  C('LAW 216', 'Civil & Commercial Procedures', 'المرافعات المدنية والتجارية', 3, 5, 'major', 'Jurisdiction, pleadings, hearings and judgments in civil and commercial litigation.', [], { min_credits: 60 }),
  // ---- Semester 6
  C('LAW 221', 'Real Estate & Mortgage', 'العقارات والرهن العقاري', 2, 6, 'major', 'Real estate transactions, registration and mortgage security.', [['LAW 215']], { min_credits: 60 }),
  C('LAW 222', 'Maritime Law', 'القانون البحري', 3, 6, 'major', 'Ships, carriage of goods by sea, marine insurance and maritime claims.', [], { min_credits: 60 }),
  C('LAW 223', 'Administrative Judiciary', 'القضاء الإداري', 2, 6, 'major', 'The Board of Grievances and judicial review of administrative action.', [['LAW 213']], { min_credits: 60 }),
  C('LAW 224', 'Company Law', 'قانون الشركات', 2, 6, 'major', 'Formation, governance and dissolution of partnerships and companies.', [['LAW 214']]),
  C('LAW 225', 'Negotiable Instruments & Bankruptcy', 'الأوراق التجارية والإفلاس', 3, 6, 'major', 'Bills of exchange, cheques and promissory notes, and insolvency proceedings.', [['LAW 121']]),
  C('LAW 226', 'Evidence', 'الإثبات', 3, 6, 'major', 'Burden of proof and the means of evidence in civil and commercial disputes.', [['LAW 216']]),
  C('LAW 227', 'Usul Al Fiqh', 'أصول الفقه', 2, 6, 'major', 'Principles and methods of deriving rulings in Islamic jurisprudence.', [['LAW 102']])
];

export const LAW_UNIVERSITY_CORE = ['ENG 101', 'ARB 102', 'ARB 202'];
export const LAW_COLLEGE_CORE = ['LAW 103', 'MGT 101', 'LAW 102', 'MGT 102', 'FIN 202'];
export const LAW_COMMON_CORE = ['LAW 101', 'LAW 104', 'LAW 111', 'LAW 112', 'LAW 113', 'LAW 114', 'LAW 115', 'LAW 121', 'LAW 122', 'LAW 123', 'LAW 124', 'LAW 125', 'LAW 211', 'LAW 212', 'LAW 213', 'LAW 214', 'LAW 215', 'LAW 216', 'LAW 221', 'LAW 222', 'LAW 223', 'LAW 224', 'LAW 225', 'LAW 226', 'LAW 227'];

export const HSS = (n: string, ar: string): PlanSlot => ({ elective: 'hss', label_en: `Social Science / Humanities Elective ${n}`, label_ar: `مقرر اجتماعي/إنساني اختياري ${ar}`, credits: 3 });
export const LAW_EL = (n: string, ar: string): PlanSlot => ({ elective: 'major', label_en: `Law Elective ${n}`, label_ar: `مقرر قانوني اختياري ${ar}`, credits: 3 });
export const FREE_EL = (n: string, ar: string): PlanSlot => ({ elective: 'free', label_en: `Free Elective ${n}`, label_ar: `مقرر حر ${ar}`, credits: 3 });
export const T = (sem: number, slots: PlanSlot[]): PlanTerm => {
  const year = Math.ceil(sem / 2), s = ((sem - 1) % 2) + 1;
  return { year, sem: s, label_en: `Year ${year} · Semester ${s}`, label_ar: `السنة ${year} · الفصل ${s}`, slots };
};

/** Plan terms for the six common semesters. */
export const LAW_COMMON_PLAN: PlanTerm[] = [
  T(1, ['LAW 101', 'ENG 101', 'LAW 103', 'LAW 104', 'MGT 101', HSS('I', '1')]),
  T(2, ['LAW 102', 'MGT 102', 'ARB 202', 'FIN 202', 'ARB 102', HSS('II', '2')]),
  T(3, ['LAW 111', 'LAW 112', 'LAW 113', 'LAW 114', 'LAW 115', LAW_EL('I', '1')]),
  T(4, ['LAW 121', 'LAW 122', 'LAW 123', 'LAW 124', 'LAW 125', LAW_EL('II', '2')]),
  T(5, ['LAW 211', 'LAW 212', 'LAW 213', 'LAW 214', 'LAW 215', 'LAW 216']),
  T(6, ['LAW 221', 'LAW 222', 'LAW 223', 'LAW 224', 'LAW 225', 'LAW 226', 'LAW 227'])
];

export function lawRequirements(id: string, courses: CourseDef[], track: { label_en: string; label_ar: string; codes: string[] }): RequirementDef[] {
  const byCode = new Map(courses.map((c) => [c.code, c]));
  const credits = (codes: string[]) => codes.reduce((s, c) => s + (byCode.get(c)?.credits ?? COURSE_BY_CODE.get(c)?.credits ?? 0), 0);
  const bucket = (bid: string, category: string, label_en: string, label_ar: string, course_codes: string[], extra: Partial<RequirementDef> = {}): RequirementDef =>
    ({ id: bid, category, label_en, label_ar, course_codes, required_credits: credits(course_codes), ...extra });
  return [
    bucket(`${id}_univ`, 'university_core', 'University core', 'متطلبات الجامعة', LAW_UNIVERSITY_CORE),
    bucket(`${id}_hss`, 'hss_elective', 'Social science / humanities electives', 'المقررات الاجتماعية والإنسانية الاختيارية', HSS_ELECTIVES, { min_courses: 2, required_credits: 6 }),
    bucket(`${id}_college`, 'college_core', 'College foundations', 'متطلبات الكلية', LAW_COLLEGE_CORE),
    bucket(`${id}_core`, 'major_core', 'Law core', 'متطلبات القانون المشتركة', LAW_COMMON_CORE),
    bucket(`${id}_track`, 'major_core', track.label_en, track.label_ar, track.codes),
    bucket(`${id}_law_elective`, 'major_elective', 'Law electives', 'المقررات القانونية الاختيارية', [], { min_courses: 2, required_credits: 6 }),
    bucket(`${id}_free`, 'free_elective', 'Free electives', 'المقررات الحرة', [], { min_courses: 2, required_credits: 6 })
  ];
}
