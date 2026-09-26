import type { Db } from '../core/db.ts';
import { j } from '../core/db.ts';
import { nowIso } from '../core/clock.ts';

/**
 * Synthetic community members. They fill club rosters, discussions and the anonymous course-feedback aggregates so the
 * demo has realistic volume. They are not personas: /session/personas hides them and they have no student numbers.
 * Riyadh names are female and Khobar names male, matching YU's separate campuses and the personas.
 */
export const MEMBER_PREFIX = 'u_m_';
export const isSyntheticMember = (id: string) => id.startsWith(MEMBER_PREFIX);

interface MemberSeed { en: string; ar: string; campus: 'riyadh' | 'khobar'; program: string; level: number; interests: string[] }

const MEMBERS: MemberSeed[] = [
  { en: 'Reem Al-Dosari', ar: 'ريم الدوسري', campus: 'riyadh', program: 'bse', level: 5, interests: ['web development', 'ui/ux'] },
  { en: 'Lama Al-Shammari', ar: 'لمى الشمري', campus: 'riyadh', program: 'bse', level: 7, interests: ['ai', 'competitive programming'] },
  { en: 'Hessa Al-Qahtani', ar: 'حصة القحطاني', campus: 'riyadh', program: 'mis', level: 4, interests: ['entrepreneurship', 'data'] },
  { en: 'Joud Al-Mutairi', ar: 'جود المطيري', campus: 'riyadh', program: 'bse', level: 3, interests: ['games', 'web development'] },
  { en: 'Wejdan Al-Harbi', ar: 'وجدان الحربي', campus: 'riyadh', program: 'law', level: 6, interests: ['debate', 'law', 'public speaking'] },
  { en: 'Raghad Al-Zahrani', ar: 'رغد الزهراني', campus: 'riyadh', program: 'aia', level: 5, interests: ['architecture', 'design', 'photography'] },
  { en: 'Shahad Al-Ghamdi', ar: 'شهد الغامدي', campus: 'riyadh', program: 'bse', level: 6, interests: ['cybersecurity', 'ctf'] },
  { en: 'Deema Al-Anazi', ar: 'ديمة العنزي', campus: 'riyadh', program: 'fin', level: 4, interests: ['fintech', 'entrepreneurship'] },
  { en: 'Rawan Al-Juhani', ar: 'روان الجهني', campus: 'riyadh', program: 'bse', level: 8, interests: ['cloud', 'web development'] },
  { en: 'Nouf Al-Subaie', ar: 'نوف السبيعي', campus: 'riyadh', program: 'mgt', level: 3, interests: ['volunteering', 'community'] },
  { en: 'Ghadah Al-Malki', ar: 'غادة المالكي', campus: 'riyadh', program: 'aia', level: 7, interests: ['architecture', 'sustainability'] },
  { en: 'Lujain Al-Rashid', ar: 'لجين الراشد', campus: 'riyadh', program: 'bse', level: 5, interests: ['ai', 'data', 'hackathons'] },
  { en: 'Haya Al-Amri', ar: 'هيا العمري', campus: 'riyadh', program: 'law', level: 4, interests: ['law', 'moot court', 'debate'] },
  { en: 'Dana Al-Shehri', ar: 'دانة الشهري', campus: 'riyadh', program: 'bse', level: 6, interests: ['competitive programming', 'algorithms'] },
  { en: 'Arwa Al-Tamimi', ar: 'أروى التميمي', campus: 'riyadh', program: 'mis', level: 5, interests: ['ui/ux', 'entrepreneurship'] },
  { en: 'Yara Al-Khaldi', ar: 'يارا الخالدي', campus: 'riyadh', program: 'bse', level: 6, interests: ['web development', 'cybersecurity'] },
  { en: 'Afnan Al-Mansour', ar: 'أفنان المنصور', campus: 'riyadh', program: 'ie', level: 5, interests: ['volunteering', 'sustainability'] },
  { en: 'Maryam Al-Sulami', ar: 'مريم السلمي', campus: 'riyadh', program: 'bse', level: 6, interests: ['games', 'ai'] },
  { en: 'Abdulrahman Al-Dossary', ar: 'عبدالرحمن الدوسري', campus: 'khobar', program: 'bcne', level: 4, interests: ['networking', 'cybersecurity'] },
  { en: 'Turki Al-Hajri', ar: 'تركي الهاجري', campus: 'khobar', program: 'bcne', level: 3, interests: ['iot', 'robotics'] },
  { en: 'Majed Al-Marri', ar: 'ماجد المري', campus: 'khobar', program: 'bcne', level: 5, interests: ['cybersecurity', 'ctf'] },
  { en: 'Nawaf Al-Buainain', ar: 'نواف البوعينين', campus: 'khobar', program: 'mgt', level: 4, interests: ['photography', 'entrepreneurship'] },
  { en: 'Salman Al-Yami', ar: 'سلمان اليامي', campus: 'khobar', program: 'bcne', level: 3, interests: ['competitive programming', 'networking'] },
  { en: 'Rayan Al-Shahrani', ar: 'ريان الشهراني', campus: 'khobar', program: 'bcne', level: 3, interests: ['iot', 'photography'] },
  { en: 'Ziyad Al-Mulla', ar: 'زياد الملا', campus: 'khobar', program: 'fin', level: 5, interests: ['fintech', 'debate'] },
  { en: 'Meshal Al-Qarni', ar: 'مشعل القرني', campus: 'khobar', program: 'bcne', level: 6, interests: ['cloud', 'networking'] },
  { en: 'Hassan Al-Nasser', ar: 'حسن الناصر', campus: 'khobar', program: 'bcne', level: 3, interests: ['volunteering', 'iot'] }
];

const COLORS = ['#7C5CFF', '#0EA5E9', '#14B8A6', '#E11D48', '#F59E0B', '#6366F1', '#22C55E', '#EC4899', '#0891B2'];

export function memberId(i: number) {
  return `${MEMBER_PREFIX}${String(i + 1).padStart(2, '0')}`;
}

export function seedMembers(d: Db): string[] {
  const now = nowIso();
  return MEMBERS.map((m, i) => {
    const id = memberId(i);
    d.insert('users', {
      id, roles: j(['student']), name_en: m.en, name_ar: m.ar, email: `m${String(i + 1).padStart(2, '0')}.demo@student.yu-demo.invalid`, student_no: null,
      program_id: m.program, campus_id: m.campus, stage: 'current', level: m.level, locale: 'en', interests: j(m.interests), skills: j([]), preferences: j({ synthetic_member: true }),
      avatar_color: COLORS[i % COLORS.length], department: null, created_at: now
    });
    return id;
  });
}

/** Riyadh or Khobar member ids, in seed order. */
export function membersOn(campus: 'riyadh' | 'khobar'): string[] {
  return MEMBERS.flatMap((m, i) => (m.campus === campus ? [memberId(i)] : []));
}
