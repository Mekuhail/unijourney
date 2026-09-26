/**
 * Bachelor of Architecture (five years). Transcribed from "Curriculum of Bachelor of Architecture – NEW, YU-COE August 2026, 161 CR".
 * Semester sub-totals 17+18+18+17+16+16+17+13 + co-op 6 + 13+10 = 161, matching the stated total.
 */
import type { CourseCategory, CourseDef, PlanSlot, PlanTerm, RequirementDef } from '../curriculum.ts';
import { COURSE_BY_CODE } from '../curriculum.ts';
import type { ProgramCurriculum } from './index.ts';

const C = (code: string, title_en: string, title_ar: string, credits: number, level: number, category: CourseCategory, description_en: string, prereqs: string[][] = [], extra: Partial<CourseDef> = {}): CourseDef => ({
  code, title_en, title_ar, credits, dept: code.split(' ')[0], level, category, description_en, prereqs, ...extra
});

const EL = (code: string, title_en: string, title_ar: string, description_en: string) => C(code, title_en, title_ar, 2, 7, 'major_elective', description_en, [['ARCH 311']]);

const courses: CourseDef[] = [
  // ---- Year 1
  C('ARCH 101', 'Basic Design Studio I', 'استوديو التصميم الأساسي 1', 3, 1, 'major', 'Studio exercises in composition, form, colour and space as the visual language of design.', [], { coreqs: [['ARCH 102']] }),
  C('ARCH 102', 'Architectural Drawing I', 'الرسم المعماري 1', 3, 1, 'major', 'Freehand and instrument drawing, projection and the conventions of architectural representation.', [], { coreqs: [['ARCH 101']] }),
  C('MTH 101', 'General Calculus', 'التفاضل والتكامل العام', 3, 1, 'gen', 'Functions, limits, derivatives and integrals with applications to geometry and physics.'),
  C('ARCH 111', 'Basic Design Studio II', 'استوديو التصميم الأساسي 2', 3, 2, 'major', 'Three-dimensional composition, models and the transition from abstract design to simple spaces.', [['ARCH 101'], ['ARCH 102']], { coreqs: [['ARCH 112']] }),
  C('ARCH 112', 'Architectural Drawing II', 'الرسم المعماري 2', 3, 2, 'major', 'Perspective, shade and shadow, and presentation drawing of buildings.', [['ARCH 102'], ['ARCH 101']], { coreqs: [['ARCH 111']] }),
  C('ARCH 113', 'Computer-Aided Design I', 'التصميم بمساعدة الحاسب 1', 2, 2, 'major', 'Producing two-dimensional architectural drawings with CAD software.', [['ARCH 102']]),
  // ---- Year 2
  C('ARCH 201', 'Architectural Design I', 'التصميم المعماري 1', 5, 3, 'major', 'First design studio: small buildings developed from programme, site and concept.', [['ARCH 111']]),
  C('ARCH 202', 'History of Architecture', 'تاريخ العمارة', 3, 3, 'major', 'Architecture from antiquity to the modern era and the ideas behind major styles.', [['ARCH 111']]),
  C('ARCH 203', 'Computer-Aided Design II', 'التصميم بمساعدة الحاسب 2', 2, 3, 'major', 'Three-dimensional modelling and rendering of architectural projects.', [['ARCH 113']]),
  C('ARCH 204', 'Building Construction I', 'إنشاء المباني 1', 3, 3, 'major', 'Foundations, walls, floors and roofs: how small buildings are put together.', [['ARCH 112']]),
  C('MEC 103', 'Engineering Mechanics', 'الميكانيكا الهندسية', 3, 3, 'gen', 'Forces, moments and equilibrium of rigid bodies as a basis for structural analysis.', [['PHY 103']]),
  C('ARCH 211', 'Architectural Design II', 'التصميم المعماري 2', 5, 4, 'major', 'Design studio on residential and community buildings with attention to context and function.', [['ARCH 201']]),
  C('ARCH 212', 'Theory of Architecture', 'نظريات العمارة', 3, 4, 'major', 'Theories, manifestos and critical ideas that shape architectural thinking.', [['ARCH 202']]),
  C('ARCH 213', 'Introduction to Environmental Control', 'مقدمة في التحكم البيئي', 3, 4, 'major', 'Climate, thermal comfort, daylight and passive strategies in building design.', [['ARCH 201']]),
  C('ARCH 214', 'Building Materials and Components', 'مواد البناء ومكوناته', 2, 4, 'major', 'Properties and uses of building materials and standard building components.', [['ARCH 204']]),
  // ---- Year 3
  C('ARCH 301', 'Architectural Design III', 'التصميم المعماري 3', 5, 5, 'major', 'Design studio on medium-scale public buildings integrating structure and environment.', [['ARCH 211'], ['ARCH 203']]),
  C('ARCH 302', 'Building Construction II', 'إنشاء المباني 2', 3, 5, 'major', 'Construction systems for larger buildings: frames, envelopes and finishes.', [['ARCH 214']]),
  C('ARCH 303', 'Landscape and Site Planning', 'تنسيق المواقع وتخطيطها', 3, 5, 'major', 'Site analysis, grading, planting and the design of outdoor spaces.', [['ARCH 211']]),
  C('ARCH 304', 'Structure I', 'الإنشاءات 1', 3, 5, 'major', 'Structural behaviour of beams, columns and frames for architects.', [['ARCH 211'], ['MEC 103']]),
  C('ARCH 305', 'Islamic Architecture', 'العمارة الإسلامية', 2, 5, 'major', 'Mosques, houses and cities of the Islamic world and their design principles.', [['ARCH 212']]),
  C('ARCH 311', 'Architectural Design IV', 'التصميم المعماري 4', 5, 6, 'major', 'Design studio on complex building types with technical and urban considerations.', [['ARCH 301']]),
  C('ARCH 312', 'Urban Planning & Design', 'التخطيط والتصميم العمراني', 3, 6, 'major', 'Principles of city planning and designing urban spaces and neighbourhoods.', [['ARCH 303']]),
  C('ARCH 313', 'Contemporary Issues in Architecture', 'قضايا معاصرة في العمارة', 2, 6, 'major', 'Current debates in architecture, from sustainability to digital practice.', [['ARCH 212']]),
  C('ARCH 314', 'Structure II', 'الإنشاءات 2', 3, 6, 'major', 'Steel, concrete and long-span structural systems and their architectural expression.', [['ARCH 304']]),
  C('ARCH 315', 'Technical Installations', 'التمديدات الفنية', 3, 6, 'major', 'Water, drainage, HVAC and electrical services and their integration in buildings.', [['ARCH 302']]),
  // ---- Year 4
  C('ARCH 401', 'Architectural Design V', 'التصميم المعماري 5', 5, 7, 'major', 'Advanced design studio on large mixed-use projects with detailed development.', [['ARCH 311']]),
  C('ARCH 402', 'Working Drawings', 'الرسومات التنفيذية', 3, 7, 'major', 'Preparing construction drawing sets, details and specifications.', [['ARCH 311'], ['ARCH 302']]),
  C('ARCH 403', 'Lighting and Acoustics', 'الإضاءة والصوتيات', 3, 7, 'major', 'Natural and artificial lighting and acoustic design of interior spaces.', [['ARCH 315']]),
  C('ARCH 404', 'Housing and Human Settlements', 'الإسكان والمستوطنات البشرية', 2, 7, 'major', 'Housing policy, typologies and the planning of human settlements.', [['ARCH 312']]),
  C('ARCH 405', 'Humanities in Architecture', 'الإنسانيات في العمارة', 2, 7, 'major', 'Social, cultural and behavioural dimensions of architectural space.', [['ARCH 311']]),
  C('ARCH 411', 'Architectural Design VI', 'التصميم المعماري 6', 5, 8, 'major', 'Design studio emphasising urban design and comprehensive project development.', [['ARCH 401']]),
  C('ARCH 412', 'Contract Documents', 'وثائق العقود', 3, 8, 'major', 'Contracts, tendering, bills of quantities and the documents of a building project.', [['ARCH 402']]),
  C('ARCH 413', 'Engineering Project Management', 'إدارة المشاريع الهندسية', 3, 8, 'major', 'Planning, scheduling and controlling construction projects.', [['ARCH 401']]),
  C('ARCH 316', 'Co-op', 'التدريب التعاوني', 6, 8, 'major', 'Supervised placement in an architectural or construction practice after 90 credits.', [], { min_credits: 90 }),
  // ---- Year 5
  C('ARCH 501', 'Architectural Design VII', 'التصميم المعماري 7', 5, 9, 'major', 'Advanced studio preparing the design approach for the graduation project.', [['ARCH 411']]),
  C('ARCH 502', 'Professional Practice I', 'الممارسة المهنية 1', 2, 9, 'major', 'The architect\'s professional role, ethics, regulations and office practice.', [['ARCH 411']]),
  C('ARCH 503', 'Graduation Project Research and Programming', 'بحث مشروع التخرج وبرمجته', 3, 9, 'major', 'Research, site studies and the architectural programme for the graduation project.', [['ARCH 411']]),
  C('ARCH 410', 'Exit Exam Preparation', 'التحضير لاختبار الخروج', 1, 9, 'major', 'Structured review of programme outcomes ahead of the exit examination.', [['ARCH 411']]),
  C('ARCH 511', 'Graduation Project', 'مشروع التخرج', 6, 10, 'major', 'Design development, presentation and defence of the graduation project.', [['ARCH 501'], ['ARCH 503']]),
  C('ARCH 512', 'Professional Practice II', 'الممارسة المهنية 2', 2, 10, 'major', 'Running a practice: fees, liability, project delivery and professional registration.', [['ARCH 502']]),
  // ---- Programme electives (2 credits each, prerequisite ARCH 311)
  EL('ARCH 421', 'Advanced 3D Modelling and Animation', 'النمذجة ثلاثية الأبعاد والتحريك المتقدم', 'Advanced modelling, animation and visualisation of architectural projects.'),
  EL('ARCH 422', 'Advanced Graphical Communication', 'الاتصال البصري المتقدم', 'Advanced techniques for presenting architectural ideas graphically.'),
  EL('ARCH 423', 'Parametric Design', 'التصميم البارامتري', 'Rule-based and algorithmic modelling tools for generating architectural form.'),
  EL('ARCH 431', 'Sustainability in the Built Environment', 'الاستدامة في البيئة المبنية', 'Sustainable design strategies and rating systems for buildings and cities.'),
  EL('ARCH 432', 'Advanced Lighting Techniques', 'تقنيات الإضاءة المتقدمة', 'Daylighting and electric lighting design with simulation tools.'),
  EL('ARCH 433', 'Building Energy Conservation & Management', 'ترشيد طاقة المباني وإدارتها', 'Reducing and managing energy use in buildings through design and operation.'),
  EL('ARCH 441', 'Interior Design', 'التصميم الداخلي', 'Designing interior spaces: layout, materials, lighting and furnishing.'),
  EL('ARCH 442', 'Furniture Design & Internal Treatments', 'تصميم الأثاث والمعالجات الداخلية', 'Designing furniture and interior finishes and treatments.'),
  EL('ARCH 451', 'Hospital Design', 'تصميم المستشفيات', 'Planning and designing healthcare facilities and their specialised requirements.'),
  EL('ARCH 452', 'Design for Special Needs', 'التصميم لذوي الاحتياجات الخاصة', 'Accessible and inclusive design for people with disabilities.'),
  EL('ARCH 453', 'Building Design: Form and Structure', 'تصميم المباني: الشكل والإنشاء', 'The relationship between architectural form and structural systems.'),
  EL('ARCH 454', 'Building Economics for Architects', 'اقتصاديات البناء للمعماريين', 'Cost planning, life-cycle costing and value in building projects.'),
  EL('ARCH 455', 'Architectural Preservation', 'الحفاظ المعماري', 'Conserving, restoring and adapting heritage buildings.'),
  EL('ARCH 456', 'Vernacular Architecture', 'العمارة المحلية التقليدية', 'Traditional building forms and techniques of Saudi Arabia and the region.'),
  EL('ARCH 457', 'Contemporary Issues in Urban Design', 'قضايا معاصرة في التصميم العمراني', 'Current debates and case studies in urban design.'),
  EL('ARCH 458', 'Contemporary Construction Techniques', 'تقنيات البناء المعاصرة', 'Modern construction methods, prefabrication and digital fabrication.')
];

const byCode = new Map(courses.map((c) => [c.code, c]));
const credits = (codes: string[]) => codes.reduce((s, c) => s + (byCode.get(c)?.credits ?? COURSE_BY_CODE.get(c)?.credits ?? 0), 0);
const bucket = (id: string, category: string, label_en: string, label_ar: string, course_codes: string[], extra: Partial<RequirementDef> = {}): RequirementDef =>
  ({ id, category, label_en, label_ar, course_codes, required_credits: credits(course_codes), ...extra });

// The plan lists "CHY 107 Chinese Language"; the university HSS list codes it CHI 107.
const AIA_HSS = ['FRE 106', 'SOS 101', 'CHI 107', 'ENG 103', 'SOS 102', 'PHL 101', 'PSY 101'];
const AIA_ELECTIVES = ['ARCH 421', 'ARCH 422', 'ARCH 423', 'ARCH 431', 'ARCH 432', 'ARCH 433', 'ARCH 441', 'ARCH 442', 'ARCH 451', 'ARCH 452', 'ARCH 453', 'ARCH 454', 'ARCH 455', 'ARCH 456', 'ARCH 457', 'ARCH 458'];
const HSS = (n: string, ar: string): PlanSlot => ({ elective: 'hss', label_en: `Social / Humanities Elective ${n}`, label_ar: `مقرر اجتماعي/إنساني اختياري ${ar}`, credits: 3 });
const PE = (n: string, ar: string): PlanSlot => ({ elective: 'major', label_en: `Program Elective ${n}`, label_ar: `مقرر اختياري تخصصي ${ar}`, credits: 2 });
const T = (year: number, sem: number, slots: PlanSlot[]): PlanTerm => ({ year, sem, label_en: `Year ${year} · Semester ${sem}`, label_ar: `السنة ${year} · الفصل ${sem}`, slots });

const plan: PlanTerm[] = [
  T(1, 1, ['ARCH 101', 'ARCH 102', 'MTH 101', HSS('I', '1'), 'ENG 101', 'ISL 101']),
  T(1, 2, ['ARCH 111', 'ARCH 112', 'ARCH 113', HSS('II', '2'), 'PHY 103', 'ENG 201']),
  T(2, 1, ['ARCH 201', 'ARCH 202', 'ARCH 203', 'ARCH 204', 'MEC 103', 'ARB 102']),
  T(2, 2, ['ARCH 211', 'ARCH 212', 'ARCH 213', 'ARCH 214', 'ISL 202', 'ARB 202']),
  T(3, 1, ['ARCH 301', 'ARCH 302', 'ARCH 303', 'ARCH 304', 'ARCH 305']),
  T(3, 2, ['ARCH 311', 'ARCH 312', 'ARCH 313', 'ARCH 314', 'ARCH 315']),
  T(4, 1, ['ARCH 401', 'ARCH 402', 'ARCH 403', 'ARCH 404', 'ARCH 405', PE('I', '1')]),
  T(4, 2, ['ARCH 411', 'ARCH 412', 'ARCH 413', PE('II', '2'), 'CSK 001']),
  { year: 4, sem: 3, label_en: 'Year 4 · Summer (Co-op)', label_ar: 'السنة 4 · الصيف (التدريب التعاوني)', slots: ['ARCH 316'] },
  T(5, 1, ['ARCH 501', 'ARCH 502', 'ARCH 503', PE('III', '3'), 'ARCH 410']),
  T(5, 2, ['ARCH 511', 'ARCH 512', PE('IV', '4')])
];

const ARCH_CORE = courses.filter((c) => c.code.startsWith('ARCH ') && c.category === 'major').map((c) => c.code);

export const aiaCurriculum: ProgramCurriculum = {
  program: {
    id: 'aia', code: 'AIA', name_en: 'Architecture', name_ar: 'العمارة',
    college_id: 'coea', college_en: 'College of Engineering & Architecture', college_ar: 'كلية الهندسة والعمارة',
    degree: 'Bachelor of Architecture', total_credits: 161, duration_years: 5,
    source_url: 'https://yu.edu.sa/wp-content/uploads/2026/08/SP-Architecture-Compressed_Aug-15th.pdf',
    source_version: 'Curriculum V3 (Aug 2026)',
    source_note: 'Semester sub-totals plus the 6-credit co-op sum to the stated 161 credits. Prerequisites cross-checked against the 2023 course list. Orientation (ORN) prerequisites omitted; ARCH 101/102 and ARCH 111/112 are co-requisite pairs. The plan\'s "CHY 107" (Chinese Language) is mapped to the university code CHI 107. Programme electives are 2 credits each with prerequisite ARCH 311; four are required.',
    campus_ids: ['riyadh', 'khobar']
  },
  courses,
  plan,
  requirements: [
    bucket('aia_univ', 'university_core', 'University core', 'متطلبات الجامعة', ['ENG 101', 'ENG 201', 'ISL 101', 'ISL 202', 'ARB 102', 'ARB 202']),
    bucket('aia_hss', 'hss_elective', 'University electives (social / humanities)', 'المقررات الاجتماعية والإنسانية الاختيارية', AIA_HSS, { min_courses: 2, required_credits: 6 }),
    bucket('aia_math', 'math_science', 'Mathematics & science', 'الرياضيات والعلوم', ['MTH 101', 'PHY 103', 'MEC 103']),
    bucket('aia_major', 'major_core', 'Architecture core', 'متطلبات التخصص', ARCH_CORE),
    bucket('aia_elective', 'major_elective', 'Programme electives', 'المقررات الاختيارية التخصصية', AIA_ELECTIVES, { min_courses: 4, required_credits: 8 }),
    bucket('aia_career', 'career', 'Career skills (non-credit)', 'المهارات المهنية (بدون ساعات)', ['CSK 001'], { required_credits: 0 })
  ],
  electivePools: { hss: AIA_HSS, major: AIA_ELECTIVES }
};
