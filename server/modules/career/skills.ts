/**
 * Skills taxonomy and evidence weights for portfolio-based matching.
 *
 * Labels follow ESCO / O*NET naming where one exists; Arabic labels are curated for the demo. A child skill satisfies
 * its parent with partial credit (PostgreSQL → SQL), never the other way round. Evidence weights say how much we trust
 * a skill claim: a self-declared skill counts less than a passed course, a linked project, work or a verified award.
 */
export interface SkillDef { id: string; en: string; ar: string; aliases?: string[]; parent?: string; category: 'programming' | 'web' | 'data' | 'infra' | 'security' | 'design' | 'soft' | 'math' }

export const SKILLS: SkillDef[] = [
  { id: 'java', en: 'Java', ar: 'جافا', category: 'programming' },
  { id: 'python', en: 'Python', ar: 'بايثون', category: 'programming' },
  { id: 'cpp', en: 'C++', ar: 'C++', aliases: ['c plus plus'], category: 'programming' },
  { id: 'csharp', en: 'C#', ar: 'C#', aliases: ['c sharp', '.net', 'dotnet'], category: 'programming' },
  { id: 'go', en: 'Go', ar: 'Go', aliases: ['golang'], category: 'programming' },
  { id: 'oop', en: 'Object-oriented programming', ar: 'البرمجة الكائنية', aliases: ['oop', 'object oriented programming'], category: 'programming' },
  { id: 'algorithms', en: 'Algorithms', ar: 'الخوارزميات', aliases: ['data structures', 'dsa', 'data structures and algorithms'], category: 'programming' },
  { id: 'software-design', en: 'Software design', ar: 'تصميم البرمجيات', aliases: ['uml', 'design patterns', 'software architecture', 'software modelling', 'software modeling'], category: 'programming' },
  { id: 'requirements', en: 'Requirements engineering', ar: 'هندسة المتطلبات', aliases: ['requirements', 'user stories'], category: 'programming' },
  { id: 'testing', en: 'Software testing', ar: 'اختبار البرمجيات', aliases: ['unit testing', 'qa', 'test automation'], category: 'programming' },
  { id: 'unity', en: 'Unity', ar: 'يونيتي', aliases: ['unity3d'], parent: 'csharp', category: 'programming' },
  { id: 'javascript', en: 'JavaScript', ar: 'جافاسكربت', aliases: ['js', 'ecmascript'], category: 'web' },
  { id: 'typescript', en: 'TypeScript', ar: 'تايب سكربت', aliases: ['ts'], parent: 'javascript', category: 'web' },
  { id: 'react', en: 'React', ar: 'رياكت', aliases: ['reactjs', 'react.js'], parent: 'javascript', category: 'web' },
  { id: 'nodejs', en: 'Node.js', ar: 'نود جي إس', aliases: ['node', 'nodejs', 'express'], parent: 'javascript', category: 'web' },
  { id: 'html-css', en: 'HTML & CSS', ar: 'HTML و CSS', aliases: ['html', 'css', 'web design', 'tailwind'], category: 'web' },
  { id: 'rest', en: 'REST APIs', ar: 'واجهات REST', aliases: ['rest', 'restful apis', 'api design', 'apis'], category: 'web' },
  { id: 'spring', en: 'Spring', ar: 'Spring', aliases: ['spring boot'], parent: 'java', category: 'web' },
  { id: 'sql', en: 'SQL', ar: 'SQL', aliases: ['mysql', 'sqlite', 'databases', 'database design', 'oracle'], category: 'data' },
  { id: 'postgresql', en: 'PostgreSQL', ar: 'PostgreSQL', aliases: ['postgres'], parent: 'sql', category: 'data' },
  { id: 'statistics', en: 'Statistics', ar: 'الإحصاء', aliases: ['probability'], category: 'math' },
  { id: 'ml', en: 'Machine Learning', ar: 'تعلم الآلة', aliases: ['ml', 'ai', 'artificial intelligence', 'deep learning'], category: 'data' },
  { id: 'power-bi', en: 'Power BI', ar: 'Power BI', aliases: ['dashboards', 'bi', 'tableau'], category: 'data' },
  { id: 'git', en: 'Git', ar: 'Git', aliases: ['github', 'version control', 'gitlab'], category: 'infra' },
  { id: 'docker', en: 'Docker', ar: 'دوكر', aliases: ['containers', 'kubernetes'], category: 'infra' },
  { id: 'linux', en: 'Linux', ar: 'لينكس', aliases: ['bash', 'shell'], category: 'infra' },
  { id: 'operating-systems', en: 'Operating systems', ar: 'أنظمة التشغيل', aliases: ['os'], category: 'infra' },
  { id: 'networking', en: 'Networking', ar: 'الشبكات', aliases: ['computer networks', 'tcp/ip', 'data communications'], category: 'infra' },
  { id: 'routing', en: 'Routing', ar: 'التوجيه', aliases: ['switching'], parent: 'networking', category: 'infra' },
  { id: 'cisco', en: 'Cisco', ar: 'سيسكو', aliases: ['ccna'], parent: 'networking', category: 'infra' },
  { id: 'packet-tracer', en: 'Packet Tracer', ar: 'Packet Tracer', parent: 'networking', category: 'infra' },
  { id: 'cybersecurity', en: 'Cybersecurity', ar: 'الأمن السيبراني', aliases: ['security', 'infosec', 'cryptography'], category: 'security' },
  { id: 'siem', en: 'SIEM', ar: 'SIEM', aliases: ['splunk'], parent: 'cybersecurity', category: 'security' },
  { id: 'ux', en: 'UX', ar: 'تجربة المستخدم', aliases: ['ux design', 'ui/ux', 'user experience', 'ui design', 'user interface'], category: 'design' },
  { id: 'figma', en: 'Figma', ar: 'فيغما', parent: 'ux', category: 'design' },
  { id: 'prototyping', en: 'Prototyping', ar: 'النماذج الأولية', parent: 'ux', category: 'design' },
  { id: 'user-research', en: 'User Research', ar: 'أبحاث المستخدم', aliases: ['usability testing'], parent: 'ux', category: 'design' },
  { id: 'problem-solving', en: 'Problem Solving', ar: 'حل المشكلات', aliases: ['competitive programming'], category: 'soft' },
  { id: 'technical-writing', en: 'Technical Writing', ar: 'الكتابة التقنية', aliases: ['documentation', 'report writing'], category: 'soft' },
  { id: 'pitching', en: 'Pitching', ar: 'العرض التقديمي', aliases: ['presentation', 'public speaking'], category: 'soft' },
  { id: 'project-management', en: 'Project management', ar: 'إدارة المشاريع', aliases: ['agile', 'scrum'], category: 'soft' },
  { id: 'teamwork', en: 'Teamwork', ar: 'العمل الجماعي', aliases: ['collaboration'], category: 'soft' }
];

const BY_ID = new Map(SKILLS.map((s) => [s.id, s]));

/** Arabic-aware normalisation: lower-case, strip diacritics/tatweel, unify alef/yaa/taa marbuta forms, collapse spaces. */
export function normText(s: string): string {
  return s.toLowerCase()
    .replace(/[ً-ْـ]/g, '')
    .replace(/[أإآ]/g, 'ا').replace(/ى/g, 'ي').replace(/ة/g, 'ه')
    .replace(/\s+/g, ' ').trim();
}

const LOOKUP = new Map<string, string>();
for (const s of SKILLS) for (const label of [s.id, s.en, s.ar, ...(s.aliases ?? [])]) LOOKUP.set(normText(label), s.id);

/** Maps free text ("ReactJS", "رياكت") to a canonical skill id, or null when unknown (unknown skills still match by text). */
export function skillId(label: string): string | null {
  return LOOKUP.get(normText(label)) ?? null;
}

export function skillDef(id: string): SkillDef | undefined {
  return BY_ID.get(id);
}

/** Canonical key for comparing skills: taxonomy id when known, otherwise the normalised text. */
export function skillKey(label: string): string {
  return skillId(label) ?? `text:${normText(label)}`;
}

/** How well a held skill covers a needed one: 1 for the same skill, 0.8 when the held skill is a child of the needed one. */
export function coverage(held: string, needed: string): number {
  if (held === needed) return 1;
  const h = held.startsWith('text:') ? undefined : BY_ID.get(held);
  if (h?.parent && h.parent === needed) return 0.8;
  return 0;
}

/** Skills a completed course is evidence for (Al Yamamah SWE/CIS core courses in the demo curriculum). */
export const COURSE_SKILLS: Record<string, string[]> = {
  'CIS 103': ['problem-solving', 'java'],
  'CIS 104': ['oop', 'java'],
  'CIS 201': ['html-css', 'javascript'],
  'CIS 202': ['algorithms'],
  'CIS 221': ['sql'],
  'CIS 316': ['ml', 'python'],
  'CIS 321': ['operating-systems', 'linux'],
  'CIS 383': ['cybersecurity'],
  'CIS 386': ['project-management'],
  'ENG 201': ['technical-writing'],
  'MTH 106': ['algorithms'],
  'NES 212': ['networking'],
  'STT 103': ['statistics'],
  'SWE 202': ['software-design', 'teamwork'],
  'SWE 300': ['software-design'],
  'SWE 301': ['requirements'],
  'SWE 302': ['software-design'],
  'SWE 312': ['ux', 'prototyping', 'testing'],
  'SWE 322': ['javascript', 'react', 'nodejs', 'rest']
};

export type EvidenceKind = 'self' | 'course' | 'course_in_progress' | 'project' | 'github' | 'experience' | 'certificate' | 'award' | 'award_verified';

/** Trust in a claim, 0..1. A padded skill list alone can never outrank course, project or work evidence. */
export const EVIDENCE_WEIGHT: Record<EvidenceKind, number> = {
  self: 0.4,
  course_in_progress: 0.3,
  course: 0.6,
  project: 0.7,
  github: 0.75,
  experience: 0.85,
  certificate: 0.85,
  award: 0.8,
  award_verified: 1
};

/** Passed courses with a strong grade count a little more. */
export function courseWeight(grade: string | null | undefined): number {
  const strong = ['A+', 'A', 'A-', 'B+'];
  return EVIDENCE_WEIGHT.course + (grade && strong.includes(grade) ? 0.2 : 0);
}
