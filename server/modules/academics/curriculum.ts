/**
 * Curriculum data transcribed from server/seed/data/yu-curriculum.md (BSE V9.8 and BCNE V.2, Aug 2026).
 * Prerequisites are AND-of-OR groups. Program-specific overrides cover the few codes whose rule differs per program.
 * Descriptions are short original summaries (not copied from the university course descriptions).
 */
export const CURRICULUM_SOURCE = 'yu.edu.sa study plan V9.8 / CNE V.2 (Aug 2026)';

export type CourseCategory = 'gen' | 'hss_elective' | 'core' | 'major' | 'major_elective' | 'orientation';

export interface CourseDef {
  code: string;
  title_en: string;
  title_ar: string;
  credits: number;
  dept: string;
  level: number;
  prereqs: string[][];
  coreqs?: string[][];
  min_credits?: number;
  category: CourseCategory;
  description_en: string;
}

const C = (code: string, title_en: string, title_ar: string, credits: number, level: number, category: CourseCategory, description_en: string, prereqs: string[][] = [], extra: Partial<CourseDef> = {}): CourseDef => ({
  code, title_en, title_ar, credits, dept: code.split(' ')[0], level, category, description_en, prereqs, ...extra
});

export const COURSES: CourseDef[] = [
  // ---- Year 1
  C('CIS 103', 'Programming Fundamentals I', 'أساسيات البرمجة 1', 4, 1, 'core', 'First programming course: variables, control flow, functions and simple data handling in a modern language.'),
  C('CHM 101', 'General Chemistry', 'الكيمياء العامة', 4, 1, 'gen', 'Atomic structure, bonding, stoichiometry and reactions with a weekly laboratory.'),
  C('MTH 106', 'Discrete Mathematics', 'الرياضيات المتقطعة', 3, 1, 'gen', 'Logic, sets, relations, counting and graphs as the mathematical basis for computing.'),
  C('ENG 101', 'English Essay Writing', 'كتابة المقال بالإنجليزية', 3, 1, 'gen', 'Structured academic essay writing, paragraphing and revision in English.'),
  C('ISL 101', 'Foundation of Islamic Culture', 'أسس الثقافة الإسلامية', 2, 1, 'gen', 'Core concepts of Islamic culture and their place in personal and social life.'),
  C('CIS 104', 'Programming Fundamentals II', 'أساسيات البرمجة 2', 4, 2, 'core', 'Object-oriented programming, recursion, collections, files and exception handling.', [['CIS 103']]),
  C('PHY 103', 'Physics I', 'الفيزياء 1', 4, 2, 'gen', 'Mechanics: kinematics, Newton\'s laws, energy and momentum with laboratory work.'),
  C('MTH 104', 'Calculus I', 'التفاضل والتكامل 1', 3, 2, 'gen', 'Limits, derivatives and their applications, with an introduction to integration.'),
  C('STT 103', 'Probability and Statistics', 'الاحتمالات والإحصاء', 3, 2, 'gen', 'Descriptive statistics, probability models, sampling and basic inference.'),
  C('ARB 102', 'Communication Skills in Arabic', 'مهارات الاتصال بالعربية', 2, 2, 'gen', 'Spoken and written communication skills in standard Arabic.'),
  // ---- Year 2
  C('CIS 201', 'Fundamentals of Web Design', 'أساسيات تصميم الويب', 3, 3, 'core', 'Building accessible web pages with HTML, CSS and introductory client-side scripting.', [['CIS 103']]),
  C('CIS 202', 'Data Structures', 'هياكل البيانات', 3, 3, 'core', 'Lists, stacks, queues, trees, hashing and the algorithms that operate on them.', [['CIS 104']]),
  C('MIS 201', 'Introduction to Information Systems', 'مقدمة في نظم المعلومات', 3, 3, 'core', 'How organisations use information systems, data and processes to create value.'),
  C('PHY 203', 'Physics II', 'الفيزياء 2', 4, 3, 'gen', 'Electricity, magnetism and circuits with laboratory experiments.', [['PHY 103']]),
  C('MTH 204', 'Calculus II', 'التفاضل والتكامل 2', 3, 3, 'gen', 'Integration techniques, series and multivariable basics.', [['MTH 104']]),
  C('ISL 202', 'Financial Awareness', 'الوعي المالي', 2, 3, 'gen', 'Personal finance, budgeting and Islamic finance principles for everyday decisions.'),
  C('CIS 221', 'Introduction to Database Systems', 'مقدمة في نظم قواعد البيانات', 3, 4, 'core', 'Relational modelling, normalisation and SQL for querying and maintaining data.', [['CIS 104']]),
  C('SWE 202', 'Introduction to Software Engineering', 'مقدمة في هندسة البرمجيات', 3, 4, 'major', 'The software life cycle, teams, tooling and the engineering view of building software.', [['CIS 104']]),
  C('NES 212', 'Data Communications & Computer Networks', 'اتصالات البيانات وشبكات الحاسب', 3, 4, 'core', 'Layered network models, addressing, routing basics and transport protocols.', [['CIS 201']]),
  C('MTH 304', 'Differential Equations', 'المعادلات التفاضلية', 3, 4, 'gen', 'First and second order differential equations and their engineering applications.', [['MTH 204']]),
  C('ENG 201', 'Technical Report Writing', 'كتابة التقارير التقنية', 3, 4, 'gen', 'Planning, drafting and presenting technical reports and documentation.', [['ENG 101']]),
  C('ARB 202', 'Writing Skills in Arabic', 'مهارات الكتابة بالعربية', 2, 4, 'gen', 'Formal Arabic writing: structure, style and editing.'),
  // ---- Year 3
  C('CIS 304', 'Computer Architecture', 'معمارية الحاسب', 3, 5, 'core', 'Processor organisation, memory hierarchy, instruction sets and performance.', [['CIS 202', 'CNE 221']]),
  C('CIS 386', 'Project Management', 'إدارة المشاريع', 3, 5, 'core', 'Planning, estimating, scheduling and tracking technology projects.', [['SWE 202', 'CIS 221']]),
  C('CIS 383', 'Cyber Security and Cryptography', 'أمن المعلومات والتشفير', 3, 5, 'core', 'Threats, cryptographic primitives, authentication and secure system design.', [['NES 212', 'CNE 100']]),
  C('SWE 300', 'Software Process & Modelling', 'عمليات البرمجيات والنمذجة', 3, 5, 'major', 'Process models, UML modelling and agile practices for software teams.', [['SWE 202']]),
  C('SWE 301', 'Software Requirements Engineering', 'هندسة متطلبات البرمجيات', 3, 5, 'major', 'Eliciting, specifying, validating and managing software requirements.', [['SWE 202']]),
  C('MTH 301', 'Linear Algebra', 'الجبر الخطي', 3, 5, 'gen', 'Vectors, matrices, linear systems, eigenvalues and transformations.', [['MTH 104']]),
  C('CIS 321', 'Operating Systems', 'نظم التشغيل', 3, 6, 'core', 'Processes, scheduling, memory management, file systems and concurrency.', [['CIS 304']]),
  C('CIS 381', 'Computer Ethics', 'أخلاقيات الحاسب', 2, 6, 'core', 'Professional responsibility, privacy, intellectual property and ethical decision making in computing.', [['SWE 202']]),
  C('CIS 316', 'Introduction to Artificial Intelligence', 'مقدمة في الذكاء الاصطناعي', 3, 6, 'core', 'Search, knowledge representation, reasoning and an introduction to learning agents.', [['SWE 202']]),
  C('SWE 302', 'Software Architecture & Design', 'معمارية وتصميم البرمجيات', 3, 6, 'major', 'Architectural styles, design principles and documenting design decisions.', [['SWE 202']]),
  C('SWE 312', 'Software Construction & User Interface', 'بناء البرمجيات وواجهة المستخدم', 3, 6, 'major', 'Constructing maintainable code and usable interfaces with testing along the way.', [['SWE 202']]),
  C('SWE 322', 'Advanced Web Programming', 'برمجة الويب المتقدمة', 3, 6, 'major', 'Full-stack web applications: APIs, persistence, security and deployment.', [['CIS 201'], ['CIS 221']]),
  // ---- Year 4
  C('CIS 491', 'Graduation Project I', 'مشروع التخرج 1', 3, 7, 'core', 'Proposal, requirements and design phase of the capstone project.', [['SWE 300'], ['SWE 301'], ['SWE 302']], { min_credits: 90 }),
  C('CIS 443', 'Cloud Computing', 'الحوسبة السحابية', 3, 7, 'core', 'Virtualisation, cloud service models, containers and deploying to cloud platforms.', [['NES 212']]),
  C('SWE 321', 'Advanced User Interface Design', 'تصميم واجهات المستخدم المتقدم', 3, 7, 'major', 'Interaction design, prototyping and evaluating interfaces with users.', [['SWE 301']]),
  C('SWE 411', 'Software Verification & Validation', 'التحقق من البرمجيات والتثبت منها', 3, 7, 'major', 'Test design, coverage, reviews and static analysis for software quality.', [['SWE 312']]),
  C('SWE 410', 'Exit Exam Preparation', 'التحضير لاختبار الخروج', 1, 7, 'major', 'Structured review of the program outcomes ahead of the exit examination.', [['SWE 300'], ['SWE 301'], ['SWE 302']], { min_credits: 90 }),
  C('CIS 492', 'Graduation Project II', 'مشروع التخرج 2', 3, 8, 'core', 'Implementation, evaluation and defence of the capstone project.', [['CIS 491'], ['SWE 411']]),
  C('SWE 401', 'Software Quality Assurance', 'ضمان جودة البرمجيات', 3, 8, 'major', 'Quality models, metrics, audits and process improvement.', [['SWE 301']]),
  C('CSK 001', 'Career Skills', 'المهارات المهنية', 0, 8, 'gen', 'CV writing, interviews and workplace readiness (non-credit).'),
  C('CIS 490', 'Cooperative Assignment', 'التدريب التعاوني', 6, 8, 'core', 'Supervised work placement applying program knowledge in industry.', [['SWE 410']], { min_credits: 90 }),
  // ---- SWE electives
  C('SWE 402', 'Software Maintenance and Evolution', 'صيانة البرمجيات وتطورها', 3, 7, 'major_elective', 'Understanding, refactoring and evolving existing code bases.', [['SWE 312']]),
  C('SWE 413', 'Design Patterns', 'أنماط التصميم', 3, 7, 'major_elective', 'Reusable object-oriented design solutions and when to apply them.', [['SWE 302']]),
  C('SWE 414', 'Formal Methods in Software Engineering', 'الأساليب الشكلية في هندسة البرمجيات', 3, 7, 'major_elective', 'Specifying and verifying software behaviour with mathematical models.', [['SWE 202']]),
  C('SWE 415', 'Software Usability Engineering', 'هندسة قابلية استخدام البرمجيات', 3, 7, 'major_elective', 'Usability goals, user studies and measuring the experience of software.', [['SWE 301']]),
  C('CIS 222', 'Interactive Media', 'الوسائط التفاعلية', 3, 4, 'major_elective', 'Designing interactive media experiences with graphics, audio and animation.', [['CIS 201']]),
  C('SWE 412', 'Mobile Application Development', 'تطوير تطبيقات الأجهزة المحمولة', 3, 7, 'major_elective', 'Building native and cross-platform mobile apps with device features.', [['SWE 312']]),
  C('CIS 416', 'Introduction to Machine Learning', 'مقدمة في تعلم الآلة', 3, 7, 'major_elective', 'Supervised and unsupervised learning, evaluation and practical model building.', [['MTH 301'], ['STT 103'], ['CIS 316']]),
  C('NES 424', 'IoT Architectures, Protocols and Security', 'معماريات إنترنت الأشياء وبروتوكولاته وأمنه', 3, 7, 'major_elective', 'Connected-device architectures, messaging protocols and securing IoT deployments.', [['NES 212', 'CNE 200']]),
  C('NES 481', 'Security Policies and Procedures', 'سياسات وإجراءات الأمن', 3, 7, 'major_elective', 'Writing and auditing organisational security policies and incident procedures.', [['NES 212', 'CNE 100']]),
  C('SWE 421', 'Game Development', 'تطوير الألعاب', 3, 7, 'major_elective', 'Game loops, engines, physics and building a playable game as a team.', [['SWE 312']]),
  C('SWE 429', 'Selected Topics in Software Engineering', 'موضوعات مختارة في هندسة البرمجيات', 3, 7, 'major_elective', 'A rotating advanced topic reflecting current industry practice.', [['SWE 312']]),
  C('MIS 432', 'Enterprise Systems', 'نظم المؤسسات', 3, 7, 'major_elective', 'ERP and integrated enterprise platforms from selection to rollout.', [['CIS 221']]),
  // ---- HSS electives
  C('SOS 102', 'Introduction to Social Science', 'مقدمة في العلوم الاجتماعية', 3, 1, 'hss_elective', 'Key ideas from sociology, economics and political science.'),
  C('PHL 101', 'Critical Thinking', 'التفكير الناقد', 3, 1, 'hss_elective', 'Arguments, fallacies and evaluating evidence in everyday and academic contexts.'),
  C('PSY 101', 'Principles of Psychology', 'مبادئ علم النفس', 3, 1, 'hss_elective', 'Foundations of human behaviour, cognition, learning and motivation.'),
  C('SOS 101', 'Saudi Heritage', 'التراث السعودي', 3, 1, 'hss_elective', 'History, culture and heritage of the Kingdom of Saudi Arabia.'),
  C('FRE 106', 'Conversational French 1', 'الفرنسية للمحادثة 1', 3, 1, 'hss_elective', 'Everyday spoken French for beginners.'),
  C('CHI 107', 'Chinese Language', 'اللغة الصينية', 3, 1, 'hss_elective', 'Introductory Mandarin: pronunciation, characters and basic conversation.'),
  C('ENG 103', 'Introduction to English Literature', 'مقدمة في الأدب الإنجليزي', 3, 1, 'hss_elective', 'Reading and discussing short fiction, poetry and drama in English.'),
  // ---- BCNE-specific
  C('CNE 100', 'Data Communications and Computer Networks', 'اتصالات البيانات وشبكات الحاسب', 3, 2, 'major', 'Signals, media, framing and the layered architecture of computer networks.', [['CIS 103']]),
  C('CNE 200', 'Network Protocols & Architecture', 'بروتوكولات الشبكات ومعماريتها', 3, 3, 'major', 'TCP/IP protocol suite, addressing, name resolution and application protocols.', [['CNE 100']]),
  C('CNE 221', 'Digital Logic and Design', 'المنطق الرقمي والتصميم', 3, 4, 'major', 'Boolean algebra, combinational and sequential circuits and simple digital systems.', [['MTH 106']]),
  C('CNE 300', 'Switching and Routing', 'التبديل والتوجيه', 3, 4, 'major', 'Configuring switches and routers, VLANs and dynamic routing protocols.', [['CNE 200']]),
  C('CNE 303', 'Wireless Networks', 'الشبكات اللاسلكية', 3, 5, 'major', 'Radio fundamentals, WLAN standards, mobility and wireless security.', [['CNE 200']]),
  C('CNE 305', 'Internet of Things', 'إنترنت الأشياء', 3, 5, 'major', 'Sensors, gateways and cloud back-ends for connected-device solutions.', [['CNE 200']]),
  C('CIS 306', 'Embedded Systems', 'النظم المدمجة', 3, 6, 'core', 'Microcontrollers, interfacing and real-time programming for embedded devices.', [['CIS 304']]),
  C('CNE 307', 'Network Security', 'أمن الشبكات', 3, 6, 'major', 'Firewalls, VPNs, intrusion detection and hardening network infrastructure.', [['CIS 383'], ['CNE 200']]),
  C('CNE 308', 'Network Design and Modelling', 'تصميم الشبكات ونمذجتها', 3, 6, 'major', 'Requirements-driven network design, capacity planning and simulation.', [['CNE 300']]),
  C('CNE 310', 'Network Programming', 'برمجة الشبكات', 3, 6, 'major', 'Socket programming, network automation and scripting for infrastructure.', [['CNE 200']]),
  C('CNE 405', 'Cloud Infrastructure Design', 'تصميم البنية التحتية السحابية', 2, 7, 'major', 'Designing resilient virtual networks and compute in public cloud platforms.', [['CNE 300']]),
  C('CNE 406', 'Computer Network Management', 'إدارة شبكات الحاسب', 3, 7, 'major', 'Monitoring, SNMP, configuration management and network operations.', [['CNE 300']]),
  C('CNE 410', 'Exit Exam Preparation', 'التحضير لاختبار الخروج', 1, 7, 'major', 'Structured review of network engineering outcomes ahead of the exit examination.', [['CNE 308'], ['CIS 386']], { min_credits: 92 }),
  C('CNE 411', 'Datacenters and System Administration', 'مراكز البيانات وإدارة النظم', 3, 8, 'major', 'Server, storage and datacenter network operations with automation.', [['CIS 321'], ['CNE 300']]),
  C('CNE 412', 'Virtual Network Design and Implementation', 'تصميم الشبكات الافتراضية وتنفيذها', 3, 8, 'major', 'SDN, overlays and network function virtualisation in practice.', [['CNE 300']]),
  C('CNE 420', 'Digital Forensics', 'التحقيق الجنائي الرقمي', 3, 7, 'major_elective', 'Evidence acquisition, analysis and reporting for digital investigations.', [['CNE 307']]),
  C('CNE 425', 'Ethical Hacking', 'الاختراق الأخلاقي', 3, 7, 'major_elective', 'Authorised penetration testing methods, tooling and responsible reporting.', [['CNE 307']])
];

export const COURSE_BY_CODE = new Map(COURSES.map((c) => [c.code, c]));

/** Program-specific prerequisite rules where the BCNE plan differs from the BSE default stored in `courses`. */
export const PROGRAM_PREREQS: Record<string, Record<string, { prereqs: string[][]; min_credits?: number }>> = {
  bcne: {
    'CIS 304': { prereqs: [['CNE 221']] },
    'CIS 383': { prereqs: [['CNE 100']] },
    'CIS 386': { prereqs: [['CIS 221']] },
    'MTH 301': { prereqs: [['MTH 104'], ['MTH 106']] },
    'CIS 416': { prereqs: [['MTH 301']] },
    'CIS 491': { prereqs: [['CNE 308'], ['CIS 386']], min_credits: 90 },
    'CIS 492': { prereqs: [['CIS 491']] },
    'CIS 490': { prereqs: [['CNE 308']], min_credits: 90 },
    'NES 424': { prereqs: [['CNE 200']] },
    'NES 481': { prereqs: [['CNE 100']] }
  }
};

export const HSS_ELECTIVES = ['SOS 102', 'PHL 101', 'PSY 101', 'SOS 101', 'FRE 106', 'CHI 107', 'ENG 103'];
export const SWE_ELECTIVES = ['SWE 402', 'SWE 413', 'SWE 414', 'SWE 415', 'CIS 222', 'SWE 412', 'CIS 416', 'NES 424', 'NES 481', 'SWE 421', 'SWE 429', 'MIS 432'];
export const CNE_ELECTIVES = ['NES 424', 'NES 481', 'CNE 420', 'CNE 425'];

export type PlanSlot = string | { elective: string; label_en: string; label_ar: string; credits?: number; pool?: string[] };
export interface PlanTerm { year: number; sem: number; label_en: string; label_ar: string; slots: PlanSlot[] }

const HSS = (n: string, ar: string): PlanSlot => ({ elective: 'hss', label_en: `HSS Elective ${n}`, label_ar: `مقرر إنساني اختياري ${ar}` });
const SWE = (n: string, ar: string): PlanSlot => ({ elective: 'swe', label_en: `SWE Elective ${n}`, label_ar: `مقرر اختياري تخصصي ${ar}` });
const CNE = (n: string, ar: string): PlanSlot => ({ elective: 'cne', label_en: `CNE Elective ${n}`, label_ar: `مقرر اختياري تخصصي ${ar}` });

export const BSE_PLAN: PlanTerm[] = [
  { year: 1, sem: 1, label_en: 'Year 1 · Semester 1', label_ar: 'السنة 1 · الفصل 1', slots: ['CIS 103', 'CHM 101', 'MTH 106', 'ENG 101', 'ISL 101', HSS('I', '1')] },
  { year: 1, sem: 2, label_en: 'Year 1 · Semester 2', label_ar: 'السنة 1 · الفصل 2', slots: ['CIS 104', 'PHY 103', 'MTH 104', 'STT 103', 'ARB 102', HSS('II', '2')] },
  { year: 2, sem: 1, label_en: 'Year 2 · Semester 1', label_ar: 'السنة 2 · الفصل 1', slots: ['CIS 201', 'CIS 202', 'MIS 201', 'PHY 203', 'MTH 204', 'ISL 202'] },
  { year: 2, sem: 2, label_en: 'Year 2 · Semester 2', label_ar: 'السنة 2 · الفصل 2', slots: ['CIS 221', 'SWE 202', 'NES 212', 'MTH 304', 'ENG 201', 'ARB 202'] },
  { year: 3, sem: 1, label_en: 'Year 3 · Semester 1', label_ar: 'السنة 3 · الفصل 1', slots: ['CIS 304', 'CIS 386', 'CIS 383', 'SWE 300', 'SWE 301', 'MTH 301'] },
  { year: 3, sem: 2, label_en: 'Year 3 · Semester 2', label_ar: 'السنة 3 · الفصل 2', slots: ['CIS 321', 'CIS 381', 'CIS 316', 'SWE 302', 'SWE 312', 'SWE 322'] },
  { year: 4, sem: 1, label_en: 'Year 4 · Semester 1', label_ar: 'السنة 4 · الفصل 1', slots: ['CIS 491', 'CIS 443', 'SWE 321', 'SWE 411', SWE('I', '1'), 'SWE 410'] },
  { year: 4, sem: 2, label_en: 'Year 4 · Semester 2', label_ar: 'السنة 4 · الفصل 2', slots: ['CIS 492', 'SWE 401', SWE('II', '2'), SWE('III', '3'), 'CSK 001'] },
  { year: 4, sem: 3, label_en: 'Year 4 · Summer', label_ar: 'السنة 4 · الصيف', slots: ['CIS 490'] }
];

export const BCNE_PLAN: PlanTerm[] = [
  { year: 1, sem: 1, label_en: 'Year 1 · Semester 1', label_ar: 'السنة 1 · الفصل 1', slots: ['CIS 103', 'CHM 101', 'MTH 106', 'ENG 101', 'ISL 101', HSS('I', '1')] },
  { year: 1, sem: 2, label_en: 'Year 1 · Semester 2', label_ar: 'السنة 1 · الفصل 2', slots: ['CIS 104', 'CNE 100', 'MTH 104', 'PHY 103', 'ARB 102', HSS('II', '2')] },
  { year: 2, sem: 1, label_en: 'Year 2 · Semester 1', label_ar: 'السنة 2 · الفصل 1', slots: ['CIS 202', 'CNE 200', 'MTH 204', 'PHY 203', 'ENG 201'] },
  { year: 2, sem: 2, label_en: 'Year 2 · Semester 2', label_ar: 'السنة 2 · الفصل 2', slots: ['CIS 221', 'CNE 300', 'CNE 221', 'MTH 301', 'STT 103', 'ARB 202', 'ISL 202'] },
  { year: 3, sem: 1, label_en: 'Year 3 · Semester 1', label_ar: 'السنة 3 · الفصل 1', slots: ['CIS 304', 'CIS 383', 'CIS 386', 'CNE 303', 'CNE 305', 'MTH 304'] },
  { year: 3, sem: 2, label_en: 'Year 3 · Semester 2', label_ar: 'السنة 3 · الفصل 2', slots: [CNE('I', '1'), 'CIS 306', 'CIS 321', 'CNE 307', 'CNE 308', 'CNE 310'] },
  { year: 4, sem: 1, label_en: 'Year 4 · Semester 1', label_ar: 'السنة 4 · الفصل 1', slots: [CNE('II', '2'), 'CNE 405', 'CNE 406', 'CIS 416', 'CIS 491', 'CNE 410'] },
  { year: 4, sem: 2, label_en: 'Year 4 · Semester 2', label_ar: 'السنة 4 · الفصل 2', slots: [CNE('III', '3'), 'CNE 411', 'CNE 412', 'CIS 492', 'CSK 001'] },
  { year: 4, sem: 3, label_en: 'Year 4 · Summer', label_ar: 'السنة 4 · الصيف', slots: ['CIS 490'] }
];

export const PLANS: Record<string, PlanTerm[]> = { bse: BSE_PLAN, bcne: BCNE_PLAN };

export interface RequirementDef { id: string; category: string; label_en: string; label_ar: string; course_codes: string[]; min_courses?: number; required_credits?: number }

function sumCredits(codes: string[]) {
  return codes.reduce((s, c) => s + (COURSE_BY_CODE.get(c)?.credits ?? 0), 0);
}

// Bucket credit totals are computed from the course credits so the sum is exactly 142 for both programs.
export const REQUIREMENTS: Record<string, RequirementDef[]> = {
  bse: [
    { id: 'bse_univ', category: 'university_core', label_en: 'University core', label_ar: 'متطلبات الجامعة', course_codes: ['ISL 101', 'ISL 202', 'ARB 102', 'ARB 202', 'ENG 101', 'ENG 201'] },
    { id: 'bse_hss', category: 'hss_elective', label_en: 'HSS electives', label_ar: 'المقررات الإنسانية الاختيارية', course_codes: HSS_ELECTIVES, min_courses: 2, required_credits: 6 },
    { id: 'bse_math', category: 'math_science', label_en: 'Mathematics & science', label_ar: 'الرياضيات والعلوم', course_codes: ['CHM 101', 'PHY 103', 'PHY 203', 'MTH 104', 'MTH 106', 'MTH 204', 'MTH 301', 'MTH 304', 'STT 103'] },
    { id: 'bse_college', category: 'college_core', label_en: 'College core', label_ar: 'متطلبات الكلية', course_codes: ['CIS 103', 'CIS 104', 'CIS 201', 'CIS 202', 'CIS 221', 'MIS 201', 'NES 212', 'CIS 304', 'CIS 321', 'CIS 386', 'CIS 383', 'CIS 381', 'CIS 316', 'CIS 443', 'CIS 491', 'CIS 492', 'CIS 490'] },
    { id: 'bse_major', category: 'major_core', label_en: 'Software engineering core', label_ar: 'متطلبات التخصص', course_codes: ['SWE 202', 'SWE 300', 'SWE 301', 'SWE 302', 'SWE 312', 'SWE 322', 'SWE 321', 'SWE 411', 'SWE 401', 'SWE 410'] },
    { id: 'bse_elective', category: 'major_elective', label_en: 'SWE electives', label_ar: 'المقررات الاختيارية التخصصية', course_codes: SWE_ELECTIVES, min_courses: 3, required_credits: 9 },
    { id: 'bse_career', category: 'career', label_en: 'Career skills (non-credit)', label_ar: 'المهارات المهنية (بدون ساعات)', course_codes: ['CSK 001'], required_credits: 0 }
  ],
  bcne: [
    { id: 'bcne_univ', category: 'university_core', label_en: 'University core', label_ar: 'متطلبات الجامعة', course_codes: ['ISL 101', 'ISL 202', 'ARB 102', 'ARB 202', 'ENG 101', 'ENG 201'] },
    { id: 'bcne_hss', category: 'hss_elective', label_en: 'HSS electives', label_ar: 'المقررات الإنسانية الاختيارية', course_codes: HSS_ELECTIVES, min_courses: 2, required_credits: 6 },
    { id: 'bcne_math', category: 'math_science', label_en: 'Mathematics & science', label_ar: 'الرياضيات والعلوم', course_codes: ['CHM 101', 'MTH 106', 'MTH 104', 'PHY 103', 'MTH 204', 'PHY 203', 'MTH 301', 'STT 103', 'MTH 304'] },
    { id: 'bcne_college', category: 'college_core', label_en: 'College core', label_ar: 'متطلبات الكلية', course_codes: ['CIS 103', 'CIS 104', 'CIS 202', 'CIS 221', 'CIS 304', 'CIS 383', 'CIS 386', 'CIS 306', 'CIS 321', 'CIS 416', 'CIS 491', 'CIS 492', 'CIS 490'] },
    { id: 'bcne_major', category: 'major_core', label_en: 'Network engineering core', label_ar: 'متطلبات التخصص', course_codes: ['CNE 100', 'CNE 200', 'CNE 221', 'CNE 300', 'CNE 303', 'CNE 305', 'CNE 307', 'CNE 308', 'CNE 310', 'CNE 405', 'CNE 406', 'CNE 410', 'CNE 411', 'CNE 412'] },
    { id: 'bcne_elective', category: 'major_elective', label_en: 'CNE electives', label_ar: 'المقررات الاختيارية التخصصية', course_codes: CNE_ELECTIVES, min_courses: 3, required_credits: 9 },
    { id: 'bcne_career', category: 'career', label_en: 'Career skills (non-credit)', label_ar: 'المهارات المهنية (بدون ساعات)', course_codes: ['CSK 001'], required_credits: 0 }
  ]
};

export function requirementCredits(r: RequirementDef): number {
  return r.required_credits ?? sumCredits(r.course_codes);
}

/** Codes that belong to a program (plan slots + elective pools). */
export function programCourseCodes(programId: string): string[] {
  const reqs = REQUIREMENTS[programId] ?? REQUIREMENTS.bse;
  const set = new Set<string>();
  for (const r of reqs) for (const c of r.course_codes) set.add(c);
  return [...set];
}

/** Effective prerequisite rule for a course within a program. */
export function prereqRule(code: string, programId: string | null): { prereqs: string[][]; coreqs: string[][]; min_credits: number } {
  const base = COURSE_BY_CODE.get(code);
  const override = programId ? PROGRAM_PREREQS[programId]?.[code] : undefined;
  return {
    prereqs: override?.prereqs ?? base?.prereqs ?? [],
    coreqs: base?.coreqs ?? [],
    min_credits: override?.min_credits ?? base?.min_credits ?? 0
  };
}

/** Term id helpers: `${year}-1` = Fall year, `${year}-2` = Spring year+1, `${year}-3` = Summer year+1. */
export function termSequence(startTerm: string, count: number): string[] {
  const [y, s] = startTerm.split('-').map(Number);
  const out: string[] = [];
  let year = y, sem = s;
  for (let i = 0; i < count; i++) {
    out.push(`${year}-${sem}`);
    if (sem === 1) sem = 2; else { sem = 1; year += 1; }
  }
  return out;
}
