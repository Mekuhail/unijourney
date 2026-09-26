import { type ReactNode } from 'react';
import { NavLink, Link, useLocation } from 'react-router';
import { useEdgeFade } from '@/components/ui/useEdgeFade';
import * as M from 'motion/react-m';
import clsx from 'clsx';
import { CheckCircle2, AlertTriangle, XCircle, Lock, LayoutDashboard, Map, ListChecks, CalendarDays, UserCheck, FileText, BookOpenCheck, Check, ChevronLeft } from 'lucide-react';
import { useI18n } from '@/i18n';
import { weekdayName, fmtTime, fmtDate } from '@/lib/format';
import type { Check as PlanCheck, ExcuseCheck, Meeting, DayLoad } from './api';
import { minutesOf, TEACHING_DAYS } from './api';

// ---------------------------------------------------------------- sub navigation
const SUB = [
  { to: '/academics', key: 'academics.nav.overview', icon: LayoutDashboard, end: true },
  { to: '/academics/plan', key: 'academics.nav.plan', icon: Map },
  { to: '/academics/register', key: 'academics.nav.register', icon: ListChecks },
  { to: '/academics/timetable', key: 'academics.nav.timetable', icon: CalendarDays },
  { to: '/academics/attendance', key: 'academics.nav.attendance', icon: UserCheck },
  { to: '/academics/excuses', key: 'academics.nav.excuses', icon: FileText },
  { to: '/academics/study', key: 'academics.nav.study', icon: BookOpenCheck }
];
export function AcademicsNav() {
  const { t } = useI18n();
  const { pathname } = useLocation();
  const row = useEdgeFade<HTMLElement>(pathname);
  return (
    <div className="mb-5 rounded-2xl bg-surface-2 p-1">
      <nav ref={row} aria-label={t('nav.academics')} className="scroll-row flex gap-1 overflow-x-auto">
        {SUB.map((s) => (
          <NavLink key={s.to} to={s.to} end={s.end} className={({ isActive }) => clsx('relative flex shrink-0 items-center gap-2 rounded-xl px-3.5 py-2 text-sm font-medium transition-colors touch:min-h-11', isActive ? 'text-fg' : 'text-muted hover:text-fg')}>
            {({ isActive }) => (<>{isActive && <M.span layoutId="acad-tab" className="absolute inset-0 rounded-xl bg-surface shadow-sm" transition={{ type: 'spring', stiffness: 400, damping: 30 }} />}<span className="relative flex items-center gap-2 whitespace-nowrap"><s.icon className="h-4 w-4" />{t(s.key)}</span></>)}
          </NavLink>
        ))}
      </nav>
    </div>
  );
}

// ---------------------------------------------------------------- stat tile
export function StatTile({ value, label, hint, icon, tone = 'brand', suffix, to }: { value: number; label: ReactNode; hint?: ReactNode; icon?: ReactNode; tone?: 'brand' | 'gold' | 'success' | 'warn' | 'danger' | 'info'; suffix?: string; to?: string }) {
  const c = { brand: 'text-brand-600', gold: 'text-gold-700', success: 'text-success', warn: 'text-warn', danger: 'text-danger', info: 'text-info' }[tone];
  const body = (
    <div className="card h-full p-4 transition hover:border-brand-400">
      <div className="flex items-start justify-between gap-2">
        <div className="text-xs font-semibold text-muted">{label}</div>
        {icon && <span className={clsx('grid h-8 w-8 place-items-center rounded-xl bg-line/60', c)}>{icon}</span>}
      </div>
      <div className={clsx('num mt-2 text-3xl font-bold', c)}>{value}{suffix && <span className="ms-1 text-base font-semibold text-muted">{suffix}</span>}</div>
      {hint && <div className="mt-1 text-xs text-muted">{hint}</div>}
    </div>
  );
  return to ? <Link to={to} className="block h-full">{body}</Link> : body;
}

// ---------------------------------------------------------------- step flow (server-driven)
export interface FlowStep { key: string; label: ReactNode; state: 'done' | 'current' | 'todo' | 'blocked' }
export function FlowSteps({ steps, onSelect }: { steps: FlowStep[]; onSelect?: (key: string) => void }) {
  const { t } = useI18n();
  const cur = Math.max(0, steps.findIndex((s) => s.state === 'current'));
  const row = useEdgeFade<HTMLOListElement>(cur);
  return (
    <>
      {/* Phones: one line, "Step 2 of 3 · Review & edit" */}
      <div className="flex items-center justify-between gap-2 sm:hidden">
        <p className="text-sm font-medium" aria-live="polite"><span className="text-muted">{t('common.stepOf', { n: cur + 1, total: steps.length })} · </span>{steps[cur]?.label}</p>
        {onSelect && cur > 0 && <button type="button" onClick={() => onSelect(steps[cur - 1].key)} className="inline-flex min-h-11 shrink-0 items-center gap-1 rounded-xl px-2 text-sm font-medium text-brand-600"><ChevronLeft className="h-4 w-4 rtl:rotate-180" aria-hidden />{t('common.back')}</button>}
      </div>
      <ol ref={row} className="scroll-row hidden items-center gap-2 overflow-x-auto py-1 sm:flex" aria-label={t('common.progress')}>
        {steps.map((s, i) => (
          <li key={s.key} className="flex shrink-0 items-center gap-2">
            <button type="button" onClick={() => onSelect?.(s.key)} disabled={!onSelect} className={clsx('flex min-h-9 items-center gap-2 whitespace-nowrap rounded-full border px-3 py-1.5 text-xs font-semibold transition', s.state === 'done' && 'border-success/40 bg-success/10 text-success', s.state === 'current' && 'border-brand-500 bg-brand-500 text-ink-950 shadow', s.state === 'todo' && 'border-line bg-surface text-muted', s.state === 'blocked' && 'border-danger/40 bg-danger/10 text-danger', onSelect && 'cursor-pointer hover:border-brand-400')} aria-current={s.state === 'current' ? 'step' : undefined}>
              <span className={clsx('grid h-5 w-5 place-items-center rounded-full text-xs', s.state === 'current' ? 'bg-white/35' : 'bg-line/70')}>{s.state === 'done' ? <Check className="h-3 w-3" /> : i + 1}</span>
              {s.label}
            </button>
            {i < steps.length - 1 && <span className={clsx('h-px w-6 shrink-0', s.state === 'done' ? 'bg-success/60' : 'bg-line')} aria-hidden />}
          </li>
        ))}
      </ol>
    </>
  );
}

// ---------------------------------------------------------------- weekly grid (Sun–Thu, 08:00–17:00)
export interface GridBlock { id: string; day: number; start: string; end: string; title: string; subtitle?: string; tone?: 'brand' | 'gold' | 'info' | 'success' | 'danger' | 'muted' | 'warn'; to?: string; onClick?: () => void; dashed?: boolean }
const START = 8 * 60, END = 17 * 60;
export function WeekGrid({ blocks, highlightDay, compact, className }: { blocks: GridBlock[]; highlightDay?: number; compact?: boolean; className?: string }) {
  const { locale, t } = useI18n();
  const hours = Array.from({ length: (END - START) / 60 + 1 }, (_, i) => START + i * 60);
  const rowH = compact ? 34 : 52; // px per hour
  const tone: Record<string, string> = { brand: 'bg-brand-500/15 border-brand-500/50 text-brand-800 dark:text-brand-200', gold: 'bg-gold-100 border-gold-500/60 text-gold-700 dark:bg-gold-700/30 dark:text-gold-300', info: 'bg-info/15 border-info/50 text-info', success: 'bg-success/15 border-success/50 text-success', danger: 'bg-danger/15 border-danger/50 text-danger', muted: 'bg-line/60 border-line text-muted', warn: 'bg-warn/15 border-warn/50 text-warn' };
  return (
    <div className={clsx('overflow-x-auto', className)}>
      <div className="min-w-[560px]" style={{ display: 'grid', gridTemplateColumns: `44px repeat(${TEACHING_DAYS.length}, minmax(0, 1fr))` }}>
        <div />
        {TEACHING_DAYS.map((d) => <div key={d} className={clsx('px-1 pb-1 text-center text-xs font-semibold', highlightDay === d ? 'text-brand-600' : 'text-muted')}>{weekdayName(d, locale)}{highlightDay === d && <span className="ms-1 rounded-full bg-brand-500 px-1.5 text-xs text-ink-950">{t('common.today')}</span>}</div>)}
        <div className="relative" style={{ height: (END - START) / 60 * rowH }}>
          {hours.map((h) => <div key={h} className="num absolute -translate-y-1/2 pe-1 text-end text-xs text-muted" style={{ top: ((h - START) / 60) * rowH, insetInlineEnd: 0 }}>{fmtTime(`${String(h / 60).padStart(2, '0')}:00`, locale).replace(':00', '')}</div>)}
        </div>
        {TEACHING_DAYS.map((d) => (
          <div key={d} className={clsx('relative border-s border-line', highlightDay === d && 'bg-brand-500/5')} style={{ height: (END - START) / 60 * rowH }}>
            {hours.map((h) => <div key={h} className="absolute inset-x-0 border-t border-line/70" style={{ top: ((h - START) / 60) * rowH }} />)}
            {blocks.filter((b) => b.day === d).map((b) => {
              const top = ((minutesOf(b.start) - START) / 60) * rowH, height = Math.max(18, ((minutesOf(b.end) - minutesOf(b.start)) / 60) * rowH);
              const cls = clsx('absolute inset-x-0.5 overflow-hidden rounded-lg border px-1.5 py-1 text-xs leading-tight shadow-sm transition', tone[b.tone ?? 'brand'], b.dashed && 'border-dashed', (b.to || b.onClick) && 'cursor-pointer hover:brightness-95 hover:shadow');
              const inner = <><span className="block truncate font-semibold">{b.title}</span>{!compact && b.subtitle && <span className="block truncate">{b.subtitle}</span>}<span className="num block">{b.start}–{b.end}</span></>;
              return b.to ? <Link key={b.id} to={b.to} className={cls} style={{ top, height }} title={`${b.title} ${b.start}–${b.end}`}>{inner}</Link> : <div key={b.id} role={b.onClick ? 'button' : undefined} tabIndex={b.onClick ? 0 : undefined} onClick={b.onClick} onKeyDown={(e) => { if (b.onClick && (e.key === 'Enter' || e.key === ' ')) b.onClick(); }} className={cls} style={{ top, height }} title={`${b.title} ${b.start}–${b.end}`}>{inner}</div>;
            })}
          </div>
        ))}
      </div>
    </div>
  );
}
export function meetingsToBlocks(items: Array<{ id: string; code: string; title?: string; meetings: Meeting[]; tone?: GridBlock['tone']; to?: string; onClick?: () => void }>): GridBlock[] {
  return items.flatMap((it) => it.meetings.map((m, i) => ({ id: `${it.id}-${i}`, day: m.day, start: m.start, end: m.end, title: it.code, subtitle: m.location?.name_en ?? it.title, tone: it.tone, to: it.to, onClick: it.onClick })));
}

// ---------------------------------------------------------------- checks list
export function CheckIcon({ status, className }: { status: 'pass' | 'warn' | 'fail'; className?: string }) {
  if (status === 'pass') return <CheckCircle2 className={clsx('h-4 w-4 text-success', className)} aria-label="pass" />;
  if (status === 'warn') return <AlertTriangle className={clsx('h-4 w-4 text-warn', className)} aria-label="warning" />;
  return <XCircle className={clsx('h-4 w-4 text-danger', className)} aria-label="fail" />;
}
export function ChecksList({ checks, compact }: { checks: Array<PlanCheck | ExcuseCheck>; compact?: boolean }) {
  const { t } = useI18n();
  return (
    <ul className={clsx('space-y-1.5', compact && 'text-xs')}>
      {checks.map((c) => (
        <li key={c.id} className={clsx('flex gap-2 rounded-xl border px-3 py-2', c.status === 'fail' ? 'border-danger/30 bg-danger/5' : c.status === 'warn' ? 'border-warn/30 bg-warn/5' : 'border-line bg-surface')}>
          <CheckIcon status={c.status} className="mt-0.5 shrink-0" />
          <div className="min-w-0 text-sm">
            <span className="font-semibold">{c.label}</span>
            {'hard' in c && c.hard && <span className="ms-2 rounded-full bg-line/70 px-1.5 text-xs font-semibold uppercase text-muted">{t('academics.checks.hard')}</span>}
            {'hard' in c && !c.hard && <span className="ms-2 rounded-full bg-line/70 px-1.5 text-xs font-semibold uppercase text-muted">{t('academics.checks.soft')}</span>}
            {!compact && <div className="text-muted">{c.explanation}</div>}
          </div>
        </li>
      ))}
    </ul>
  );
}

// ---------------------------------------------------------------- day load bars
export function DayLoadBars({ before, after, days = 14 }: { before?: DayLoad[]; after: DayLoad[]; days?: number }) {
  const { locale, t } = useI18n();
  const rows = after.slice(0, days);
  const max = Math.max(60, ...rows.map((l) => Math.max(l.capacity, l.task_min, before?.find((b) => b.date === l.date)?.task_min ?? 0)));
  return (
    <div className="space-y-1.5">
      {rows.map((l) => {
        const b = before?.find((x) => x.date === l.date);
        return (
          <div key={l.date} className="grid grid-cols-[92px_1fr] items-center gap-2 text-xs">
            <div className={clsx('num', l.unavailable && 'text-muted line-through')}>{weekdayName(l.weekday, locale)} {fmtDate(l.date, locale, { year: undefined })}{l.unavailable && <Lock className="ms-1 inline h-3 w-3" />}</div>
            <div className="relative h-5 rounded-md bg-line/50" title={`${t('academics.study.capacity')}: ${l.capacity} · ${t('academics.study.calendarLoad')}: ${l.calendar_min}`}>
              <span aria-hidden className="absolute inset-y-0 w-0.5 -translate-x-1/2 rounded bg-muted/60 rtl:translate-x-1/2" style={{ insetInlineStart: `${(l.capacity / max) * 100}%` }} />
              {b && b.task_min !== l.task_min && <div className={clsx('absolute inset-y-1 start-0 rounded-md opacity-40', b.over ? 'bg-danger' : 'bg-muted')} style={{ width: `${(b.task_min / max) * 100}%` }} />}
              <div className={clsx('absolute inset-y-1 start-0 rounded-md', l.over ? 'bg-danger' : 'bg-success')} style={{ width: `${Math.min(100, (l.task_min / max) * 100)}%` }} />
              <span className="num absolute inset-y-0 end-1.5 flex items-center text-xs font-semibold">{l.task_min}/{l.capacity}{l.over && ' !'}</span>
            </div>
          </div>
        );
      })}
    </div>
  );
}

export function Kbd({ children }: { children: ReactNode }) { return <kbd className="rounded border border-line bg-surface-2 px-1.5 py-0.5 font-mono text-xs">{children}</kbd>; }
