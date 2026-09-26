/**
 * Programme catalogue for the admission explorer. Names/colleges follow https://yu.edu.sa/academics/; credit totals for
 * BSE/BCNE come from the official study plans (142 CH). Other totals, durations and every admission criterion are
 * ILLUSTRATIVE demo values and are labelled as such in the API and UI.
 */
export interface Criterion { key: string; label_en: string; label_ar: string; note: string }
export interface ProgramSeed {
  id: string; code: string; name_en: string; name_ar: string; college_en: string; college_ar: string; degree: string; total_credits: number; duration_years: number;
  description_en: string; description_ar: string; campus_ids: string[]; source_url: string; source_note: string; criteria: Criterion[];
}

const ADM = 'https://yu.edu.sa/admission/freshmen-students/';
const ILLUSTRATIVE = `Illustrative – see ${ADM} for the official requirements.`;
const base = (extra: Criterion[] = []): Criterion[] => [
  { key: 'high_school', label_en: 'Saudi high-school certificate (or equivalent)', label_ar: 'شهادة الثانوية العامة (أو ما يعادلها)', note: ILLUSTRATIVE },
  { key: 'qiyas', label_en: 'GAT / achievement test scores (Qiyas)', label_ar: 'درجات اختبار القدرات والتحصيلي (قياس)', note: ILLUSTRATIVE },
  { key: 'english', label_en: 'English placement (INTERLINK / orientation year)', label_ar: 'تحديد مستوى اللغة الإنجليزية (إنترلينك / السنة التحضيرية)', note: ILLUSTRATIVE },
  { key: 'id_document', label_en: 'National ID / Iqama copy', label_ar: 'صورة الهوية الوطنية / الإقامة', note: ILLUSTRATIVE },
  ...extra
];
const COEA = { college_en: 'College of Engineering & Architecture', college_ar: 'كلية الهندسة والعمارة' };
const COB = { college_en: 'College of Business', college_ar: 'كلية الأعمال' };
const COL = { college_en: 'College of Law', college_ar: 'كلية القانون' };
const BOTH = ['riyadh', 'khobar'];
const NOTE_OFFICIAL = 'Total credits from the official study plan (Aug 2026). Admission criteria are illustrative.';
const NOTE_DEMO = 'Credits and duration are illustrative demo values; programme exists per https://yu.edu.sa/academics/.';

export const PROGRAMS: ProgramSeed[] = [
  { id: 'bse', code: 'BSE', name_en: 'Software Engineering', name_ar: 'هندسة البرمجيات', ...COEA, degree: 'Bachelor of Science', total_credits: 142, duration_years: 4, description_en: 'Design, build and verify software systems: programming, requirements, architecture, quality assurance, cloud and a cooperative assignment in industry.', description_ar: 'تصميم وبناء واختبار أنظمة البرمجيات: البرمجة والمتطلبات والمعمارية وضمان الجودة والحوسبة السحابية وتدريب تعاوني في الصناعة.', campus_ids: BOTH, source_url: 'https://yu.edu.sa/academics/coea/swe/', source_note: NOTE_OFFICIAL, criteria: base([{ key: 'math', label_en: 'Science/maths track recommended', label_ar: 'يُفضّل المسار العلمي', note: ILLUSTRATIVE }]) },
  { id: 'bcne', code: 'BCNE', name_en: 'Computer Network Engineering', name_ar: 'هندسة شبكات الحاسب', ...COEA, degree: 'Bachelor of Science', total_credits: 142, duration_years: 4, description_en: 'Networks, protocols, switching and routing, wireless, IoT, network security, cloud infrastructure and datacentre administration.', description_ar: 'الشبكات والبروتوكولات والتبديل والتوجيه واللاسلكي وإنترنت الأشياء وأمن الشبكات والبنية السحابية وإدارة مراكز البيانات.', campus_ids: BOTH, source_url: 'https://yu.edu.sa/academics/coea/bnes/', source_note: NOTE_OFFICIAL, criteria: base([{ key: 'math', label_en: 'Science/maths track recommended', label_ar: 'يُفضّل المسار العلمي', note: ILLUSTRATIVE }]) },
  { id: 'aia', code: 'AIA', name_en: 'Architecture', name_ar: 'العمارة', ...COEA, degree: 'Bachelor of Architecture', total_credits: 160, duration_years: 5, description_en: 'Architectural design studios, building technology, urban context and professional practice.', description_ar: 'استوديوهات التصميم المعماري وتقنيات البناء والسياق العمراني والممارسة المهنية.', campus_ids: BOTH, source_url: 'https://yu.edu.sa/academics/', source_note: NOTE_DEMO, criteria: base([{ key: 'portfolio', label_en: 'Design aptitude interview (illustrative)', label_ar: 'مقابلة القدرات التصميمية (توضيحي)', note: ILLUSTRATIVE }]) },
  { id: 'ie', code: 'IE', name_en: 'Industrial Engineering', name_ar: 'الهندسة الصناعية', ...COEA, degree: 'Bachelor of Science', total_credits: 140, duration_years: 4, description_en: 'Operations, quality, supply chains, simulation and systems optimisation.', description_ar: 'العمليات والجودة وسلاسل الإمداد والمحاكاة وتحسين الأنظمة.', campus_ids: BOTH, source_url: 'https://yu.edu.sa/academics/', source_note: NOTE_DEMO, criteria: base() },
  { id: 'mis', code: 'MIS', name_en: 'Management Information Systems', name_ar: 'نظم المعلومات الإدارية', ...COB, degree: 'Bachelor of Science', total_credits: 129, duration_years: 4, description_en: 'Business analysis, databases, enterprise systems and digital transformation.', description_ar: 'تحليل الأعمال وقواعد البيانات والأنظمة المؤسسية والتحول الرقمي.', campus_ids: BOTH, source_url: 'https://yu.edu.sa/academics/', source_note: NOTE_DEMO, criteria: base() },
  { id: 'acc', code: 'ACC', name_en: 'Accounting', name_ar: 'المحاسبة', ...COB, degree: 'Bachelor of Science', total_credits: 129, duration_years: 4, description_en: 'Financial and managerial accounting, auditing, taxation and accounting information systems.', description_ar: 'المحاسبة المالية والإدارية والمراجعة والزكاة والضريبة ونظم المعلومات المحاسبية.', campus_ids: ['riyadh'], source_url: 'https://yu.edu.sa/academics/', source_note: NOTE_DEMO, criteria: base() },
  { id: 'fin', code: 'FIN', name_en: 'Finance', name_ar: 'المالية', ...COB, degree: 'Bachelor of Science', total_credits: 129, duration_years: 4, description_en: 'Corporate finance, investments, Islamic finance and financial markets.', description_ar: 'التمويل المؤسسي والاستثمار والتمويل الإسلامي والأسواق المالية.', campus_ids: ['riyadh'], source_url: 'https://yu.edu.sa/academics/', source_note: NOTE_DEMO, criteria: base() },
  { id: 'mgt', code: 'MGT', name_en: 'Management', name_ar: 'الإدارة', ...COB, degree: 'Bachelor of Science', total_credits: 129, duration_years: 4, description_en: 'Organisational behaviour, strategy, entrepreneurship and human resources.', description_ar: 'السلوك التنظيمي والاستراتيجية وريادة الأعمال والموارد البشرية.', campus_ids: ['riyadh'], source_url: 'https://yu.edu.sa/academics/', source_note: NOTE_DEMO, criteria: base() },
  { id: 'mkt', code: 'MKT', name_en: 'Marketing', name_ar: 'التسويق', ...COB, degree: 'Bachelor of Science', total_credits: 129, duration_years: 4, description_en: 'Consumer behaviour, digital marketing, branding and market research.', description_ar: 'سلوك المستهلك والتسويق الرقمي والعلامات التجارية وبحوث السوق.', campus_ids: ['riyadh'], source_url: 'https://yu.edu.sa/academics/', source_note: NOTE_DEMO, criteria: base() },
  { id: 'law', code: 'LAW', name_en: 'Law', name_ar: 'القانون', ...COL, degree: 'Bachelor of Law', total_credits: 132, duration_years: 4, description_en: 'Saudi legal system, commercial, administrative and international law with moot-court practice.', description_ar: 'النظام القانوني السعودي والقانون التجاري والإداري والدولي مع التدريب على المحاكمات الصورية.', campus_ids: BOTH, source_url: 'https://yu.edu.sa/academics/', source_note: NOTE_DEMO, criteria: base([{ key: 'arabic', label_en: 'Strong Arabic writing (illustrative)', label_ar: 'إتقان الكتابة بالعربية (توضيحي)', note: ILLUSTRATIVE }]) }
];

export interface ChecklistItem { key: string; required: boolean; label_en: string; label_ar: string; documentId: string | null; status: 'missing' | 'attached' }

export function defaultChecklist(): ChecklistItem[] {
  return [
    { key: 'id_document', required: true, label_en: 'National ID / Iqama copy', label_ar: 'صورة الهوية الوطنية / الإقامة', documentId: null, status: 'missing' },
    { key: 'high_school_certificate', required: true, label_en: 'High-school certificate', label_ar: 'شهادة الثانوية العامة', documentId: null, status: 'missing' },
    { key: 'english_score', required: true, label_en: 'English test score / placement evidence', label_ar: 'درجة اختبار اللغة الإنجليزية / إثبات تحديد المستوى', documentId: null, status: 'missing' },
    { key: 'photo', required: false, label_en: 'Personal photo', label_ar: 'صورة شخصية', documentId: null, status: 'missing' }
  ];
}

export const ONBOARDING_STEPS = [
  { key: 'orientation_session', label_en: 'Attend the orientation session', label_ar: 'حضور جلسة التهيئة', link: '/campus/events' },
  { key: 'id_card', label_en: 'Collect your student ID card', label_ar: 'استلام البطاقة الجامعية', link: '/campus/card' },
  { key: 'adviser', label_en: 'Meet your academic adviser (demo contact)', label_ar: 'مقابلة المرشد الأكاديمي (جهة اتصال تجريبية)', link: '/journey/onboarding' },
  { key: 'first_timetable', label_en: 'Set up your first timetable', label_ar: 'إعداد الجدول الدراسي الأول', link: '/academics/register' },
  { key: 'edugate_activation', label_en: 'Activate portal account (simulated)', label_ar: 'تفعيل حساب البوابة (محاكاة)', link: '/journey/onboarding' }
] as const;
