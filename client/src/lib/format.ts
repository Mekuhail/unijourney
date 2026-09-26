import type { Locale } from '@shared/types';

export const TZ = 'Asia/Riyadh';

export function fmtDate(iso: string | null | undefined, locale: Locale = 'en', opts: Intl.DateTimeFormatOptions = {}): string {
  if (!iso) return '—';
  const d = iso.length === 10 ? new Date(`${iso}T00:00:00+03:00`) : new Date(iso);
  return new Intl.DateTimeFormat(locale === 'ar' ? 'ar-SA-u-ca-gregory-nu-latn' : 'en-GB', { timeZone: TZ, day: 'numeric', month: 'short', year: 'numeric', ...opts }).format(d);
}

export function fmtTime(iso: string | null | undefined, locale: Locale = 'en'): string {
  if (!iso) return '—';
  if (/^\d{2}:\d{2}$/.test(iso)) {
    const [h, m] = iso.split(':').map(Number);
    const d = new Date(Date.UTC(2026, 0, 1, h - 3, m));
    return new Intl.DateTimeFormat(locale === 'ar' ? 'ar-SA-u-nu-latn' : 'en-GB', { timeZone: TZ, hour: 'numeric', minute: '2-digit', hour12: true }).format(d);
  }
  return new Intl.DateTimeFormat(locale === 'ar' ? 'ar-SA-u-nu-latn' : 'en-GB', { timeZone: TZ, hour: 'numeric', minute: '2-digit', hour12: true }).format(new Date(iso));
}

export function fmtDateTime(iso: string | null | undefined, locale: Locale = 'en'): string {
  if (!iso) return '—';
  return `${fmtDate(iso, locale, { weekday: 'short' })} · ${fmtTime(iso, locale)}`;
}

export function fmtRelative(iso: string, nowIso: string, locale: Locale = 'en'): string {
  const diff = (new Date(iso).getTime() - new Date(nowIso).getTime()) / 1000;
  const rtf = new Intl.RelativeTimeFormat(locale === 'ar' ? 'ar' : 'en', { numeric: 'auto' });
  const abs = Math.abs(diff);
  if (abs < 3600) return rtf.format(Math.round(diff / 60), 'minute');
  if (abs < 86400) return rtf.format(Math.round(diff / 3600), 'hour');
  return rtf.format(Math.round(diff / 86400), 'day');
}

export const WEEKDAYS_EN = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
export const WEEKDAYS_AR = ['الأحد', 'الاثنين', 'الثلاثاء', 'الأربعاء', 'الخميس', 'الجمعة', 'السبت'];
export function weekdayName(i: number, locale: Locale = 'en') {
  return (locale === 'ar' ? WEEKDAYS_AR : WEEKDAYS_EN)[i] ?? '';
}

export function minutesLabel(min: number, locale: Locale = 'en'): string {
  const h = Math.floor(min / 60), m = min % 60;
  if (locale === 'ar') return h ? (m ? `${h} س ${m} د` : `${h} س`) : `${m} د`;
  return h ? (m ? `${h}h ${m}m` : `${h}h`) : `${m}m`;
}

export function pick(locale: Locale, en: string, ar?: string | null): string {
  return locale === 'ar' && ar ? ar : en;
}
