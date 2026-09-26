/**
 * Deterministic natural-language helpers (no model required). Every parser returns editable drafts plus
 * confidence/issues so the UI can show what was understood. AI (server/adapters/ai.ts) may refine wording later but
 * never decides business rules.
 */
import { addDays, todayIso, weekdayOf } from '../../core/clock.ts';

const DAY_NAMES: Array<[RegExp, number]> = [[/\bsun(day)?s?\b/i, 0], [/\bmon(day)?s?\b/i, 1], [/\btue(s|sday)?s?\b/i, 2], [/\bwed(nesday)?s?\b/i, 3], [/\bthu(r|rs|rsday)?s?\b/i, 4], [/\bfri(day)?s?\b/i, 5], [/\bsat(urday)?s?\b/i, 6]];
const MONTHS: Record<string, number> = { jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6, jul: 7, aug: 8, sep: 9, sept: 9, oct: 10, nov: 11, dec: 12 };
const pad = (n: number) => String(n).padStart(2, '0');

export const COURSE_RE = /\b([A-Za-z]{3})\s?-?(\d{3})\b/g;
export function normalizeCourse(s: string): string {
  const m = /([A-Za-z]{3})\s?-?(\d{3})/.exec(s);
  return m ? `${m[1].toUpperCase()} ${m[2]}` : s.toUpperCase();
}
export function findCourseCodes(text: string, known?: Set<string>): string[] {
  const out: string[] = [];
  for (const m of text.matchAll(COURSE_RE)) {
    const code = `${m[1].toUpperCase()} ${m[2]}`;
    if (known && !known.has(code)) continue;
    if (!out.includes(code)) out.push(code);
  }
  return out;
}

/** Resolve a date phrase relative to the demo clock. Returns ISO date + the matched phrase. */
export function resolveDatePhrase(text: string, today = todayIso()): { date: string; phrase: string; confidence: number } | null {
  const t = text.toLowerCase();
  let m: RegExpExecArray | null;
  if ((m = /\b(20\d{2})-(\d{1,2})-(\d{1,2})\b/.exec(t))) return { date: `${m[1]}-${pad(+m[2])}-${pad(+m[3])}`, phrase: m[0], confidence: 0.98 };
  if ((m = /\b(\d{1,2})[\/.](\d{1,2})(?:[\/.](20\d{2}))?\b/.exec(t))) { const y = m[3] ? +m[3] : +today.slice(0, 4); return { date: `${y}-${pad(+m[2])}-${pad(+m[1])}`, phrase: m[0], confidence: 0.8 }; }
  if ((m = /\b(\d{1,2})(?:st|nd|rd|th)?\s+(jan|feb|mar|apr|may|jun|jul|aug|sept?|oct|nov|dec)[a-z]*\.?(?:,?\s+(20\d{2}))?\b/.exec(t))) { const y = m[3] ? +m[3] : +today.slice(0, 4); return { date: `${y}-${pad(MONTHS[m[2]])}-${pad(+m[1])}`, phrase: m[0], confidence: 0.9 }; }
  if ((m = /\b(jan|feb|mar|apr|may|jun|jul|aug|sept?|oct|nov|dec)[a-z]*\.?\s+(\d{1,2})(?:st|nd|rd|th)?(?:,?\s+(20\d{2}))?\b/.exec(t))) { const y = m[3] ? +m[3] : +today.slice(0, 4); return { date: `${y}-${pad(MONTHS[m[1]])}-${pad(+m[2])}`, phrase: m[0], confidence: 0.9 }; }
  if ((m = /\b(day before yesterday)\b/.exec(t))) return { date: addDays(today, -2), phrase: m[0], confidence: 0.95 };
  if ((m = /\byesterday'?s?\b/.exec(t))) return { date: addDays(today, -1), phrase: m[0], confidence: 0.95 };
  if ((m = /\btoday'?s?\b/.exec(t))) return { date: today, phrase: m[0], confidence: 0.95 };
  if ((m = /\btomorrow'?s?\b/.exec(t))) return { date: addDays(today, 1), phrase: m[0], confidence: 0.95 };
  if ((m = /\b(\d+|two|three|four|five|six|seven)\s+days?\s+ago\b/.exec(t))) { const n = wordNum(m[1]); return { date: addDays(today, -n), phrase: m[0], confidence: 0.9 }; }
  if ((m = /\bin\s+(\d+|two|three|four|five|six|seven)\s+days?\b/.exec(t))) { const n = wordNum(m[1]); return { date: addDays(today, n), phrase: m[0], confidence: 0.9 }; }
  if ((m = /\b(a|one|\d+)\s+weeks?\s+ago\b/.exec(t))) { const n = m[1] === 'a' || m[1] === 'one' ? 1 : +m[1]; return { date: addDays(today, -7 * n), phrase: m[0], confidence: 0.7 }; }
  if ((m = /\bnext\s+week\b/.exec(t))) return { date: addDays(today, 7), phrase: m[0], confidence: 0.6 };
  if ((m = /\bend\s+of\s+(the\s+)?week\b|\beow\b/.exec(t))) { const wd = weekdayOf(today); const delta = (4 - wd + 7) % 7; return { date: addDays(today, delta === 0 ? 0 : delta), phrase: m[0], confidence: 0.7 }; }
  for (const [re, day] of DAY_NAMES) {
    const dm = new RegExp(`\\b(last|this|next|on|coming)?\\s*${re.source}`, 'i').exec(t);
    if (!dm) continue;
    const qualifier = (dm[1] ?? '').toLowerCase();
    const wd = weekdayOf(today);
    let delta: number;
    if (qualifier === 'last') { delta = -(((wd - day + 7) % 7) || 7); }
    else if (qualifier === 'next') { delta = ((day - wd + 7) % 7) || 7; if (delta < 7 && day > wd) delta += 0; }
    else { delta = (day - wd + 7) % 7; } // this/on/bare: upcoming (today if same weekday)
    return { date: addDays(today, delta), phrase: dm[0].trim(), confidence: qualifier ? 0.85 : 0.7 };
  }
  return null;
}
function wordNum(s: string): number { const w: Record<string, number> = { two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7 }; return w[s] ?? +s; }

/** Effort in minutes from phrases like "2h", "1.5 hours", "90 min", "1h30", "half an hour". */
export function parseEffort(text: string): { minutes: number; phrase: string } | null {
  const t = text.toLowerCase();
  let m: RegExpExecArray | null;
  if ((m = /\b(\d+)\s*h(?:ours?|rs?)?\s*(\d{1,2})\s*(?:m|min|mins|minutes)?\b/.exec(t)) && m[2]) return { minutes: +m[1] * 60 + +m[2], phrase: m[0] };
  if ((m = /\b(\d+):(\d{2})\s*h\b/.exec(t))) return { minutes: +m[1] * 60 + +m[2], phrase: m[0] };
  if ((m = /\b(\d+(?:[.,]\d+)?)\s*(?:h|hr|hrs|hour|hours)\b/.exec(t))) return { minutes: Math.round(parseFloat(m[1].replace(',', '.')) * 60), phrase: m[0] };
  if ((m = /\b(\d+)\s*(?:m|min|mins|minutes)\b/.exec(t))) return { minutes: +m[1], phrase: m[0] };
  if ((m = /\bhalf\s+an?\s+hour\b/.exec(t))) return { minutes: 30, phrase: m[0] };
  if ((m = /\ban?\s+hour\b/.exec(t))) return { minutes: 60, phrase: m[0] };
  if ((m = /\bquarter\s+(?:of\s+an\s+)?hour\b/.exec(t))) return { minutes: 15, phrase: m[0] };
  return null;
}

export interface TaskDraft { line: string; title: string; course_code: string | null; effort_min: number; deadline: string | null; priority: number; confidence: number; issues: string[]; parsed: { effort?: string; deadline?: string; course?: string } }

export function parseTaskLines(text: string, knownCourses: Set<string>, today = todayIso()): TaskDraft[] {
  const lines = text.split(/\r?\n|;/).map((l) => l.trim()).filter(Boolean);
  return lines.map((line) => {
    const issues: string[] = [];
    let confidence = 1;
    let rest = line;
    const codes = findCourseCodes(line);
    let course: string | null = null;
    if (codes.length) {
      course = codes[0];
      if (!knownCourses.has(course)) { issues.push(`${course} is not one of your courses — check the code`); confidence -= 0.2; }
      rest = rest.replace(new RegExp(`\\b(for|in|of)?\\s*${course.replace(' ', '\\s?-?')}\\b`, 'i'), ' ');
    } else { confidence -= 0.1; }
    const effort = parseEffort(line);
    let effort_min = 60;
    if (effort) { effort_min = effort.minutes; rest = rest.replace(effort.phrase, ' '); } else { issues.push('No effort found — defaulted to 60 min'); confidence -= 0.25; }
    const dl = resolveDatePhrase(line, today);
    let deadline: string | null = null;
    if (dl) { deadline = dl.date; rest = rest.replace(new RegExp(`\\b(by|due|before|until|on|deadline)?\\s*${escapeRe(dl.phrase)}`, 'i'), ' '); if (dl.confidence < 0.8) issues.push(`Deadline "${dl.phrase}" resolved to ${dl.date} — please confirm`); confidence -= (1 - dl.confidence) * 0.5; }
    else { issues.push('No deadline found'); confidence -= 0.2; }
    let priority = 2;
    if (/\b(urgent|asap|important|high priority)\b/i.test(line)) { priority = 1; rest = rest.replace(/\b(urgent|asap|important|high priority)\b/i, ' '); }
    if (/\b(low priority|whenever|optional)\b/i.test(line)) { priority = 3; rest = rest.replace(/\b(low priority|whenever|optional)\b/i, ' '); }
    let title = rest.replace(/[,;()\-–—]+/g, ' ').replace(/\b(by|due|before|until|deadline|for)\s*$/i, '').replace(/\s+/g, ' ').trim();
    if (!title) { title = course ? `${course} task` : 'Untitled task'; issues.push('Title could not be extracted — please edit'); confidence -= 0.2; }
    title = title.charAt(0).toUpperCase() + title.slice(1);
    return { line, title, course_code: course, effort_min, deadline, priority, confidence: Math.max(0.1, Math.round(confidence * 100) / 100), issues, parsed: { effort: effort?.phrase, deadline: dl?.phrase, course: course ?? undefined } };
  });
}
function escapeRe(s: string) { return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); }

// ---------------------------------------------------------------- registration preferences
export interface ParsedPreferences { avoidEarly?: boolean; avoidDays?: number[]; keepWindows?: Array<{ day: number; start: string; end: string; label?: string }>; maxCredits?: number; courses?: string[]; compact?: boolean; countInProgress?: boolean; lightLoad?: boolean; understood: string[]; unparsed: string[] }

function timeOf(h: string, ampm?: string): string {
  let hour = parseInt(h, 10);
  const minutes = /:(\d{2})/.exec(h)?.[1] ?? '00';
  if (ampm?.startsWith('p') && hour < 12) hour += 12;
  if (ampm?.startsWith('a') && hour === 12) hour = 0;
  if (!ampm && hour <= 6) hour += 12; // "4" without am/pm -> 16:00 on campus
  return `${pad(hour)}:${minutes}`;
}
function addMin(t: string, n: number) { const [h, m] = t.split(':').map(Number); const tot = h * 60 + m + n; return `${pad(Math.floor(tot / 60))}:${pad(tot % 60)}`; }

export function parsePreferenceText(text: string, knownCourses?: Set<string>): ParsedPreferences {
  const out: ParsedPreferences = { understood: [], unparsed: [] };
  const clauses = text.split(/[,.;\n]|\band\b|\bbut\b/i).map((c) => c.trim()).filter(Boolean);
  for (const c of clauses) {
    const lc = c.toLowerCase();
    let hit = false;
    if (/\b(avoid|no|not|without|skip|hate)\b.*\b(early|8\s*am|8:00|morning|first slot)\b|\bnot? (a )?morning person\b|\blate start/.test(lc)) { out.avoidEarly = true; out.understood.push('Avoid early classes (no 08:00 slots)'); hit = true; }
    const dayHits: number[] = [];
    for (const [re, day] of DAY_NAMES) if (re.test(lc)) dayHits.push(day);
    const timeM = /(\d{1,2}(?::\d{2})?)\s*(am|pm|a\.m\.|p\.m\.)?(?:\s*(?:-|–|to)\s*(\d{1,2}(?::\d{2})?)\s*(am|pm)?)?/.exec(lc);
    const isKeep = /\b(keep|leave|free|workshop|meeting|club|training|work|job|volunteer|reserve|block|busy|session|practice)\b/.test(lc) && !/\b(no|avoid|without|skip)\s+(classes?|class)\s+on\b/.test(lc);
    if (dayHits.length && isKeep && (timeM || /\b(morning|afternoon|evening|all day)\b/.test(lc))) {
      let start = '13:00', end = '17:00';
      if (timeM && timeM[1] && !/^\d{1,2}$/.test(timeM[1]) || (timeM && (timeM[2] || timeM[3]))) { start = timeOf(timeM![1], timeM![2]?.replace(/\./g, '')); end = timeM![3] ? timeOf(timeM![3], (timeM![4] ?? timeM![2])?.replace(/\./g, '')) : addMin(start, 120); }
      else if (timeM && /^\d{1,2}$/.test(timeM[1]) && +timeM[1] >= 1 && +timeM[1] <= 12 && /\b(pm|am|o'clock|at)\b/.test(lc)) { start = timeOf(timeM[1], /pm/.test(lc) ? 'pm' : /am/.test(lc) ? 'am' : undefined); end = addMin(start, 120); }
      else if (/\bmorning\b/.test(lc)) { start = '08:00'; end = '12:15'; }
      else if (/\bevening\b/.test(lc)) { start = '16:00'; end = '20:00'; }
      else if (/\ball day\b/.test(lc)) { start = '08:00'; end = '18:00'; }
      out.keepWindows = out.keepWindows ?? [];
      for (const day of dayHits) out.keepWindows.push({ day, start, end, label: c });
      out.understood.push(`Keep ${dayHits.map((d) => DAY_LABEL[d]).join('/')} ${start}–${end} free (${c})`);
      hit = true;
    } else if (dayHits.length && /\b(no|avoid|without|skip|off|free|not on)\b/.test(lc)) {
      out.avoidDays = [...new Set([...(out.avoidDays ?? []), ...dayHits])];
      out.understood.push(`No classes on ${dayHits.map((d) => DAY_LABEL[d]).join('/')}`);
      hit = true;
    }
    const cm = /\b(max(?:imum)?|at most|up to|no more than|only|cap(?: at)?)\s*(\d{1,2})\s*(credits?|ch|hours?)?\b|\b(\d{1,2})\s*(credits?|ch)\s*(max(?:imum)?|at most|only|tops)\b/.exec(lc);
    if (cm) { const n = +(cm[2] ?? cm[4]); if (n >= 1 && n <= 24) { out.maxCredits = n; out.understood.push(`At most ${n} credits`); hit = true; } }
    if (/\b(light|lighter|small|reduced|easy)\s+(load|term|semester|schedule)\b|\btake it easy\b/.test(lc)) { out.lightLoad = true; out.understood.push('Lighter load (around 12–13 credits)'); hit = true; }
    if (/\b(compact|fewer days|few days|two days|2 days|three days|3 days|dense)\b/.test(lc)) { out.compact = true; out.understood.push('Compact week (fewer campus days)'); hit = true; }
    if (/\b(count|assume|include)\b.*\b(in[- ]progress|current courses|i pass|passing)\b|\bconditional\b/.test(lc)) { out.countInProgress = true; out.understood.push('Count in-progress courses as prerequisites (conditional on passing)'); hit = true; }
    const codes = findCourseCodes(c, knownCourses);
    if (codes.length) { out.courses = [...new Set([...(out.courses ?? []), ...codes])]; out.understood.push(`Include ${codes.join(', ')}`); hit = true; }
    if (!hit) out.unparsed.push(c);
  }
  return out;
}
export const DAY_LABEL = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
