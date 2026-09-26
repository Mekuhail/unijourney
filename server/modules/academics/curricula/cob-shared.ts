/**
 * Shared definitions for the College of Business BSBA majors (MIS, ACC, FIN, MKT, MGT).
 * Every BSBA course is defined exactly once here (transcribed from the "5.2 … Program" study plans, Aug 2026).
 * Each major file picks the codes it references through `bsbaCourses()` so that categories and levels reflect
 * that major's own plan, and builds its requirement buckets through `bsbaRequirements()`.
 * Descriptions are short original summaries, not the university's catalogue text.
 */
import type { CourseCategory, CourseDef, PlanSlot, PlanTerm, RequirementDef } from '../curriculum.ts';
import { COURSE_BY_CODE, HSS_ELECTIVES } from '../curriculum.ts';

export const C = (code: string, title_en: string, title_ar: string, credits: number, level: number, category: CourseCategory, description_en: string, prereqs: string[][] = [], extra: Partial<CourseDef> = {}): CourseDef => ({
  code, title_en, title_ar, credits, dept: code.split(' ')[0], level, category, description_en, prereqs, ...extra
});

export const COB_COURSES: CourseDef[] = [
  // ---- BSBA common core (all five majors)
  C('ECO 101', 'Principles of Microeconomics', 'مبادئ الاقتصاد الجزئي', 3, 1, 'core', 'Supply and demand, consumer choice, production costs and market structures at the level of firms and households.'),
  C('MGT 101', 'Introduction to Management', 'مقدمة في الإدارة', 3, 1, 'core', 'Planning, organising, leading and controlling as the basic functions of managers in organisations.'),
  C('MTH 100', 'Mathematics for Business', 'الرياضيات للأعمال', 3, 1, 'core', 'Algebra, functions, percentages and financial arithmetic used in everyday business problems.'),
  C('ENG 202', 'Tech Report and Business Writing', 'كتابة التقارير التقنية وكتابة الأعمال', 3, 4, 'gen', 'Writing clear business reports, memos, proposals and technical summaries for professional readers.', [['ENG 101']]),
  C('ECO 105', 'Principles of Macroeconomics', 'مبادئ الاقتصاد الكلي', 3, 2, 'core', 'National income, inflation, unemployment, and the fiscal and monetary tools that shape an economy.', [['ECO 101']]),
  C('MTH 110', 'Business Calculus', 'التفاضل والتكامل للأعمال', 3, 2, 'core', 'Derivatives and integrals applied to cost, revenue, profit and optimisation questions in business.', [['MTH 100']]),
  C('ACC 201', 'Financial Accounting', 'المحاسبة المالية', 3, 2, 'core', 'Recording transactions and preparing the balance sheet, income statement and cash-flow statement.', [['ECO 101']]),
  C('MIS 110', 'Business Computing', 'الحوسبة للأعمال', 3, 2, 'core', 'Spreadsheets, presentations, databases and collaboration tools used to solve business tasks.'),
  C('MKT 201', 'Introduction to Marketing', 'مقدمة في التسويق', 3, 3, 'core', 'Markets, customers, segmentation and the marketing mix as the basis of marketing decisions.', [['ECO 105']]),
  C('STT 201', 'Business Statistics and Analysis', 'الإحصاء والتحليل للأعمال', 3, 3, 'core', 'Descriptive statistics, probability, estimation and hypothesis tests applied to business data.', [['MTH 110']]),
  C('MIS 201', 'Introduction to MIS', 'مقدمة في نظم المعلومات الإدارية', 3, 3, 'core', 'How organisations use information systems, data and processes to create value.', [['MIS 110']]),
  C('ACC 202', 'Management Accounting', 'المحاسبة الإدارية', 3, 3, 'core', 'Cost behaviour, budgeting and performance reports that support internal management decisions.', [['ACC 201']]),
  C('FIN 202', 'Introduction to Finance', 'مقدمة في المالية', 3, 3, 'core', 'Time value of money, financial statements, risk and return, and basic valuation of assets.', [['ACC 201']]),
  C('MGT 220', 'Organizational Behavior', 'السلوك التنظيمي', 3, 3, 'core', 'Individual and group behaviour at work: motivation, teams, leadership and organisational culture.', [['MGT 101'], ['ECO 105']]),
  C('MGT 210', 'Business Communication', 'الاتصال في الأعمال', 3, 3, 'core', 'Effective written, spoken and digital communication in professional business settings.', [['MGT 101']]),
  C('MGT 304', 'Quantitative Methods for Business', 'الأساليب الكمية في الأعمال', 3, 5, 'core', 'Linear programming, forecasting, decision analysis and other models for structured business decisions.', [['STT 201']]),
  C('MGT 310', 'Executive Seminar Series', 'سلسلة الندوات التنفيذية', 1, 5, 'core', 'A seminar series in which practising executives discuss current business challenges with students.', [], { min_credits: 70 }),
  C('MGT 314', 'Business Ethics and Social Responsibility', 'أخلاقيات الأعمال والمسؤولية الاجتماعية', 3, 5, 'core', 'Ethical reasoning, stakeholder interests and corporate responsibility in business decisions.', [['MGT 220'], ['ENG 101']]),
  C('MGT 306', 'Legal Environment of Business', 'البيئة القانونية للأعمال', 3, 5, 'core', 'Contracts, commercial regulation and the legal framework in which Saudi businesses operate.', [['MGT 220'], ['ENG 101']]),
  C('MGT 308', 'Entrepreneurship and Innovation', 'ريادة الأعمال والابتكار', 3, 6, 'core', 'Recognising opportunities, validating ideas and building a business model for a new venture.', [['MGT 220'], ['ENG 101']]),
  C('MGT 330', 'Operation Management', 'إدارة العمليات', 3, 6, 'core', 'Designing and running the processes that deliver goods and services: capacity, quality and flow.', [['MGT 304'], ['ENG 101']]),
  C('MGT 495', 'Strategic Management', 'الإدارة الاستراتيجية', 3, 7, 'core', 'Capstone analysis of industries and firms to formulate and implement competitive strategy.', [['MGT 330']], { min_credits: 100 }),
  // ---- MIS
  C('MIS 316', 'Fundamentals of Programming I', 'أساسيات البرمجة 1', 3, 4, 'major_elective', 'A first programming course for business students: variables, control flow, functions and simple data.', [['MIS 201']]),
  C('MIS 317', 'Fundamentals of Web Design', 'أساسيات تصميم الويب', 3, 5, 'major_elective', 'Building usable web pages with HTML, CSS and introductory scripting.', [['MIS 316']]),
  C('MIS 326', 'Systems Analysis and Design', 'تحليل النظم وتصميمها', 3, 5, 'major_elective', 'Requirements gathering, process and data modelling, and designing information systems for organisations.', [['MIS 316']]),
  C('MIS 327', 'Database Management and Design', 'إدارة قواعد البيانات وتصميمها', 3, 5, 'major_elective', 'Relational design, normalisation and SQL for storing and querying business data.', [['MIS 316']]),
  C('MIS 328', 'Business Telecommunications', 'اتصالات الأعمال', 3, 4, 'major_elective', 'Networks, the internet and communication technologies that connect business systems.', [['MIS 201']]),
  C('MIS 329', 'Decision Support and Business Intelligence', 'دعم القرار وذكاء الأعمال', 3, 6, 'major_elective', 'Data warehouses, dashboards and analytical models that support managerial decisions.', [['MIS 327']]),
  C('MIS 423', 'Web Based Applications', 'تطبيقات الويب', 3, 6, 'major_elective', 'Developing data-driven web applications that connect front ends to databases.', [['MIS 327'], ['MIS 317']]),
  C('MIS 427', 'Information Security Risk Management', 'إدارة مخاطر أمن المعلومات', 3, 7, 'major_elective', 'Identifying, assessing and treating information security risks in organisations.', [['MIS 328']]),
  C('MIS 431', 'Project Management', 'إدارة المشاريع', 3, 6, 'major_elective', 'Scoping, scheduling, budgeting and controlling information systems projects.', [['MIS 326']]),
  C('MIS 492', 'MIS Senior Project', 'مشروع التخرج في نظم المعلومات الإدارية', 3, 7, 'major_elective', 'A supervised capstone in which students design and deliver an information systems solution.', [], { min_credits: 100 }),
  C('MIS 401', 'National Exam Review', 'مراجعة الاختبار الوطني', 1, 7, 'major_elective', 'Structured review of programme outcomes ahead of the national exit examination.', [], { min_credits: 100 }),
  C('MIS 498', 'Coop Training Internship', 'التدريب التعاوني', 6, 8, 'major_elective', 'Supervised work placement applying information systems skills in industry.', [], { min_credits: 120 }),
  C('MIS 308', 'Artificial Intelligence for Business', 'الذكاء الاصطناعي للأعمال', 3, 5, 'major_elective', 'Machine learning and intelligent systems and where they add value in business processes.', [['MIS 201']]),
  C('MIS 318', 'Data Analytics', 'تحليلات البيانات', 3, 5, 'major_elective', 'Cleaning, exploring and visualising data to answer business questions.', [['MIS 201']]),
  C('MIS 428', 'Healthcare Information System', 'نظم المعلومات الصحية', 3, 7, 'major_elective', 'Information systems used in hospitals and clinics, from patient records to health analytics.', [['MIS 327']]),
  C('MIS 429', 'Data Mining and Analysis', 'التنقيب في البيانات وتحليلها', 3, 7, 'major_elective', 'Classification, clustering and association techniques for discovering patterns in large data sets.', [['MIS 329']]),
  C('MIS 430', 'Advanced Topics of Information Systems', 'موضوعات متقدمة في نظم المعلومات', 3, 7, 'major_elective', 'A rotating advanced topic reflecting current developments in information systems.', [['MIS 327']]),
  C('MIS 435', 'Knowledge Management Systems', 'نظم إدارة المعرفة', 3, 7, 'major_elective', 'Capturing, organising and sharing organisational knowledge with supporting systems.', [['MIS 201']]),
  C('MIS 432', 'Enterprise Systems', 'نظم المؤسسات', 3, 7, 'major_elective', 'ERP and integrated enterprise platforms from selection to rollout.', [['MIS 327']]),
  C('MIS 433', 'Internet Business and Web Applications Development', 'أعمال الإنترنت وتطوير تطبيقات الويب', 3, 7, 'major_elective', 'Online business models and the web applications that support them.', [['MIS 316']]),
  C('MIS 434', 'Human Resource Information Systems', 'نظم معلومات الموارد البشرية', 3, 7, 'major_elective', 'Systems that manage employee data, payroll, recruitment and performance.', [['MIS 327']]),
  C('MIS 436', 'Mobile Computing', 'الحوسبة المتنقلة', 3, 7, 'major_elective', 'Designing and building mobile applications for business use.', [['MIS 327']]),
  // ---- Accounting
  C('ACC 311', 'Intermediate Accounting I', 'المحاسبة المتوسطة 1', 3, 4, 'major_elective', 'The conceptual framework and detailed accounting for current assets, receivables and inventory.', [['ACC 201']]),
  C('ACC 312', 'Cost Accounting', 'محاسبة التكاليف', 3, 5, 'major_elective', 'Job, process and activity-based costing and their use in pricing and control.', [['ACC 202']]),
  C('ACC 321', 'Intermediate Accounting II', 'المحاسبة المتوسطة 2', 3, 5, 'major_elective', 'Accounting for long-term assets, liabilities, equity and revenue recognition.', [['ACC 311']]),
  C('ACC 326', 'Zakat and Tax Accounting', 'محاسبة الزكاة والضرائب', 3, 6, 'major_elective', 'Computing zakat and taxes under Saudi regulations and preparing the related returns.', [['ACC 321']]),
  C('ACC 418', 'Advanced Financial Accounting', 'المحاسبة المالية المتقدمة', 3, 6, 'major_elective', 'Business combinations, consolidated statements and foreign-currency transactions.', [['ACC 321']]),
  C('ACC 430', 'Auditing and Assurance Services', 'المراجعة وخدمات التأكيد', 3, 7, 'major_elective', 'Audit planning, evidence, internal control evaluation and the auditor\'s report.', [['ACC 321']]),
  C('ACC 401', 'National Exam Review', 'مراجعة الاختبار الوطني', 1, 7, 'major_elective', 'Structured review of accounting programme outcomes ahead of the national exit examination.', [], { min_credits: 100 }),
  C('ACC 498', 'Coop Training Internship', 'التدريب التعاوني', 6, 8, 'major_elective', 'Supervised work placement applying accounting skills in practice.', [], { min_credits: 120 }),
  C('ACC 416', 'Internal Audit and Control', 'المراجعة الداخلية والرقابة', 3, 7, 'major_elective', 'Designing internal controls and conducting internal audits within organisations.', [['ACC 321']]),
  C('ACC 421', 'Advanced Topics in Taxation', 'موضوعات متقدمة في الضرائب', 3, 7, 'major_elective', 'Corporate, withholding and value-added tax issues beyond the introductory course.', [['ACC 326']]),
  C('ACC 424', 'Accounting for Government and Non-Profit', 'المحاسبة الحكومية والمنظمات غير الربحية', 3, 7, 'major_elective', 'Fund accounting and reporting for public-sector and non-profit entities.', [['ACC 321']]),
  C('ACC 428', 'Advanced Management Accounting', 'المحاسبة الإدارية المتقدمة', 3, 7, 'major_elective', 'Strategic cost management, performance measurement and transfer pricing.', [['ACC 312']]),
  C('ACC 432', 'Financial Statement Analysis and Valuation', 'تحليل القوائم المالية والتقييم', 3, 7, 'major_elective', 'Ratio analysis, forecasting and valuation techniques based on published financial statements.', [['ACC 311']]),
  C('ACC 434', 'Accounting Information Systems', 'نظم المعلومات المحاسبية', 3, 7, 'major_elective', 'Transaction cycles, controls and software used to capture and report accounting data.', [['ACC 321']]),
  C('ACC 440', 'Accounting Theory and Practices', 'نظرية المحاسبة وممارساتها', 3, 7, 'major_elective', 'The theory behind accounting standards and current issues in professional practice.', [['ACC 321']]),
  // ---- Finance
  C('FIN 311', 'Investment', 'الاستثمار', 3, 4, 'major_elective', 'Securities, markets, risk-return trade-offs and building an investment portfolio.', [['FIN 202']]),
  C('FIN 313', 'Financial Markets and Institutions', 'الأسواق والمؤسسات المالية', 3, 5, 'major_elective', 'How banks, exchanges and other institutions channel funds through the financial system.', [['FIN 202']]),
  C('FIN 320', 'Corporate Finance', 'مالية الشركات', 3, 5, 'major_elective', 'Capital budgeting, cost of capital, capital structure and dividend decisions of firms.', [['FIN 202']]),
  C('FIN 330', 'Financial Modeling', 'النمذجة المالية', 3, 6, 'major_elective', 'Building spreadsheet models for forecasting, valuation and scenario analysis.', [['FIN 320']]),
  C('FIN 411', 'Derivative Securities', 'الأوراق المالية المشتقة', 3, 6, 'major_elective', 'Forwards, futures, options and swaps and how they are priced and used to manage risk.', [['FIN 311']]),
  C('FIN 418', 'International Finance', 'المالية الدولية', 3, 7, 'major_elective', 'Exchange rates, international capital flows and financial management across borders.', [['FIN 411']]),
  C('FIN 401', 'National Exam Review', 'مراجعة الاختبار الوطني', 1, 7, 'major_elective', 'Structured review of finance programme outcomes ahead of the national exit examination.', [], { min_credits: 100 }),
  C('FIN 498', 'Coop Training Internship', 'التدريب التعاوني', 6, 8, 'major_elective', 'Supervised work placement applying finance skills in practice.', [], { min_credits: 120 }),
  C('FIN 324', 'Real Estate Finance', 'التمويل العقاري', 3, 7, 'major_elective', 'Financing, valuing and investing in property and mortgage instruments.', [['FIN 311']]),
  C('FIN 325', 'Islamic Finance', 'التمويل الإسلامي', 3, 7, 'major_elective', 'Sharia-compliant contracts, sukuk and Islamic banking products.', [['FIN 202']]),
  C('FIN 335', 'Fintech', 'التقنية المالية', 3, 7, 'major_elective', 'Digital payments, lending platforms and other technologies reshaping financial services.', [['FIN 311']]),
  C('FIN 340', 'Blockchain Fundamentals', 'أساسيات سلسلة الكتل', 3, 7, 'major_elective', 'Distributed ledgers, smart contracts and their applications in finance and business.', [['FIN 202'], ['MIS 201']]),
  C('FIN 412', 'Fixed Income Securities', 'الأوراق المالية ذات الدخل الثابت', 3, 7, 'major_elective', 'Bond pricing, yields, duration and the management of interest-rate risk.', [['FIN 311']]),
  C('FIN 414', 'Portfolio Management', 'إدارة المحافظ الاستثمارية', 3, 7, 'major_elective', 'Asset allocation, diversification and evaluating portfolio performance.', [['FIN 311']]),
  C('FIN 420', 'Risk Management', 'إدارة المخاطر', 3, 7, 'major_elective', 'Identifying, measuring and hedging financial and operational risks.', [['FIN 311']]),
  // ---- Marketing
  C('MKT 311', 'Consumer Behavior', 'سلوك المستهلك', 3, 4, 'major_elective', 'Psychological, social and cultural influences on how customers choose and buy.', [['MKT 201']]),
  C('MKT 318', 'International Marketing', 'التسويق الدولي', 3, 5, 'major_elective', 'Entering and serving foreign markets while adapting to cultural and regulatory differences.', [['MKT 201']]),
  C('MKT 324', 'Services Marketing', 'تسويق الخدمات', 3, 5, 'major_elective', 'Marketing intangible offerings: service quality, customer experience and relationships.', [['MKT 311']]),
  C('MKT 326', 'Digital Marketing', 'التسويق الرقمي', 3, 6, 'major_elective', 'Search, social media, content and analytics for marketing online.', [['MKT 311']]),
  C('MKT 411', 'Marketing Strategies', 'استراتيجيات التسويق', 3, 6, 'major_elective', 'Positioning, competitive analysis and planning a marketing strategy for a business.', [['MKT 324']]),
  C('MKT 420', 'Marketing Research', 'بحوث التسويق', 3, 7, 'major_elective', 'Designing surveys and experiments and analysing data to inform marketing decisions.', [['MKT 411'], ['MGT 304']]),
  C('MKT 401', 'National Exam Review', 'مراجعة الاختبار الوطني', 1, 7, 'major_elective', 'Structured review of marketing programme outcomes ahead of the national exit examination.', [], { min_credits: 100 }),
  C('MKT 498', 'Coop Training Internship', 'التدريب التعاوني', 6, 8, 'major_elective', 'Supervised work placement applying marketing skills in practice.', [], { min_credits: 120 }),
  C('MKT 315', 'Branding Strategy', 'استراتيجية العلامة التجارية', 3, 7, 'major_elective', 'Building, positioning and managing brands and brand equity.', [['MKT 201'], ['ECO 105']]),
  C('MKT 316', 'Sales Management', 'إدارة المبيعات', 3, 7, 'major_elective', 'Organising, motivating and evaluating a sales force and the personal selling process.', [['MKT 201'], ['ECO 105']]),
  C('MKT 370', 'Integrated Marketing Communications', 'الاتصالات التسويقية المتكاملة', 3, 7, 'major_elective', 'Coordinating advertising, PR, promotion and digital channels into one consistent message.', [['MKT 324']]),
  C('MKT 414', 'Promotion and Advertising', 'الترويج والإعلان', 3, 7, 'major_elective', 'Planning creative campaigns, choosing media and measuring advertising effectiveness.', [['MKT 318']]),
  C('MKT 417', 'Retail Management', 'إدارة التجزئة', 3, 7, 'major_elective', 'Store formats, merchandising, pricing and operations in retail businesses.', [['MKT 311']]),
  // ---- Management
  C('MGT 315', 'Human Resource Management', 'إدارة الموارد البشرية', 3, 4, 'major_elective', 'Recruiting, developing, rewarding and retaining people in organisations.', [['MGT 220']]),
  C('MGT 321', 'Organizational Leadership', 'القيادة التنظيمية', 3, 5, 'major_elective', 'Leadership theories and the skills needed to influence and develop teams.', [['MGT 220']]),
  C('MGT 331', 'Compensation and Performance Management', 'إدارة التعويضات والأداء', 3, 5, 'major_elective', 'Designing pay structures, incentives and appraisal systems that drive performance.', [['MGT 220']]),
  C('MGT 410', 'Change Management', 'إدارة التغيير', 3, 6, 'major_elective', 'Diagnosing the need for change and leading people through organisational transitions.', [['MGT 321']]),
  C('MGT 429', 'Training and Development', 'التدريب والتطوير', 3, 6, 'major_elective', 'Assessing needs, designing programmes and evaluating employee learning and growth.', [['MGT 315']]),
  C('MGT 442', 'International Business', 'الأعمال الدولية', 3, 7, 'major_elective', 'Trade, foreign investment and managing operations across national borders.', [['MGT 321']]),
  C('MGT 401', 'National Exam Review', 'مراجعة الاختبار الوطني', 1, 7, 'major_elective', 'Structured review of management programme outcomes ahead of the national exit examination.', [], { min_credits: 100 }),
  C('MGT 498', 'Coop Training Internship', 'التدريب التعاوني', 6, 8, 'major_elective', 'Supervised work placement applying management skills in practice.', [], { min_credits: 120 }),
  C('MGT 305', 'Quality Management', 'إدارة الجودة', 3, 7, 'major_elective', 'Quality systems, continuous improvement tools and customer-focused process control.', [['MGT 220'], ['ENG 101']]),
  C('MGT 350', 'Negotiations and Conflict Resolutions', 'التفاوض وحل النزاعات', 3, 7, 'major_elective', 'Negotiation strategies and techniques for resolving conflict at work.', [['MGT 220'], ['ENG 101']]),
  C('MGT 360', 'Project Management', 'إدارة المشاريع', 3, 7, 'major_elective', 'Planning, scheduling, resourcing and controlling projects to deliver on time and budget.', [['MGT 304']]),
  C('MGT 422', 'Logistic and Supply Chain Management', 'إدارة اللوجستيات وسلاسل الإمداد', 3, 7, 'major_elective', 'Sourcing, inventory, transport and coordination across a supply chain.', [['MGT 304']]),
  C('MGT 430', 'Advanced Business Analytics', 'تحليلات الأعمال المتقدمة', 3, 7, 'major_elective', 'Predictive and prescriptive analytics applied to management decisions.', [['MGT 304']]),
  C('MGT 480', 'Business Consulting', 'الاستشارات الإدارية', 3, 7, 'major_elective', 'The consulting process from problem diagnosis to recommendations, practised on a live case.', [], { min_credits: 90 }),
  C('MGT 317', 'Family Business', 'الأعمال العائلية', 3, 7, 'major_elective', 'Governance, succession and growth challenges specific to family-owned firms.', [['MGT 308']]),
  // ---- MBA courses open to strong undergraduates as business electives
  C('MGT 502', 'Foundation of Leadership', 'أسس القيادة', 3, 7, 'major_elective', 'Graduate-level introduction to leadership practice; open to undergraduates with 90 credits, GPA 3.60 and dean approval.', [], { min_credits: 90 }),
  C('MIS 504', 'Information Systems', 'نظم المعلومات', 3, 7, 'major_elective', 'Graduate-level survey of information systems in organisations; open to undergraduates with 90 credits, GPA 3.60 and dean approval.', [], { min_credits: 90 }),
  C('ECO 506', 'Managerial Economics', 'الاقتصاد الإداري', 3, 7, 'major_elective', 'Graduate-level economic analysis for managerial decisions; open to undergraduates with 90 credits, GPA 3.60 and dean approval.', [], { min_credits: 90 })
];

export const COB_BY_CODE = new Map(COB_COURSES.map((c) => [c.code, c]));

/** University core shared by every BSBA major (ISL/ARB/ENG). */
export const BSBA_UNIVERSITY_CORE = ['ISL 101', 'ISL 202', 'ARB 102', 'ARB 202', 'ENG 101', 'ENG 202'];
/** College of Business core shared by every BSBA major (61 credits). */
export const BSBA_BUSINESS_CORE = ['ECO 101', 'MGT 101', 'MTH 100', 'ECO 105', 'MTH 110', 'ACC 201', 'MIS 110', 'MKT 201', 'STT 201', 'MIS 201', 'ACC 202', 'FIN 202', 'MGT 220', 'MGT 210', 'MGT 304', 'MGT 310', 'MGT 314', 'MGT 306', 'MGT 308', 'MGT 330', 'MGT 495'];
/** MBA courses that may count as business electives (90 credits, GPA 3.60, dean approval). */
export const MBA_ELECTIVES = ['MGT 502', 'MIS 504', 'ECO 506'];

// ---- Plan slot helpers
export const HSS = (n: string, ar: string): PlanSlot => ({ elective: 'hss', label_en: `Social Sciences/Humanities Elective ${n}`, label_ar: `مقرر اجتماعي/إنساني اختياري ${ar}`, credits: 3 });
export const NAT_SCI: PlanSlot = { elective: 'natural_science', label_en: 'Natural Science Elective', label_ar: 'مقرر اختياري في العلوم الطبيعية', credits: 3 };
export const MAJOR_EL = (n: string, ar: string): PlanSlot => ({ elective: 'major', label_en: `Major Elective ${n}`, label_ar: `مقرر تخصصي اختياري ${ar}`, credits: 3 });
export const COLLEGE_EL = (n: string, ar: string): PlanSlot => ({ elective: 'business', label_en: `College Elective ${n}`, label_ar: `مقرر اختياري من الكلية ${ar}`, credits: 3 });
export const T = (year: number, sem: number, slots: PlanSlot[]): PlanTerm => ({ year, sem, label_en: `Year ${year} · Semester ${sem}`, label_ar: `السنة ${year} · الفصل ${sem}`, slots });

function lookup(code: string): CourseDef | undefined {
  return COB_BY_CODE.get(code) ?? COURSE_BY_CODE.get(code);
}

/**
 * Course definitions for one BSBA major: every code referenced by its plan or elective pools that is defined
 * in this module (codes defined only in ../curriculum.ts are referenced, not copied). Categories are relabelled
 * for the major's own courses and the level follows the position in that major's plan.
 */
export function bsbaCourses(plan: PlanTerm[], groups: { major: string[]; major_elective: string[]; business?: string[] }): CourseDef[] {
  const levelOf = new Map<string, number>();
  plan.forEach((t, i) => { for (const s of t.slots) if (typeof s === 'string' && !levelOf.has(s)) levelOf.set(s, i + 1); });
  const category = new Map<string, CourseCategory>();
  for (const c of groups.business ?? []) category.set(c, 'major_elective');
  for (const c of groups.major_elective) category.set(c, 'major_elective');
  for (const c of groups.major) category.set(c, 'major');
  const codes = [...new Set([...levelOf.keys(), ...groups.major, ...groups.major_elective, ...(groups.business ?? [])])];
  const out: CourseDef[] = [];
  for (const code of codes) {
    const base = COB_BY_CODE.get(code);
    if (!base) continue;
    out.push({ ...base, category: category.get(code) ?? base.category, level: levelOf.get(code) ?? base.level });
  }
  return out;
}

export function bucket(id: string, category: string, label_en: string, label_ar: string, course_codes: string[], extra: Partial<RequirementDef> = {}): RequirementDef {
  const required_credits = extra.required_credits ?? course_codes.reduce((s, c) => s + (lookup(c)?.credits ?? 0), 0);
  return { id, category, label_en, label_ar, course_codes, ...extra, required_credits };
}

/** Standard BSBA requirement buckets; the sum equals the 127-credit programme when the major buckets total 25 + 6 (+12). */
export function bsbaRequirements(id: string, opts: { major_label_en: string; major_label_ar: string; major: string[]; major_electives: string[]; college_electives?: string[] }): RequirementDef[] {
  const reqs: RequirementDef[] = [
    bucket(`${id}_univ`, 'university_core', 'University core', 'متطلبات الجامعة', BSBA_UNIVERSITY_CORE),
    bucket(`${id}_hss`, 'hss_elective', 'Social sciences / humanities electives', 'المقررات الاجتماعية والإنسانية الاختيارية', HSS_ELECTIVES, { min_courses: 2, required_credits: 6 }),
    bucket(`${id}_natsci`, 'natural_science', 'Natural science elective', 'مقرر العلوم الطبيعية الاختياري', [], { min_courses: 1, required_credits: 3 }),
    bucket(`${id}_college`, 'college_core', 'College of Business core', 'متطلبات الكلية', BSBA_BUSINESS_CORE),
    bucket(`${id}_major`, 'major_core', opts.major_label_en, opts.major_label_ar, opts.major),
    bucket(`${id}_major_elective`, 'major_elective', 'Major electives', 'المقررات الاختيارية التخصصية', opts.major_electives, { min_courses: 2, required_credits: 6 })
  ];
  if (opts.college_electives) reqs.push(bucket(`${id}_business_elective`, 'business_elective', 'College electives', 'المقررات الاختيارية من الكلية', opts.college_electives, { min_courses: 4, required_credits: 12 }));
  return reqs;
}
