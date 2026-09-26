/**
 * Registry of additional programme curricula (beyond BSE/BCNE, which live in ../curriculum.ts).
 * Each programme file exports a `ProgramCurriculum`. Add new programmes to EXTRA_PROGRAMS below.
 * Data is transcribed from official Al Yamamah University study plans; `source_note` states the version and any
 * gaps (for example when prerequisite columns were not machine-readable).
 */
import type { CourseDef, PlanTerm, RequirementDef } from '../curriculum.ts';
import { misCurriculum } from './mis.ts';
import { accCurriculum } from './acc.ts';
import { finCurriculum } from './fin.ts';
import { mktCurriculum } from './mkt.ts';
import { mgtCurriculum } from './mgt.ts';
import { ieCurriculum } from './ie.ts';
import { aiaCurriculum } from './aia.ts';
import { lawPrivateCurriculum } from './law_private.ts';
import { lawPublicCurriculum } from './law_public.ts';

export interface ProgramDef {
  id: string;                 // e.g. 'mis'
  code: string;               // e.g. 'MIS'
  name_en: string;
  name_ar: string;
  college_id: 'coea' | 'cob' | 'law';
  college_en: string;
  college_ar: string;
  degree: string;             // e.g. 'B.S. in Business Administration'
  total_credits: number;
  duration_years: number;
  source_url: string;
  source_version: string;     // e.g. 'Study plan 5.2 (Aug 2026)'
  source_note: string;        // transcription notes / gaps
  campus_ids: string[];
}

export interface ProgramCurriculum {
  program: ProgramDef;
  courses: CourseDef[];       // only courses not already defined in ../curriculum.ts need full definitions; shared codes may be re-listed (first definition wins)
  plan: PlanTerm[];
  requirements: RequirementDef[];
  electivePools?: Record<string, string[]>;   // e.g. { major: ['MIS 4xx', ...], hss: [...] }
}

export const EXTRA_PROGRAMS: ProgramCurriculum[] = [misCurriculum, accCurriculum, finCurriculum, mktCurriculum, mgtCurriculum, ieCurriculum, aiaCurriculum, lawPrivateCurriculum, lawPublicCurriculum];

export const COLLEGES: Array<{ id: 'coea' | 'cob' | 'law'; name_en: string; name_ar: string; url: string }> = [
  { id: 'coea', name_en: 'College of Engineering & Architecture', name_ar: 'كلية الهندسة والعمارة', url: 'https://yu.edu.sa/academics/coea/' },
  { id: 'cob', name_en: 'College of Business', name_ar: 'كلية الأعمال', url: 'https://yu.edu.sa/academics/cob/' },
  { id: 'law', name_en: 'College of Law', name_ar: 'كلية القانون', url: 'https://yu.edu.sa/academics/college-of-law/' }
];
