/**
 * Demo clock. Asia/Riyadh is UTC+03:00 all year (no DST), so local arithmetic is exact.
 * When a demo clock override is set, "now" is frozen at that instant (deterministic demos);
 * the demo panel can advance it.
 */
export const TZ = 'Asia/Riyadh';
export const TZ_OFFSET = '+03:00';
const OFFSET_MS = 3 * 60 * 60 * 1000;

let override: Date | null = null;

export function setClockOverride(iso: string | null) {
  override = iso ? new Date(iso) : null;
  if (override && Number.isNaN(override.getTime())) override = null;
}
export function getClockOverride(): string | null {
  return override ? override.toISOString() : null;
}
export function now(): Date {
  return override ? new Date(override.getTime()) : new Date();
}
export function nowIso(): string {
  return now().toISOString();
}

export interface LocalParts {
  date: string; // YYYY-MM-DD
  time: string; // HH:mm
  weekday: number; // 0 = Sunday
  hour: number;
  minute: number;
}

const pad = (n: number) => String(n).padStart(2, '0');

export function toLocal(d: Date | string): LocalParts {
  const t = typeof d === 'string' ? new Date(d) : d;
  const s = new Date(t.getTime() + OFFSET_MS);
  return {
    date: `${s.getUTCFullYear()}-${pad(s.getUTCMonth() + 1)}-${pad(s.getUTCDate())}`,
    time: `${pad(s.getUTCHours())}:${pad(s.getUTCMinutes())}`,
    weekday: s.getUTCDay(),
    hour: s.getUTCHours(),
    minute: s.getUTCMinutes()
  };
}

export function todayIso(): string {
  return toLocal(now()).date;
}

/** Riyadh local date + time -> ISO instant string with explicit +03:00 offset. */
export function localToIso(date: string, time = '00:00'): string {
  return `${date}T${time}:00${TZ_OFFSET}`;
}

export function addDays(date: string, n: number): string {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

export function addMinutesToTime(time: string, minutes: number): string {
  const [h, m] = time.split(':').map(Number);
  const total = h * 60 + m + minutes;
  return `${pad(Math.floor(total / 60) % 24)}:${pad(total % 60)}`;
}

export function weekdayOf(date: string): number {
  return new Date(`${date}T00:00:00Z`).getUTCDay();
}

export function minutesOf(time: string): number {
  const [h, m] = time.split(':').map(Number);
  return h * 60 + m;
}

export function diffDays(a: string, b: string): number {
  return Math.round((new Date(`${b}T00:00:00Z`).getTime() - new Date(`${a}T00:00:00Z`).getTime()) / 86400000);
}

/** True when [aStart,aEnd) and [bStart,bEnd) overlap (ISO instants or HH:mm on the same day). */
export function overlaps(aStart: string, aEnd: string, bStart: string, bEnd: string): boolean {
  return aStart < bEnd && bStart < aEnd;
}
