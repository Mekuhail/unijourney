import { useMemo, useState } from 'react';
import { ChevronLeft, ChevronRight, CalendarDays, Lock } from 'lucide-react';
import { useI18n } from '@/i18n';
import { useQuery } from '@/lib/useQuery';
import { api } from '@/lib/api';
import type { CalendarEntry } from '@shared/types';
import { PageHeader } from '@/components/ui/PageHeader';
import { Button, Badge, EmptyState } from '@/components/ui';
import { fmtDate, fmtTime, weekdayName } from '@/lib/format';
import { useDemoStatus } from '@/shell/DemoClock';
import { Link } from 'react-router';
import clsx from 'clsx';

const kindTone: Record<string, string> = { class: 'bg-brand-500', exam: 'bg-danger', event: 'bg-gold-500', interview: 'bg-info', task: 'bg-success', personal: 'bg-ink-400', deadline: 'bg-warn' };

function toLocalDate(iso: string) { return new Date(new Date(iso).getTime() + 3 * 3600 * 1000).toISOString().slice(0, 10); }
function addDays(d: string, n: number) { const x = new Date(`${d}T00:00:00Z`); x.setUTCDate(x.getUTCDate() + n); return x.toISOString().slice(0, 10); }
function weekStart(d: string) { const wd = new Date(`${d}T00:00:00Z`).getUTCDay(); return addDays(d, -wd); } // Sunday start

export function WeekCalendar({ entries, anchor, onAnchor, compact }: { entries: CalendarEntry[]; anchor: string; onAnchor?: (d: string) => void; compact?: boolean }) {
  const { locale, t } = useI18n();
  const { data: status } = useDemoStatus();
  const today = status ? toLocalDate(status.clock) : anchor;
  const start = weekStart(anchor);
  const days = Array.from({ length: 7 }, (_, i) => addDays(start, i));
  const byDay = useMemo(() => {
    const m = new Map<string, CalendarEntry[]>();
    for (const e of entries) { const d = toLocalDate(e.start_at); if (!m.has(d)) m.set(d, []); m.get(d)!.push(e); }
    for (const v of m.values()) v.sort((a, b) => a.start_at.localeCompare(b.start_at));
    return m;
  }, [entries]);
  return (
    <div>
      {onAnchor && (
        <div className="mb-3 flex items-center gap-2">
          <Button variant="outline" size="icon" onClick={() => onAnchor(addDays(anchor, -7))} aria-label={t('calendar.prevWeek')}><ChevronLeft className="h-4 w-4 rtl:rotate-180" /></Button>
          <Button variant="outline" size="sm" onClick={() => onAnchor(today)}>{t('common.today')}</Button>
          <Button variant="outline" size="icon" onClick={() => onAnchor(addDays(anchor, 7))} aria-label={t('calendar.nextWeek')}><ChevronRight className="h-4 w-4 rtl:rotate-180" /></Button>
          <span className="ms-2 text-sm text-muted">{fmtDate(days[0], locale, { day: 'numeric', month: 'short' })} – {fmtDate(days[6], locale, { day: 'numeric', month: 'short', year: 'numeric' })}</span>
        </div>
      )}
      <div className="grid grid-cols-1 gap-2 md:grid-cols-7">
        {days.map((d) => {
          const wd = new Date(`${d}T00:00:00Z`).getUTCDay();
          const list = byDay.get(d) ?? [];
          const shown = compact ? list.slice(0, 4) : list;
          const isToday = d === today;
          return (
            <section key={d} aria-label={`${weekdayName(wd, locale)} ${fmtDate(d, locale)}`} className={clsx('card-2 p-2', list.length > 0 && 'md:min-h-[120px]', isToday && 'ring-2 ring-brand-500/50')}>
              <div className={clsx('flex items-center justify-between gap-2 px-1 text-xs', list.length > 0 && 'mb-1.5')}>
                <span className="font-semibold">{weekdayName(wd, locale)}{isToday && <span className="sr-only"> ({t('common.today')})</span>}</span>
                {list.length === 0 && <span className="flex-1 text-muted md:hidden">{t('calendar.noClasses')}</span>}
                <span className={clsx('num rounded-full px-1.5 py-0.5', isToday && 'bg-brand-500 font-semibold text-ink-950')}>{d.slice(8)}</span>
              </div>
              {list.length === 0 ? (
                <p className="hidden px-1 text-xs text-muted md:block">{t('calendar.noClasses')}</p>
              ) : (
                <ul className="space-y-1">
                  {shown.map((e) => (
                    <li key={e.id}>
                      <Link to={e.link ?? '/calendar'} className="block rounded-lg border border-line bg-surface p-1.5 text-xs leading-snug hover:border-brand-400 touch:min-h-11">
                        <span className="flex items-center gap-1.5">
                          <span aria-hidden className={clsx('h-1.5 w-1.5 shrink-0 rounded-full', kindTone[e.kind] ?? 'bg-muted')} />
                          <span className="num text-muted">{fmtTime(e.start_at, locale)}</span>
                          {e.immovable && <span className="inline-flex items-center gap-0.5 text-muted" title={t('calendar.fixed')}><Lock className="h-3 w-3" aria-hidden /><span className="sr-only">{t('calendar.fixed')}</span></span>}
                        </span>
                        <span className="line-clamp-2 font-medium">{e.title}</span>
                        {e.location_text && <span className="block truncate text-muted">{e.location_text}</span>}
                      </Link>
                    </li>
                  ))}
                  {compact && list.length > 4 && <li><Link to="/calendar" className="flex min-h-9 items-center px-1 text-xs font-medium text-brand-600 hover:underline touch:min-h-11">{t('calendar.more', { n: list.length - 4 })}</Link></li>}
                </ul>
              )}
            </section>
          );
        })}
      </div>
    </div>
  );
}

export function CalendarPage() {
  const { t } = useI18n();
  const { data: status } = useDemoStatus();
  const [anchor, setAnchor] = useState<string | null>(null);
  const a = anchor ?? (status ? toLocalDate(status.clock) : '2026-09-27');
  const q = useQuery(() => api<CalendarEntry[]>('/calendar'), [], { refreshOn: ['calendar'] });
  return (
    <div>
      <PageHeader eyebrow={t('nav.calendar')} title={t('nav.calendar')} subtitle="One shared calendar: classes, exams, club events, interviews, study tasks and deadlines. Asia/Riyadh, Sunday–Thursday teaching week." actions={<div className="flex flex-wrap gap-1.5">{Object.entries(kindTone).map(([k, c]) => <Badge key={k} tone="neutral"><span className={clsx('h-2 w-2 rounded-full', c)} />{k}</Badge>)}</div>} />
      {q.data && q.data.length === 0 && <EmptyState icon={<CalendarDays className="h-6 w-6" />} title={t('common.empty')} />}
      {q.data && <WeekCalendar entries={q.data} anchor={a} onAnchor={setAnchor} />}
    </div>
  );
}
