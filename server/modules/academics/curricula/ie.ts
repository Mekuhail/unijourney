/**
 * B.Sc. Industrial Engineering. Transcribed from the IE study plan (Feb 2022).
 * The semester sub-totals (18+15+18+16+16+17+17+13) plus the 6-credit co-op give 136 credits; the plan states no grand total.
 */
import type { CourseCategory, CourseDef, PlanSlot, PlanTerm, RequirementDef } from '../curriculum.ts';
import { COURSE_BY_CODE } from '../curriculum.ts';
import type { ProgramCurriculum } from './index.ts';

const C = (code: string, title_en: string, title_ar: string, credits: number, level: number, category: CourseCategory, description_en: string, prereqs: string[][] = [], extra: Partial<CourseDef> = {}): CourseDef => ({
  code, title_en, title_ar, credits, dept: code.split(' ')[0], level, category, description_en, prereqs, ...extra
});

const courses: CourseDef[] = [
  // ---- Year 1
  C('MGT 101', 'Introduction to Management', 'مقدمة في الإدارة', 3, 1, 'core', 'Planning, organising, leading and controlling as the basic functions of managers in organisations.'),
  C('MTH 211', 'Calculus II', 'التفاضل والتكامل 2', 4, 2, 'gen', 'Integration techniques, sequences and series, and an introduction to functions of several variables.', [['MTH 104']]),
  // ---- Year 2
  C('MTH 301', 'Linear Algebra', 'الجبر الخطي', 3, 3, 'gen', 'Vectors, matrices, linear systems, eigenvalues and transformations.'),
  C('MTH 105', 'Discrete Mathematics', 'الرياضيات المتقطعة', 4, 3, 'gen', 'Logic, sets, relations, counting and graphs as a foundation for engineering computation.'),
  C('ENR 201', 'Engineering Drawing and CAD', 'الرسم الهندسي والتصميم بمساعدة الحاسب', 3, 3, 'core', 'Orthographic projection, dimensioning and producing engineering drawings with CAD software.', [['ENG 101']]),
  C('ENR 203', 'Statics and Strength of Materials', 'الاستاتيكا ومقاومة المواد', 3, 3, 'core', 'Force systems, equilibrium, stress and strain in structural and machine elements.', [['MTH 104'], ['PHY 103']]),
  C('MEG 211', 'Fundamentals of Materials Engineering', 'أساسيات هندسة المواد', 3, 3, 'core', 'Structure, properties and selection of metals, polymers, ceramics and composites.', [['PHY 103'], ['CHM 101']]),
  C('CIS 103', 'Programming Fundamentals I', 'أساسيات البرمجة 1', 4, 4, 'core', 'First programming course: variables, control flow, functions and simple data handling in a modern language.', [['MTH 104']]),
  C('MTH 302', 'Differential Equations', 'المعادلات التفاضلية', 4, 4, 'gen', 'Ordinary differential equations, Laplace transforms and their engineering applications.', [['MTH 211']]),
  C('IEG 201', 'Introduction to Engineering Design', 'مقدمة في التصميم الهندسي', 2, 4, 'major', 'The engineering design process practised on a small team project from need to prototype.', [['ENR 201']]),
  C('IEG 311', 'Production and Inventory Systems', 'نظم الإنتاج والمخزون', 3, 4, 'major', 'Forecasting, aggregate planning, inventory models and material requirements planning.', [['STT 103']]),
  C('IEG 301', 'Design of Experiments', 'تصميم التجارب', 3, 4, 'major', 'Planning experiments and analysing variance to improve products and processes.', [['STT 103']]),
  // ---- Year 3
  C('IEG 302', 'Engineering Reliability', 'الموثوقية الهندسية', 2, 5, 'major', 'Failure distributions, system reliability models and maintenance planning.', [['IEG 301']]),
  C('IEG 303', 'Quality Control', 'ضبط الجودة', 3, 5, 'major', 'Statistical process control, control charts, acceptance sampling and process capability.', [['IEG 301']]),
  C('IEG 312', 'Operation Management', 'إدارة العمليات', 3, 5, 'major', 'Managing production and service operations: capacity, scheduling and process improvement.', [['IEG 311']]),
  C('IEG 321', 'Operation Research I', 'بحوث العمليات 1', 3, 5, 'major', 'Linear programming, the simplex method, duality and transportation and assignment models.', [['MTH 301'], ['CIS 103']]),
  C('IEG 341', 'Manufacturing Processes I', 'عمليات التصنيع 1', 3, 5, 'major', 'Casting, forming, machining and joining processes and how they shape engineering materials.', [['MEG 211']]),
  C('IEG 345', 'Industrial Control Systems and Automation', 'نظم التحكم الصناعي والأتمتة', 3, 6, 'major', 'Sensors, PLCs and control loops used to automate industrial processes.', [['CIS 103'], ['PHY 203']]),
  C('IEG 322', 'Operation Research II', 'بحوث العمليات 2', 3, 6, 'major', 'Integer, dynamic and network programming, queueing and decision models.', [['IEG 321']]),
  C('IEG 332', 'Work Design and Analysis', 'تصميم العمل وتحليله', 3, 6, 'major', 'Methods study, time standards and designing tasks for productivity and safety.', [['IEG 341']]),
  C('IEG 323', 'Systems Simulation', 'محاكاة النظم', 3, 6, 'major', 'Discrete-event simulation modelling, input analysis and interpreting simulation output.', [['IEG 321']]),
  C('ISL 201', 'Foundation of Islamic Economy', 'أسس الاقتصاد الإسلامي', 2, 6, 'gen', 'Principles of the Islamic economic system and their application in modern life.'),
  C('IEG 342', 'Manufacturing Processes II', 'عمليات التصنيع 2', 3, 6, 'major', 'Advanced and non-traditional manufacturing processes and process selection.', [['IEG 341']]),
  // ---- Year 4
  C('IEG 351', 'Manufacturing Systems', 'نظم التصنيع', 3, 7, 'major', 'Cellular, flexible and lean manufacturing systems and their design.', [['IEG 302'], ['IEG 312']]),
  C('IEG 304', 'Engineering Economy and Costing', 'الاقتصاد الهندسي والتكاليف', 3, 7, 'major', 'Time value of money, comparing alternatives and estimating costs of engineering projects.', [['MTH 302']]),
  C('IEG 431', 'Ergonomics', 'الهندسة البشرية', 3, 7, 'major', 'Fitting work, tools and environments to human capabilities and limits.', [['IEG 332']]),
  C('IEG 450', 'Industrial Facility Design and Material Handling', 'تصميم المنشآت الصناعية ومناولة المواد', 3, 7, 'major', 'Plant layout, flow analysis and selecting material handling systems.', [['IEG 322'], ['IEG 332']]),
  C('IEG 490', 'Graduation Design Project I', 'مشروع التخرج التصميمي 1', 2, 7, 'major', 'Problem definition, literature review and design proposal for the capstone project.', [], { min_credits: 90 }),
  C('ISL 301', 'Work Ethics in Islam', 'أخلاقيات العمل في الإسلام', 2, 8, 'gen', 'Islamic values and professional ethics in the workplace.'),
  C('IEG 400', 'Product Development and Innovation', 'تطوير المنتجات والابتكار', 3, 8, 'major', 'Taking a product from concept through design, prototyping and launch.', [['IEG 201'], ['IEG 303']]),
  C('IEG 411', 'Project Management', 'إدارة المشاريع', 3, 8, 'major', 'Scheduling, resourcing, risk and control of engineering projects.', [['IEG 312']]),
  C('IEG 491', 'Graduation Design Project II', 'مشروع التخرج التصميمي 2', 2, 8, 'major', 'Implementation, evaluation and defence of the capstone design project.', [['IEG 490']]),
  C('IEG 497', 'Co-op Practical Training', 'التدريب التعاوني العملي', 6, 8, 'major', 'Supervised industrial placement applying industrial engineering methods (CSK 001 recommended first).', [], { min_credits: 90 }),
  // ---- IE electives (two courses)
  C('IEG 403', 'Six Sigma and Lean Operations', 'ستة سيجما والعمليات الرشيقة', 3, 7, 'major_elective', 'DMAIC problem solving and lean tools for eliminating waste and variation.', [['IEG 301'], ['IEG 303']]),
  C('IEG 413', 'Supply Chain', 'سلسلة الإمداد', 3, 7, 'major_elective', 'Designing and coordinating supply networks from suppliers to customers.', [['IEG 312']]),
  C('IEG 414', 'Production System Operations', 'عمليات نظم الإنتاج', 3, 7, 'major_elective', 'Scheduling, line balancing and control of production systems.', [['IEG 312']]),
  C('IEG 430', 'Safety Engineering', 'هندسة السلامة', 3, 7, 'major_elective', 'Hazard analysis, risk assessment and designing safe industrial workplaces.', [['IEG 431']]),
  C('IEG 433', 'Ergonomic Design', 'التصميم وفق الهندسة البشرية', 3, 7, 'major_elective', 'Applying ergonomic principles to the design of products, workstations and interfaces.', [['IEG 332'], ['IEG 431']]),
  C('IEG 446', 'Direct Digital Manufacturing', 'التصنيع الرقمي المباشر', 3, 7, 'major_elective', 'Additive manufacturing technologies and producing parts directly from digital models.', [['IEG 342']]),
  C('IEG 447', 'Computer Integrated Manufacturing', 'التصنيع المتكامل بالحاسب', 3, 7, 'major_elective', 'Integrating CAD, CAM, robotics and control into a computer-driven factory.', [['IEG 345']]),
  C('MIS 312', 'Database Management', 'إدارة قواعد البيانات', 3, 7, 'major_elective', 'Relational database design and SQL for engineering and business data.', [['CIS 103']])
];

const byCode = new Map(courses.map((c) => [c.code, c]));
const credits = (codes: string[]) => codes.reduce((s, c) => s + (byCode.get(c)?.credits ?? COURSE_BY_CODE.get(c)?.credits ?? 0), 0);
const bucket = (id: string, category: string, label_en: string, label_ar: string, course_codes: string[], extra: Partial<RequirementDef> = {}): RequirementDef =>
  ({ id, category, label_en, label_ar, course_codes, required_credits: credits(course_codes), ...extra });

const IE_HSS = ['SOS 102', 'PHL 101', 'PSY 101', 'SOS 101', 'FRE 106'];
const IE_ELECTIVES = ['IEG 403', 'IEG 413', 'IEG 414', 'IEG 430', 'IEG 433', 'IEG 446', 'IEG 447', 'MIS 312'];
const HSS: PlanSlot = { elective: 'hss', label_en: 'Humanities / Social Science Elective', label_ar: 'مقرر إنساني/اجتماعي اختياري', credits: 3 };
const IE = (n: string, ar: string): PlanSlot => ({ elective: 'major', label_en: `IE Elective ${n}`, label_ar: `مقرر اختياري تخصصي ${ar}`, credits: 3 });
const T = (year: number, sem: number, slots: PlanSlot[]): PlanTerm => ({ year, sem, label_en: `Year ${year} · Semester ${sem}`, label_ar: `السنة ${year} · الفصل ${sem}`, slots });

const plan: PlanTerm[] = [
  T(1, 1, ['ENG 101', 'MTH 104', HSS, 'PHY 103', 'MGT 101', 'ARB 102']),
  T(1, 2, ['STT 103', 'MTH 211', 'PHY 203', 'CHM 101']),
  T(2, 1, ['MTH 301', 'MTH 105', 'ENR 201', 'ENR 203', 'MEG 211', 'ISL 101']),
  T(2, 2, ['CIS 103', 'MTH 302', 'IEG 201', 'IEG 311', 'IEG 301']),
  T(3, 1, ['IEG 302', 'ARB 202', 'IEG 303', 'IEG 312', 'IEG 321', 'IEG 341']),
  T(3, 2, ['IEG 345', 'IEG 322', 'IEG 332', 'IEG 323', 'ISL 201', 'IEG 342']),
  T(4, 1, ['IEG 351', 'IEG 304', 'IEG 431', 'IEG 450', IE('I', '1'), 'IEG 490']),
  T(4, 2, ['ISL 301', 'IEG 400', 'IEG 411', IE('II', '2'), 'IEG 491', 'CSK 001']),
  { year: 4, sem: 3, label_en: 'Year 4 · Summer (Co-op)', label_ar: 'السنة 4 · الصيف (التدريب التعاوني)', slots: ['IEG 497'] }
];

const IE_MAJOR = ['IEG 201', 'IEG 311', 'IEG 301', 'IEG 302', 'IEG 303', 'IEG 312', 'IEG 321', 'IEG 341', 'IEG 345', 'IEG 322', 'IEG 332', 'IEG 323', 'IEG 342', 'IEG 351', 'IEG 304', 'IEG 431', 'IEG 450', 'IEG 490', 'IEG 400', 'IEG 411', 'IEG 491', 'IEG 497'];

export const ieCurriculum: ProgramCurriculum = {
  program: {
    id: 'ie', code: 'IE', name_en: 'Industrial Engineering', name_ar: 'الهندسة الصناعية',
    college_id: 'coea', college_en: 'College of Engineering & Architecture', college_ar: 'كلية الهندسة والعمارة',
    degree: 'B.Sc. in Industrial Engineering', total_credits: 136, duration_years: 4,
    source_url: 'https://yu.edu.sa/wp-content/uploads/2022/02/IE-Study-Plan_Updated_Feb-2022.pdf',
    source_version: 'Study plan (Feb 2022)',
    source_note: 'The plan states no grand total; the eight semester sub-totals plus the 6-credit co-op give 136 credits. Stacked prerequisite cells are read as "and". Orientation (ORN) and placement (MTH 001) prerequisites omitted. CIS 103 and MTH 301 are re-listed because their prerequisites differ from the software engineering plan. This plan uses MTH 211/MTH 105/MTH 302 rather than the MTH 204/106/304 codes of the newer engineering plans.',
    campus_ids: ['riyadh', 'khobar']
  },
  courses,
  plan,
  requirements: [
    bucket('ie_univ', 'university_core', 'University core', 'متطلبات الجامعة', ['ENG 101', 'ARB 102', 'ARB 202', 'ISL 101', 'ISL 201', 'ISL 301']),
    bucket('ie_hss', 'hss_elective', 'Humanities / social science elective', 'المقرر الإنساني/الاجتماعي الاختياري', IE_HSS, { min_courses: 1, required_credits: 3 }),
    bucket('ie_math', 'math_science', 'Mathematics & science', 'الرياضيات والعلوم', ['MTH 104', 'MTH 211', 'MTH 301', 'MTH 105', 'MTH 302', 'STT 103', 'PHY 103', 'PHY 203', 'CHM 101']),
    bucket('ie_college', 'college_core', 'Engineering & business foundations', 'متطلبات الكلية', ['MGT 101', 'CIS 103', 'ENR 201', 'ENR 203', 'MEG 211']),
    bucket('ie_major', 'major_core', 'Industrial engineering core', 'متطلبات التخصص', IE_MAJOR),
    bucket('ie_elective', 'major_elective', 'IE electives', 'المقررات الاختيارية التخصصية', IE_ELECTIVES, { min_courses: 2, required_credits: 6 }),
    bucket('ie_career', 'career', 'Career skills (non-credit)', 'المهارات المهنية (بدون ساعات)', ['CSK 001'], { required_credits: 0 })
  ],
  electivePools: { hss: IE_HSS, major: IE_ELECTIVES }
};
