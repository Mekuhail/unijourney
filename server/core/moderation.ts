/**
 * Text checks shared by club posts and course feedback. Deliberately small and explainable: a short bilingual word list,
 * personal-data patterns and a link limit. Nothing here calls an external service.
 */
export type TextFlag = 'abusive' | 'personal_info' | 'links' | 'shouting';

/** Normalises Arabic letter variants and diacritics so "غبيّ" and "غبي" match the same entry. */
export function normArabic(s: string): string {
  return s.toLowerCase()
    .replace(/[ً-ْـ]/g, '')
    .replace(/[أإآ]/g, 'ا').replace(/ى/g, 'ي').replace(/ة/g, 'ه');
}

const ABUSIVE: RegExp[] = [
  /\bf+u+c+k+/i, /\bs+h+i+t+\b/i, /\bidiot/i, /\bstupid\b/i, /\bmoron/i, /\bdumb\b/i, /\bshut up\b/i, /\bloser\b/i, /\btrash\b/i, /\bworthless\b/i, /\bhate (him|her|you|this doctor|this professor)\b/i,
  /غبي/, /حمار/, /تافه/, /كلب/, /حيوان/, /اغبي/, /اسكت/, /فاشل/, /حقير/, /لعن/
];

const PHONE = /(?:\+?966|\b0)5\d(?:[\s-]?\d){7}\b/;
const EMAIL = /[\w.+-]+@[\w-]+\.[\w.]+/;
const STUDENT_NO = /\b20\d{7}\b/;
const URL = /https?:\/\/|www\./gi;

export interface TextCheck { flags: TextFlag[]; blocking: boolean }

/**
 * `blocking` flags stop a submission with a message the author can fix (abuse, someone's phone or email).
 * Links over the limit and all-caps text are flagged but allowed.
 */
export function checkText(text: string, opts: { maxLinks?: number } = {}): TextCheck {
  const flags = new Set<TextFlag>();
  const norm = normArabic(text);
  if (ABUSIVE.some((r) => r.test(norm))) flags.add('abusive');
  if (PHONE.test(text) || EMAIL.test(text) || STUDENT_NO.test(text)) flags.add('personal_info');
  if ((text.match(URL)?.length ?? 0) > (opts.maxLinks ?? 2)) flags.add('links');
  const letters = text.replace(/[^A-Za-z]/g, '');
  if (letters.length >= 20 && letters === letters.toUpperCase()) flags.add('shouting');
  const list = [...flags];
  return { flags: list, blocking: list.includes('abusive') || list.includes('personal_info') };
}
