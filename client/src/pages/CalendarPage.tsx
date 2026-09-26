import { useMemo, useState } from 'react';
import { ChevronLeft, ChevronRight, CalendarDays } from 'lucide-react';
import { useI18n } from '@/i18n';
import { useQuery } from '@/lib/useQuery';
import { api } from '@/lib/api';
import type { CalendarEntry } from '@shared/types';
import { PageHeader } from '@/components/ui/PageHeader';
import { Button, Badge, EmptyState } from '@/components/ui';
import { fmtTime, weekdayName } from '@/lib/format';
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
          <Button variant="outline" size="icon" onClick={() => onAnchor(addDays(anchor, -7))} aria-label="Previous week"><ChevronLeft className="h-4 w-4 rtl:rotate-180" /></Button>
          <Button variant="outline" size="sm" onClick={() => onAnchor(today)}>{t('common.today')}</Button>
          <Button variant="outline" size="icon" onClick={() => onAnchor(addDays(anchor, 7))} aria-label="Next week"><ChevronRight className="h-4 w-4 rtl:rotate-180" /></Button>
          <span className="ms-2 text-sm text-muted">{days[0]} → {days[6]}</span>
        </div>
      )}
      <div className="grid grid-cols-1 gap-2 md:grid-cols-7">
        {days.map((d) => {
          const wd = new Date(`${d}T00:00:00Z`).getUTCDay();
          const isWeekend = wd === 5 || wd === 6;
          const list = byDay.get(d) ?? [];
          return (
            <div key={d} className={clsx('card-2 min-h-[120px] p-2', d === today && 'ring-2 ring-brand-500/50', isWeekend && 'opacity-80')}>
              <div className="mb-1.5 flex items-center justify-between px-1 text-xs">
                <span className="font-semibold">{weekdayName(wd, locale)}</span>
                <span className={clsx('num rounded-full px-1.5', d === today && 'bg-brand-500 text-white')}>{d.slice(8)}</span>
              </div>
              <ul className="space-y-1">
                {list.slice(0, compact ? 4 : 50).map((e) => (
                  <li key={e.id}>
                    <Link to={e.link ?? '/calendar'} className="block rounded-lg border border-line bg-surface p-1.5 text-[11px] leading-tight hover:border-brand-400">
                      <span className="flex items-center gap-1.5"><span className={clsx('h-1.5 w-1.5 shrink-0 rounded-full', kindTone[e.kind] ?? 'bg-muted')} /><span className="num text-muted">{fmtTime(e.start_at, locale)}</span>{e.immovable && <span title="Fixed" className="text-[9px]">🔒</span>}</span>
                      <span className="block truncate font-medium">{e.title}</span>
                      {e.location_text && <span className="block truncate text-muted">{e.location_text}</span>}
                    </Link>
                  </li>
                ))}
                {compact && list.length > 4 && <li className="px-1 text-[10px] text-muted">+{list.length - 4}</li>}
              </ul>
            </div>
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
