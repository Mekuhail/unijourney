import { useCallback, useEffect, useMemo, useRef, useState, type DragEvent, type MouseEvent as ReactMouseEvent, type MutableRefObject, type ReactNode } from 'react';
import { Link, useSearchParams } from 'react-router';
import clsx from 'clsx';
import { Bell, Check, ChevronLeft, ChevronRight, Flag, Mail, MapPin, Plus, SlidersHorizontal, Send, ChevronDown } from 'lucide-react';
import { useI18n } from '@/i18n';
import { api, errorMessage } from '@/lib/api';
import { useQuery } from '@/lib/useQuery';
import { refreshAll } from '@/lib/bus';
import { useToast } from '@/components/ui/toast';
import { fmtDate, fmtRelative, fmtTime, weekdayName } from '@/lib/format';
import { PageHeader } from '@/components/ui/PageHeader';
import { Button, ConfirmDialog, EmptyState, ErrorState, Field, Input, Modal, Select, Skeleton, Textarea } from '@/components/ui';
import type { CalendarEntry } from '@shared/types';
import { AcademicsNav } from '../components';

// ---------------------------------------------------------------- data (mirrors GET /academics/planner)
type Urgency = 'high' | 'medium' | 'low';
interface PlanItem {
  id: string; title: string; description: string; course_code: string | null;
  kind: 'task' | 'reminder' | 'assessment'; assessment_kind: string | null;
  date: string | null; deadline: string | null; due_at: string | null; start_at: string | null; end_at: string | null; all_day: boolean; remind_at: string | null;
  urgency: Urgency; done: boolean; source: string; location_text: string | null; location_id: string | null; cancelled: boolean;
  email: { id: string; from_name: string; subject: string; received_at: string; source: string } | null;
  overdue: boolean; editable: boolean;
}
interface CourseEmail { id: string; course_code: string; from_name: string; subject: string; received_at: string; source: string; scheduled: boolean; note: string | null }
interface PlannerData { today: string; now: string; from: string; to: string; items: PlanItem[]; busy: CalendarEntry[]; courses: string[]; emails: CourseEmail[]; demo: boolean }
interface QuickParse { title: string; date: string | null; time: string | null; end_time: string | null; course_code: string | null; kind: 'task' | 'reminder'; urgency: Urgency }
interface Draft { id?: string; title: string; kind: 'task' | 'reminder'; course_code: string; date: string; time: string; duration: string; urgency: Urgency; remind: string; description: string }

// ---------------------------------------------------------------- Riyadh time helpers (UTC+3, no DST)
const OFFSET = 3 * 3600 * 1000;
const pad = (n: number) => String(n).padStart(2, '0');
const localDate = (iso: string) => new Date(new Date(iso).getTime() + OFFSET).toISOString().slice(0, 10);
const localMin = (iso: string) => { const d = new Date(new Date(iso).getTime() + OFFSET); return d.getUTCHours() * 60 + d.getUTCMinutes(); };
const addDays = (date: string, n: number) => { const d = new Date(`${date}T00:00:00Z`); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };
const weekdayOf = (date: string) => new Date(`${date}T00:00:00Z`).getUTCDay();
const weekStart = (date: string) => addDays(date, -weekdayOf(date));
const hhmm = (min: number) => `${pad(Math.floor(min / 60))}:${pad(min % 60)}`;
const isDeadline = (i: PlanItem) => i.kind === 'assessment' && !i.end_at;
const itemStart = (i: PlanItem) => (isDeadline(i) ? null : i.start_at);
const sortKey = (i: PlanItem) => `${i.due_at ?? i.start_at ?? (i.date ? `${i.date}T23:59` : '9999')}|${{ high: 0, medium: 1, low: 2 }[i.urgency]}`;

const URGENCY_RING: Record<Urgency, string> = { high: 'border-danger', medium: 'border-gold-500', low: 'border-ink-400' };
const URGENCY_DOT: Record<Urgency, string> = { high: 'bg-danger', medium: 'bg-gold-500', low: 'bg-ink-400' };

function useLabels() {
  const { t, locale } = useI18n();
  const kindLabel = (i: PlanItem) => (i.kind === 'assessment' ? t(`planner.kind.${i.assessment_kind ?? 'assignment'}`) : i.kind === 'reminder' ? t('planner.reminder') : t('planner.task'));
  const dayLabel = (date: string) => fmtDate(date, locale, { weekday: 'short', year: undefined });
  const when = (i: PlanItem): string | null => {
    if (isDeadline(i) && i.due_at) return t('planner.due', { when: `${dayLabel(localDate(i.due_at))}, ${fmtTime(i.due_at, locale)}` });
    if (i.start_at) return `${dayLabel(localDate(i.start_at))} · ${fmtTime(i.start_at, locale)}${i.end_at && i.end_at !== i.start_at && i.kind !== 'reminder' ? `–${fmtTime(i.end_at, locale)}` : ''}`;
    if (i.date) return i.deadline && i.deadline !== i.date ? t('planner.detail.plannedDue', { day: dayLabel(i.date), due: dayLabel(i.deadline) }) : dayLabel(i.date);
    return null;
  };
  const source = (i: PlanItem) => (i.email ? (i.email.source === 'lms' ? t('planner.fromLms') : t('planner.fromEmail', { name: i.email.from_name })) : null);
  return { kindLabel, dayLabel, when, source };
}

// ---------------------------------------------------------------- small pieces
function DoneToggle({ item, onToggle }: { item: PlanItem; onToggle: () => void }) {
  const { t } = useI18n();
  return (
    <button type="button" role="checkbox" aria-checked={item.done} aria-label={t(item.done ? 'planner.markUndone' : 'planner.markDone', { title: item.title })} onClick={onToggle}
      className="group grid h-11 w-11 shrink-0 place-items-center rounded-full -m-2.5">
      <span className={clsx('grid h-5 w-5 place-items-center rounded-full border-2 transition-colors', item.done ? 'border-success bg-success text-white' : clsx(URGENCY_RING[item.urgency], 'group-hover:bg-line/60'))}>
        {item.done && <Check className="h-3 w-3" strokeWidth={3} aria-hidden />}
      </span>
    </button>
  );
}

function Segmented<T extends string>({ value, onChange, items, label, className }: { value: T; onChange: (v: T) => void; items: Array<{ value: T; label: ReactNode }>; label: string; className?: string }) {
  return (
    <div role="group" aria-label={label} className={clsx('inline-flex rounded-xl bg-surface-2 p-1', className)}>
      {items.map((it) => (
        <button key={it.value} type="button" aria-pressed={value === it.value} onClick={() => onChange(it.value)}
          className={clsx('min-h-9 rounded-lg px-3 text-sm font-medium transition-colors touch:min-h-11', value === it.value ? 'bg-surface text-fg shadow-sm' : 'text-muted hover:text-fg')}>
          {it.label}
        </button>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------- to-do list
function ItemRow({ item, onToggle, onOpen, onDragStart }: { item: PlanItem; onToggle: () => void; onOpen: () => void; onDragStart?: (e: DragEvent) => void }) {
  const { t } = useI18n();
  const { kindLabel, when, source } = useLabels();
  const w = when(item);
  return (
    <li draggable={!!onDragStart && item.editable && !item.done} onDragStart={onDragStart}
      className={clsx('group flex items-start gap-3 rounded-xl px-2 py-2.5 hover:bg-surface-2', item.editable && !item.done && 'cursor-grab active:cursor-grabbing')}>
      <DoneToggle item={item} onToggle={onToggle} />
      <button type="button" onClick={onOpen} className="min-w-0 flex-1 text-start">
        <span dir="auto" className={clsx('block font-medium leading-snug ltr:text-left rtl:text-right', item.done && 'text-muted line-through')}>{item.title}</span>
        <span className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-sm text-muted">
          {item.kind === 'assessment' && <span className="font-medium text-gold-700">{item.cancelled ? t('planner.cancelled') : kindLabel(item)}</span>}
          {item.kind === 'reminder' && <span className="inline-flex items-center gap-1"><Bell className="h-3.5 w-3.5" aria-hidden />{t('planner.reminder')}</span>}
          {item.course_code && <span className="num">{item.course_code}</span>}
          {w && <span className={clsx('num', item.overdue && 'font-medium text-danger')}>{w}</span>}
          {item.location_text && <span className="inline-flex items-center gap-1"><MapPin className="h-3.5 w-3.5" aria-hidden />{item.location_text}</span>}
          {item.email && <span className="inline-flex items-center gap-1"><Mail className="h-3.5 w-3.5" aria-hidden />{source(item)}</span>}
        </span>
      </button>
    </li>
  );
}

type Filter = 'all' | 'instructors' | 'mine';
function TodoList({ d, items, filter, setFilter, onToggle, onOpen, onDragStart, focusOverdue }: { d: PlannerData; items: PlanItem[]; filter: Filter; setFilter: (f: Filter) => void; onToggle: (i: PlanItem) => void; onOpen: (i: PlanItem) => void; onDragStart: (i: PlanItem, e: DragEvent) => void; focusOverdue: boolean }) {
  const { t } = useI18n();
  const [showDone, setShowDone] = useState(false);
  const overdueRef = useRef<HTMLDivElement>(null);
  const groups = useMemo(() => {
    const open = items.filter((i) => !i.done).sort((a, b) => sortKey(a).localeCompare(sortKey(b)));
    const tomorrow = addDays(d.today, 1), week = addDays(d.today, 7);
    const dayOf = (i: PlanItem) => (i.due_at ? localDate(i.due_at) : i.date);
    const g: Array<{ key: string; items: PlanItem[] }> = [
      { key: 'overdue', items: open.filter((i) => i.overdue) },
      { key: 'today', items: open.filter((i) => !i.overdue && dayOf(i) === d.today) },
      { key: 'tomorrow', items: open.filter((i) => !i.overdue && dayOf(i) === tomorrow) },
      { key: 'week', items: open.filter((i) => { const x = dayOf(i); return !i.overdue && !!x && x > tomorrow && x <= week; }) },
      { key: 'later', items: open.filter((i) => { const x = dayOf(i); return !i.overdue && !!x && x > week; }) },
      { key: 'someday', items: open.filter((i) => !i.overdue && !dayOf(i)) }
    ];
    return g.filter((x) => x.items.length);
  }, [items, d.today]);
  const done = items.filter((i) => i.done).sort((a, b) => sortKey(b).localeCompare(sortKey(a)));
  useEffect(() => { if (focusOverdue) overdueRef.current?.scrollIntoView({ block: 'start' }); }, [focusOverdue, groups.length]);
  return (
    <div>
      <Segmented label={t('planner.filter')} value={filter} onChange={setFilter} className="mb-4"
        items={[{ value: 'all', label: t('planner.filter.all') }, { value: 'instructors', label: t('planner.filter.instructors') }, { value: 'mine', label: t('planner.filter.mine') }]} />
      {groups.length === 0 && <EmptyState title={t('planner.empty')} body={t('planner.emptyBody')} />}
      <div className="space-y-5">
        {groups.map((g) => (
          <div key={g.key} ref={g.key === 'overdue' ? overdueRef : undefined} className="scroll-mt-24">
            <h3 className={clsx('mb-1 px-2 text-sm font-semibold', g.key === 'overdue' ? 'text-danger' : 'text-muted')}>{t(`planner.group.${g.key}`)}</h3>
            <ul>{g.items.map((i) => <ItemRow key={i.id} item={i} onToggle={() => onToggle(i)} onOpen={() => onOpen(i)} onDragStart={(e) => onDragStart(i, e)} />)}</ul>
          </div>
        ))}
        {done.length > 0 && (
          <div>
            <button type="button" aria-expanded={showDone} onClick={() => setShowDone((v) => !v)} className="flex min-h-11 items-center gap-1 px-2 text-sm font-semibold text-muted hover:text-fg sm:min-h-9">
              <ChevronDown className={clsx('h-4 w-4 transition-transform', !showDone && '-rotate-90 rtl:rotate-90')} aria-hidden />{t('planner.group.done', { n: done.length })}
            </button>
            {showDone && <ul>{done.map((i) => <ItemRow key={i.id} item={i} onToggle={() => onToggle(i)} onOpen={() => onOpen(i)} />)}</ul>}
          </div>
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------- week schedule
const HOUR_PX = 44;
const PX_PER_MIN = HOUR_PX / 60;
interface Block { key: string; start: number; end: number; kind: 'class' | 'busy' | 'exam' | 'task' | 'reminder'; item?: PlanItem; entry?: CalendarEntry; lane: number; lanes: number }

function layout(blocks: Omit<Block, 'lane' | 'lanes'>[]): Block[] {
  const sorted = [...blocks].sort((a, b) => a.start - b.start || b.end - a.end);
  const out: Block[] = [];
  let cluster: Block[] = [], clusterEnd = -1;
  const flush = () => { const n = Math.max(...cluster.map((c) => c.lane)) + 1; cluster.forEach((c) => { c.lanes = n; }); out.push(...cluster); cluster = []; };
  for (const b of sorted) {
    if (cluster.length && b.start >= clusterEnd) flush();
    const used = new Set(cluster.filter((c) => c.end > b.start).map((c) => c.lane));
    let lane = 0; while (used.has(lane)) lane++;
    cluster.push({ ...b, lane, lanes: 1 });
    clusterEnd = Math.max(clusterEnd, b.end);
  }
  if (cluster.length) flush();
  return out;
}

function WeekGrid({ d, days, items, onAdd, onOpen, onMove, dragRef }: { d: PlannerData; days: string[]; items: PlanItem[]; onAdd: (date: string, time?: string) => void; onOpen: (i: PlanItem) => void; onMove: (i: PlanItem, date: string, time: string | null) => void; dragRef: MutableRefObject<{ id: string; grab: number; dur: number } | null> }) {
  const { t, locale } = useI18n();
  const { kindLabel } = useLabels();
  const [ghost, setGhost] = useState<{ date: string; min: number | null } | null>(null);
  const byId = useMemo(() => new Map(items.map((i) => [i.id, i])), [items]);
  const inWeek = (date: string | null) => !!date && date >= days[0] && date <= days[6];

  const timed = items.filter((i) => itemStart(i) && inWeek(localDate(itemStart(i)!)));
  const busy = d.busy.filter((e) => inWeek(localDate(e.start_at)));
  const untimed = items.filter((i) => !itemStart(i) && inWeek(i.due_at ? localDate(i.due_at) : i.date));
  const starts = [...timed.map((i) => localMin(i.start_at!)), ...busy.map((e) => localMin(e.start_at))];
  const ends = [...timed.map((i) => (i.end_at ? localMin(i.end_at) : localMin(i.start_at!) + 30)), ...busy.map((e) => localMin(e.end_at) || 24 * 60)];
  const first = Math.max(6 * 60, Math.min(8 * 60, ...starts.map((m) => Math.floor(m / 60) * 60)));
  const last = Math.min(24 * 60, Math.max(20 * 60, ...ends.map((m) => Math.ceil(m / 60) * 60)));
  const height = (last - first) * PX_PER_MIN;
  const nowDay = localDate(d.now), nowMin = localMin(d.now);

  const blocksFor = (date: string) => layout([
    ...busy.filter((e) => localDate(e.start_at) === date).map((e) => ({ key: e.id, start: localMin(e.start_at), end: Math.max(localMin(e.start_at) + 20, localDate(e.end_at) === date ? localMin(e.end_at) : 24 * 60), kind: (e.kind === 'class' ? 'class' : 'busy') as Block['kind'], entry: e })),
    ...timed.filter((i) => localDate(i.start_at!) === date).map((i) => {
      const s = localMin(i.start_at!);
      const e = i.end_at && localDate(i.end_at) === date ? localMin(i.end_at) : s + 30;
      return { key: i.id, start: s, end: Math.max(s + 25, e), kind: (i.kind === 'assessment' ? 'exam' : i.kind) as Block['kind'], item: i };
    })
  ]);

  const minFromEvent = (e: DragEvent | ReactMouseEvent, el: HTMLElement, grab = 0) => {
    const y = e.clientY - el.getBoundingClientRect().top;
    const raw = first + y / PX_PER_MIN - grab;
    return Math.max(first, Math.min(last - 15, Math.round(raw / 15) * 15));
  };
  const dragOver = (date: string, timedCol: boolean) => (e: DragEvent<HTMLDivElement>) => {
    if (!dragRef.current) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    const min = timedCol ? minFromEvent(e, e.currentTarget, dragRef.current.grab) : null;
    setGhost((g) => (g && g.date === date && g.min === min ? g : { date, min }));
  };
  const drop = (date: string, timedCol: boolean) => (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    const drag = dragRef.current;
    setGhost(null);
    dragRef.current = null;
    const it = drag ? byId.get(drag.id) : null;
    if (!it) return;
    onMove(it, date, timedCol ? hhmm(minFromEvent(e, e.currentTarget, drag!.grab)) : null);
  };
  const startDrag = (i: PlanItem) => (e: DragEvent<HTMLElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const dur = i.start_at && i.end_at ? (new Date(i.end_at).getTime() - new Date(i.start_at).getTime()) / 60000 : 60;
    dragRef.current = { id: i.id, grab: Math.max(0, (e.clientY - rect.top) / PX_PER_MIN), dur };
    e.dataTransfer.setData('text/plain', i.id);
    e.dataTransfer.effectAllowed = 'move';
  };

  const cols = 'grid grid-cols-[2.75rem_repeat(7,minmax(0,1fr))]';
  return (
    <div className="overflow-x-auto rounded-2xl border border-line" onDragEnd={() => { setGhost(null); dragRef.current = null; }}>
      <div className="min-w-[36rem]">
        {/* day headers */}
        <div className={clsx(cols, 'border-b border-line bg-surface')}>
          <div className="sticky start-0 z-[3] bg-surface" />
          {days.map((day) => {
            const isToday = day === d.today;
            return (
              <button key={day} type="button" onClick={() => onAdd(day)} aria-label={`${t('planner.addThisDay')}: ${fmtDate(day, locale, { weekday: 'long', year: undefined })}`}
                className="group flex flex-col items-center gap-0.5 py-2 text-center hover:bg-surface-2">
                <span className={clsx('text-xs font-medium', isToday ? 'text-brand-600' : 'text-muted')}>{weekdayName(weekdayOf(day), locale)}</span>
                <span className={clsx('num grid h-7 min-w-7 place-items-center rounded-full px-1 text-sm font-semibold', isToday && 'bg-brand-500 text-ink-950')}>{Number(day.slice(8))}</span>
              </button>
            );
          })}
        </div>
        {/* all-day and deadlines */}
        <div className={clsx(cols, 'border-b border-line')}>
          <div className="sticky start-0 z-[3] bg-surface px-1 py-2 text-end text-xs leading-tight text-muted">{t('planner.allDay')}</div>
          {days.map((day) => (
            <div key={day} onDragOver={dragOver(day, false)} onDrop={drop(day, false)} onDragLeave={() => setGhost(null)}
              className={clsx('min-h-10 space-y-1 border-s border-line p-1', ghost?.date === day && ghost.min === null && 'bg-brand-500/10')}>
              {untimed.filter((i) => (i.due_at ? localDate(i.due_at) : i.date) === day).sort((a, b) => sortKey(a).localeCompare(sortKey(b))).map((i) => (
                <button key={i.id} type="button" onClick={() => onOpen(i)} draggable={i.editable && !i.done} onDragStart={startDrag(i)}
                  title={i.title}
                  className={clsx('flex w-full items-start gap-1 rounded-md px-1.5 py-1 text-start text-xs leading-tight', i.done && 'opacity-50 line-through',
                    i.kind === 'assessment' ? 'border border-gold-500/70 bg-gold-500/15 font-medium' : 'bg-brand-500/15')}>
                  {i.kind === 'assessment' ? <Flag className="mt-px h-3 w-3 shrink-0 text-gold-700" aria-hidden /> : <span className={clsx('mt-1 h-1.5 w-1.5 shrink-0 rounded-full', URGENCY_DOT[i.urgency])} aria-hidden />}
                  <span dir="auto" className="line-clamp-2 break-words ltr:text-left rtl:text-right">{i.course_code ? `${i.course_code} ` : ''}{i.kind === 'assessment' ? kindLabel(i) : i.title}{i.due_at && isDeadline(i) ? <span className="num block font-normal text-muted">{fmtTime(i.due_at, locale)}</span> : null}</span>
                </button>
              ))}
            </div>
          ))}
        </div>
        {/* timed grid */}
        <div className={cols}>
          <div className="sticky start-0 z-[3] bg-surface" style={{ height }}>
            {Array.from({ length: (last - first) / 60 }, (_, k) => (
              <div key={k} className="num absolute end-1.5 -translate-y-1/2 whitespace-nowrap text-xs text-muted" style={{ top: k * HOUR_PX }}>{k === 0 ? '' : fmtTime(hhmm(first + k * 60), locale).replace(':00', '')}</div>
            ))}
          </div>
          {days.map((day) => (
            <div key={day} role="presentation" data-day={day}
              onClick={(e) => { if (e.target === e.currentTarget) onAdd(day, hhmm(Math.floor(minFromEvent(e, e.currentTarget) / 30) * 30)); }}
              onDragOver={dragOver(day, true)} onDrop={drop(day, true)} onDragLeave={(e) => { if (!e.currentTarget.contains(e.relatedTarget as Node)) setGhost(null); }}
              className={clsx('relative cursor-copy border-s border-line', day === d.today && 'bg-brand-500/[0.04]')}
              style={{ height, backgroundImage: `repeating-linear-gradient(to bottom, transparent 0, transparent ${HOUR_PX - 1}px, var(--line) ${HOUR_PX - 1}px, var(--line) ${HOUR_PX}px)` }}>
              {blocksFor(day).map((b) => {
                const top = (b.start - first) * PX_PER_MIN, h = Math.max(20, (b.end - b.start) * PX_PER_MIN - 2);
                const style = { top, height: h, insetInlineStart: `calc(${(b.lane / b.lanes) * 100}% + 2px)`, width: `calc(${100 / b.lanes}% - 4px)` };
                if (b.entry) {
                  const e = b.entry;
                  const inner = (
                    <>
                      <span dir="auto" className="block truncate font-medium ltr:text-left rtl:text-right">{e.title}</span>
                      {h > 34 && <span className="num block truncate">{fmtTime(e.start_at, locale)}{e.location_text ? ` · ${e.location_text}` : ''}</span>}
                    </>
                  );
                  const cls = clsx('absolute overflow-hidden rounded-md px-1.5 py-1 text-start text-xs leading-tight text-muted', b.kind === 'class' ? 'bg-surface-2 ring-1 ring-line' : 'border border-dashed border-ink-400 bg-surface');
                  return e.link
                    ? <Link key={b.key} to={e.link} className={clsx(cls, 'hover:text-fg')} style={style} title={e.title}>{inner}</Link>
                    : <div key={b.key} className={cls} style={style} title={e.title}>{inner}</div>;
                }
                const i = b.item!;
                return (
                  <button key={b.key} type="button" onClick={() => onOpen(i)} draggable={i.editable && !i.done} onDragStart={startDrag(i)} title={i.title} style={style}
                    className={clsx('absolute overflow-hidden rounded-md px-1.5 py-1 text-start text-xs leading-tight shadow-sm', i.done && 'opacity-50',
                      b.kind === 'exam' ? 'bg-gold-500 font-semibold text-ink-950' : b.kind === 'reminder' ? 'border border-brand-500/70 bg-surface text-fg' : 'border border-brand-500/40 bg-brand-500/20 text-fg',
                      i.editable && !i.done && 'cursor-grab active:cursor-grabbing')}>
                    <span className={clsx('flex items-center gap-1 truncate', i.done && 'line-through')}>
                      {b.kind === 'reminder' && <Bell className="h-3 w-3 shrink-0" aria-hidden />}
                      <span dir="auto" className="truncate ltr:text-left rtl:text-right">{i.kind === 'assessment' ? `${i.course_code ?? ''} ${kindLabel(i)}` : i.title}</span>
                    </span>
                    {h > 34 && <span className="num block truncate font-normal">{fmtTime(i.start_at, locale)}{i.location_text ? ` · ${i.location_text}` : ''}</span>}
                  </button>
                );
              })}
              {day === nowDay && nowMin >= first && nowMin <= last && (
                <div aria-hidden className="pointer-events-none absolute inset-x-0 z-[1] h-0.5 bg-brand-500" style={{ top: (nowMin - first) * PX_PER_MIN }}>
                  <span className="absolute -top-1 -start-1 h-2.5 w-2.5 rounded-full bg-brand-500" />
                </div>
              )}
              {ghost?.date === day && ghost.min !== null && dragRef.current && (
                <div aria-hidden className="pointer-events-none absolute inset-x-1 rounded-md border-2 border-dashed border-brand-500 bg-brand-500/10 px-1.5 py-0.5 text-xs font-semibold text-brand-700 dark:text-brand-300"
                  style={{ top: (ghost.min - first) * PX_PER_MIN, height: Math.max(20, Math.min(dragRef.current.dur, 180) * PX_PER_MIN) }}>
                  <span className="num">{fmtTime(hhmm(ghost.min), locale)}</span>
                </div>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------- month view
function MonthGrid({ d, cursor, items, selected, onSelect }: { d: PlannerData; cursor: string; items: PlanItem[]; selected: string; onSelect: (date: string) => void }) {
  const { locale, t } = useI18n();
  const { kindLabel } = useLabels();
  const month = cursor.slice(0, 7);
  const start = weekStart(`${month}-01`);
  const cells = Array.from({ length: 42 }, (_, k) => addDays(start, k));
  const on = (date: string) => items.filter((i) => (i.due_at ? localDate(i.due_at) : i.date) === date).sort((a, b) => (a.kind === 'assessment' ? -1 : 0) - (b.kind === 'assessment' ? -1 : 0) || sortKey(a).localeCompare(sortKey(b)));
  const classDays = new Set(d.busy.filter((e) => e.kind === 'class').map((e) => localDate(e.start_at)));
  return (
    <div className="overflow-hidden rounded-2xl border border-line">
      <div className="grid grid-cols-7 border-b border-line bg-surface">
        {cells.slice(0, 7).map((day) => <div key={day} className="py-2 text-center text-xs font-medium text-muted">{weekdayName(weekdayOf(day), locale)}</div>)}
      </div>
      <div className="grid grid-cols-7">
        {cells.map((day, k) => {
          const list = on(day);
          const inMonth = day.slice(0, 7) === month;
          const shown = list.slice(0, 2);
          return (
            <button key={day} type="button" onClick={() => onSelect(day)} aria-pressed={selected === day}
              aria-label={`${fmtDate(day, locale, { weekday: 'long' })}${list.length ? ` · ${list.length}` : ''}`}
              className={clsx('flex min-h-16 flex-col items-stretch gap-0.5 border-line p-1 text-start sm:min-h-24', k % 7 !== 0 && 'border-s', k >= 7 && 'border-t', !inMonth && 'bg-surface-2/60 text-muted',
                selected === day ? 'bg-brand-500/10 ring-2 ring-inset ring-brand-500' : 'hover:bg-surface-2')}>
              <span className="flex items-center justify-between">
                <span className={clsx('num grid h-6 min-w-6 place-items-center rounded-full px-1 text-xs font-semibold', day === d.today && 'bg-brand-500 text-ink-950')}>{Number(day.slice(8))}</span>
                {classDays.has(day) && <span className="h-1 w-1 rounded-full bg-ink-400" title={t('planner.class')} aria-hidden />}
              </span>
              <span className="hidden space-y-0.5 sm:block">
                {shown.map((i) => (
                  <span key={i.id} dir="auto" className={clsx('block truncate rounded px-1 ltr:text-left rtl:text-right text-xs leading-snug', i.done && 'line-through opacity-60', i.kind === 'assessment' ? 'bg-gold-500/25 font-medium' : 'bg-brand-500/15')}>
                    {i.kind === 'assessment' ? `${i.course_code ?? ''} ${kindLabel(i)}` : i.title}
                  </span>
                ))}
                {list.length > 2 && <span className="block px-1 text-xs text-muted">{t('planner.moreN', { n: list.length - 2 })}</span>}
              </span>
              <span className="flex flex-wrap gap-0.5 sm:hidden" aria-hidden>
                {list.slice(0, 4).map((i) => <span key={i.id} className={clsx('h-1.5 w-1.5 rounded-full', i.kind === 'assessment' ? 'bg-gold-500' : URGENCY_DOT[i.urgency])} />)}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------- item detail
function OriginalEmail({ id, shownBody }: { id: string; shownBody: string }) {
  const { t, locale } = useI18n();
  const q = useQuery(() => api<{ from_name: string; from_email: string; subject: string; body: string; received_at: string }>(`/academics/planner/emails/${id}`), [id]);
  if (q.error) return <ErrorState error={q.error} onRetry={q.refetch} />;
  if (!q.data) return <Skeleton className="h-32" />;
  const e = q.data;
  return (
    <div className="rounded-xl border border-line bg-surface-2 p-3 text-sm">
      <dl className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-3 gap-y-1 text-muted">
        <dt>{t('planner.detail.from')}</dt><dd className="truncate text-fg">{e.from_name} <span className="text-muted">&lt;{e.from_email}&gt;</span></dd>
        <dt>{t('planner.detail.subject')}</dt><dd dir="auto" className="text-fg">{e.subject}</dd>
      </dl>
      <p className="num mt-1 text-xs text-muted">{fmtDate(e.received_at, locale, { weekday: 'short' })} · {fmtTime(e.received_at, locale)}</p>
      {e.body.trim() !== shownBody.trim() && <p dir="auto" className="mt-3 whitespace-pre-line">{e.body}</p>}
    </div>
  );
}

function ItemDetail({ item, now, onClose, onToggle, onEdit, onDelete }: { item: PlanItem; now: string; onClose: () => void; onToggle: () => void; onEdit: () => void; onDelete: () => void }) {
  const { t, locale } = useI18n();
  const { kindLabel, when } = useLabels();
  const [original, setOriginal] = useState(false);
  const w = when(item);
  const ref = item.due_at ?? item.start_at;
  return (
    <Modal open onClose={onClose} size="md" title={<span dir="auto">{item.title}</span>}
      footer={<>
        {item.editable && <Button variant="ghost" onClick={onDelete} className="me-auto text-danger">{t('planner.delete')}</Button>}
        {item.editable && <Button variant="outline" onClick={onEdit}>{t('planner.edit')}</Button>}
        <Button variant={item.done ? 'outline' : 'primary'} icon={item.done ? undefined : <Check className="h-4 w-4" />} onClick={onToggle}>{item.done ? t('planner.undo') : t('planner.done')}</Button>
      </>}>
      <div className="space-y-4">
        <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm">
          <span className={clsx('font-semibold', item.kind === 'assessment' ? 'text-gold-700' : 'text-muted')}>{item.cancelled ? t('planner.cancelled') : kindLabel(item)}</span>
          {item.course_code && <span className="num text-muted">{item.course_code}</span>}
          {item.kind !== 'assessment' && <span className="inline-flex items-center gap-1 text-muted"><span className={clsx('h-2 w-2 rounded-full', URGENCY_DOT[item.urgency])} aria-hidden />{t(`planner.urgency.${item.urgency}`)}</span>}
        </p>
        <dl className="grid grid-cols-[6rem_minmax(0,1fr)] gap-x-3 gap-y-2 text-sm">
          {w && <><dt className="text-muted">{t('planner.detail.when')}</dt><dd className="num">{w}{ref && !item.done && <span className="text-muted"> · {fmtRelative(ref, now, locale)}</span>}</dd></>}
          {item.location_text && <><dt className="text-muted">{t('planner.detail.where')}</dt><dd className="flex flex-wrap items-center gap-x-3">{item.location_text}{item.location_id && <Link to={`/campus/map?to=${item.location_id}`} className="inline-flex min-h-11 items-center gap-1 font-medium text-brand-600 hover:underline sm:min-h-0"><MapPin className="h-3.5 w-3.5" aria-hidden />{t('planner.detail.directions')}</Link>}</dd></>}
          {item.remind_at && !item.done && <><dt className="text-muted">{t('planner.form.remind')}</dt><dd className="num">{fmtDate(item.remind_at, locale, { weekday: 'short', year: undefined })} · {fmtTime(item.remind_at, locale)}</dd></>}
        </dl>
        {item.email ? (
          <div>
            <p className="text-sm text-muted">{t('planner.detail.announcement', { name: item.email.from_name })} · {t('planner.detail.received', { when: fmtRelative(item.email.received_at, now, locale) })}</p>
            <p dir="auto" className="mt-2 whitespace-pre-line rounded-xl bg-surface-2 p-3 text-sm leading-relaxed">{item.description}</p>
            <button type="button" aria-expanded={original} onClick={() => setOriginal((v) => !v)} className="mt-2 inline-flex min-h-11 items-center gap-1 text-sm font-medium text-brand-600 hover:underline sm:min-h-0">
              <Mail className="h-3.5 w-3.5" aria-hidden />{t(original ? 'planner.detail.hideOriginal' : 'planner.detail.original')}
            </button>
            {original && <div className="mt-2"><OriginalEmail id={item.email.id} shownBody={item.description} /></div>}
            <p className="mt-3 text-xs text-muted">{t('planner.detail.locked')}</p>
          </div>
        ) : item.description ? <p dir="auto" className="whitespace-pre-line text-sm">{item.description}</p> : null}
      </div>
    </Modal>
  );
}

// ---------------------------------------------------------------- add / edit form
const DURATIONS = [15, 30, 45, 60, 90, 120, 180];
function ItemForm({ initial, courses, onClose, onSave, busy }: { initial: Draft; courses: string[]; onClose: () => void; onSave: (d: Draft) => void; busy: boolean }) {
  const { t, locale } = useI18n();
  const [f, setF] = useState<Draft>(initial);
  const set = <K extends keyof Draft>(k: K, v: Draft[K]) => setF((x) => ({ ...x, [k]: v }));
  const submit = () => { if (f.title.trim()) onSave(f); };
  return (
    <Modal open onClose={onClose} size="md" title={f.id ? t('planner.form.edit') : t('planner.form.new')}
      footer={<><Button variant="ghost" onClick={onClose}>{t('common.cancel')}</Button><Button onClick={submit} loading={busy} disabled={!f.title.trim()}>{f.id ? t('planner.form.save') : t('planner.form.add')}</Button></>}>
      <form className="space-y-4" onSubmit={(e) => { e.preventDefault(); submit(); }}>
        <Field label={t('planner.form.title')} required><Input dir="auto" value={f.title} onChange={(e) => set('title', e.target.value)} maxLength={200} /></Field>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div className="text-sm">
            <span className="mb-1.5 block font-medium">{t('planner.form.type')}</span>
            <Segmented label={t('planner.form.type')} value={f.kind} onChange={(v) => set('kind', v)} items={[{ value: 'task', label: t('planner.task') }, { value: 'reminder', label: t('planner.reminder') }]} />
          </div>
          <Field label={t('planner.form.course')}>
            <Select value={f.course_code} onChange={(e) => set('course_code', e.target.value)}>
              <option value="">{t('planner.form.noCourse')}</option>
              {courses.map((c) => <option key={c} value={c}>{c}</option>)}
            </Select>
          </Field>
          <Field label={t('planner.form.date')}><Input type="date" value={f.date} onChange={(e) => set('date', e.target.value)} /></Field>
          <Field label={t('planner.form.time')}><Input type="time" value={f.time} onChange={(e) => set('time', e.target.value)} step={300} /></Field>
          {f.time && f.kind === 'task' && (
            <Field label={t('planner.form.duration')}>
              <Select value={f.duration} onChange={(e) => set('duration', e.target.value)}>
                {DURATIONS.map((m) => <option key={m} value={m}>{m < 60 ? `${m} min` : `${m / 60} h`.replace('.5 h', '½ h')}</option>)}
              </Select>
            </Field>
          )}
          {f.time && (
            <Field label={t('planner.form.remind')}>
              <Select value={f.remind} onChange={(e) => set('remind', e.target.value)}>
                {['none', 'at', '15m', '1h', '1d'].map((r) => <option key={r} value={r}>{t(`planner.form.remind.${r}`)}</option>)}
              </Select>
            </Field>
          )}
        </div>
        <fieldset>
          <legend className="mb-1.5 text-sm font-medium">{t('planner.urgency')}</legend>
          <div className="flex flex-wrap gap-2">
            {(['high', 'medium', 'low'] as const).map((u) => (
              <label key={u} className={clsx('inline-flex min-h-11 cursor-pointer items-center gap-2 rounded-xl border px-3 text-sm sm:min-h-9', f.urgency === u ? 'border-fg bg-surface-2 font-medium' : 'border-line text-muted hover:text-fg')}>
                <input type="radio" name="urgency" value={u} checked={f.urgency === u} onChange={() => set('urgency', u)} className="sr-only" />
                <span className={clsx('h-2.5 w-2.5 rounded-full', URGENCY_DOT[u])} aria-hidden />{t(`planner.urgency.${u}`)}
              </label>
            ))}
          </div>
        </fieldset>
        <Field label={t('planner.form.notes')}><Textarea dir="auto" rows={3} value={f.description} onChange={(e) => set('description', e.target.value)} maxLength={1000} /></Field>
        {f.date && <p className="num text-xs text-muted">{fmtDate(f.date, locale, { weekday: 'long' })}{f.time ? ` · ${fmtTime(f.time, locale)}` : ''}</p>}
        <button type="submit" hidden />
      </form>
    </Modal>
  );
}

// ---------------------------------------------------------------- instructor emails + demo sender
function InstructorInbox({ d, onOpenItem, onSimulate }: { d: PlannerData; onOpenItem: (emailId: string) => boolean; onSimulate: () => void }) {
  const { t, locale } = useI18n();
  return (
    <section aria-labelledby="inbox-h" className="mt-10">
      <h2 id="inbox-h" className="text-base font-semibold">{t('planner.inbox.title')}</h2>
      <p className="mt-0.5 text-sm text-muted">{t('planner.inbox.body')}</p>
      {d.emails.length === 0 ? <p className="mt-3 text-sm text-muted">{t('planner.inbox.empty')}</p> : (
        <ul className="mt-2">
          {d.emails.slice(0, 6).map((e) => (
            <li key={e.id}>
              <button type="button" onClick={() => onOpenItem(e.id)} disabled={!e.scheduled}
                className="flex w-full items-start gap-3 rounded-xl px-2 py-2 text-start enabled:hover:bg-surface-2 disabled:cursor-default">
                <Mail className="mt-0.5 h-4 w-4 shrink-0 text-muted" aria-hidden />
                <span className="min-w-0 flex-1">
                  <span dir="auto" className="block truncate text-sm font-medium ltr:text-left rtl:text-right">{e.subject}</span>
                  <span className="block truncate text-xs text-muted"><span className="num">{e.course_code}</span> · {e.from_name} · {fmtRelative(e.received_at, d.now, locale)}</span>
                </span>
                <span className={clsx('shrink-0 text-xs font-medium', e.scheduled ? 'text-success' : 'text-muted')}>
                  {e.scheduled ? <span className="inline-flex items-center gap-1"><Check className="h-3.5 w-3.5" aria-hidden />{t('planner.inbox.added')}</span> : t('planner.inbox.skipped')}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
      {d.demo && d.courses.length > 0 && <Button variant="ghost" size="sm" className="mt-2" icon={<Send className="h-4 w-4" />} onClick={onSimulate}>{t('planner.inbox.simulate')}</Button>}
    </section>
  );
}

function SimulateEmail({ courses, onClose, onSent }: { courses: string[]; onClose: () => void; onSent: (n: number, scheduled: boolean) => void }) {
  const { t } = useI18n();
  const toast = useToast();
  const [f, setF] = useState({ course_code: courses[0] ?? '', subject: t('planner.sim.templateSubject'), body: t('planner.sim.templateBody') });
  const [busy, setBusy] = useState(false);
  const send = async () => {
    setBusy(true);
    try {
      const r = await api<{ scheduled: boolean; recipients: number }>('/academics/planner/demo/email', { body: f });
      onSent(r.recipients, r.scheduled);
    } catch (e) { toast.error(t('common.error'), errorMessage(e)); } finally { setBusy(false); }
  };
  return (
    <Modal open onClose={onClose} size="md" title={t('planner.sim.title')} description={t('planner.sim.body')}
      footer={<><Button variant="ghost" onClick={onClose}>{t('common.cancel')}</Button><Button onClick={send} loading={busy} icon={<Send className="h-4 w-4" />}>{t('planner.sim.send')}</Button></>}>
      <div className="space-y-4">
        <Field label={t('planner.sim.course')}><Select value={f.course_code} onChange={(e) => setF({ ...f, course_code: e.target.value })}>{courses.map((c) => <option key={c} value={c}>{c}</option>)}</Select></Field>
        <Field label={t('planner.sim.subject')}><Input dir="auto" value={f.subject} onChange={(e) => setF({ ...f, subject: e.target.value })} /></Field>
        <Field label={t('planner.sim.message')}><Textarea dir="auto" rows={7} value={f.body} onChange={(e) => setF({ ...f, body: e.target.value })} /></Field>
      </div>
    </Modal>
  );
}

// ---------------------------------------------------------------- quick add
function QuickAdd({ onAdded, onMore }: { onAdded: (i: PlanItem) => void; onMore: (p: QuickParse | null, text: string) => void }) {
  const { t, locale } = useI18n();
  const toast = useToast();
  const [text, setText] = useState('');
  const [preview, setPreview] = useState<QuickParse | null>(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (text.trim().length < 3) { setPreview(null); return; }
    const ctl = new AbortController();
    const h = window.setTimeout(() => { api<QuickParse>('/academics/planner/quick', { body: { text, dry_run: true }, signal: ctl.signal }).then(setPreview).catch(() => undefined); }, 250);
    return () => { window.clearTimeout(h); ctl.abort(); };
  }, [text]);
  const add = async () => {
    if (text.trim().length < 2) return;
    setBusy(true);
    try {
      const it = await api<PlanItem>('/academics/planner/quick', { body: { text } });
      setText(''); setPreview(null);
      onAdded(it);
    } catch (e) { toast.error(t('common.error'), errorMessage(e)); } finally { setBusy(false); }
  };
  const bits = preview ? [preview.kind === 'reminder' ? t('planner.reminder') : t('planner.task'), preview.course_code, preview.date ? fmtDate(preview.date, locale, { weekday: 'short', year: undefined }) : t('planner.quick.noDate'), preview.time ? fmtTime(preview.time, locale) : null].filter(Boolean) : [];
  return (
    <form className="mb-8" onSubmit={(e) => { e.preventDefault(); void add(); }}>
      <label htmlFor="quick-add" className="sr-only">{t('planner.quick.label')}</label>
      <div className="flex items-center gap-2 rounded-2xl border border-line bg-surface p-1.5 ps-3 shadow-sm focus-within:border-brand-500 focus-within:ring-2 focus-within:ring-brand-500/30">
        <Plus className="h-5 w-5 shrink-0 text-brand-600" aria-hidden />
        <input id="quick-add" dir="auto" value={text} onChange={(e) => setText(e.target.value)} placeholder={t('planner.quick.placeholder')} autoComplete="off" aria-describedby="quick-hint"
          className="min-h-11 min-w-0 flex-1 bg-transparent text-base outline-none placeholder:text-muted" />
        <span className="hidden sm:contents"><Button type="button" variant="ghost" size="sm" icon={<SlidersHorizontal className="h-4 w-4" />} onClick={() => onMore(preview, text)}>{t('planner.quick.more')}</Button></span>
        <span className="contents sm:hidden"><Button type="button" variant="ghost" size="icon" aria-label={t('planner.quick.more')} onClick={() => onMore(preview, text)}><SlidersHorizontal className="h-4 w-4" /></Button></span>
        <Button type="submit" size="sm" loading={busy} disabled={text.trim().length < 2}>{t('planner.quick.add')}</Button>
      </div>
      <p id="quick-hint" className="mt-1.5 min-h-5 px-3 text-sm text-muted" aria-live="polite">
        {preview && text.trim() ? <><span className="font-medium text-fg">{t('planner.quick.willAdd')}:</span> <span dir="auto">{preview.title}</span> · <span className="num">{bits.join(' · ')}</span></> : t('planner.quick.hint')}
      </p>
    </form>
  );
}

// ---------------------------------------------------------------- page
export function PlannerPage() {
  const { t, locale } = useI18n();
  const toast = useToast();
  const [params, setParams] = useSearchParams();
  const [cursor, setCursor] = useState<string | null>(null);
  const [calView, setCalView] = useState<'week' | 'month'>('week');
  const [mobileView, setMobileView] = useState<'list' | 'week' | 'month'>('list');
  const [filter, setFilter] = useState<Filter>('all');
  const [openId, setOpenId] = useState<string | null>(null);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<PlanItem | null>(null);
  const [simulate, setSimulate] = useState(false);
  const [selectedDay, setSelectedDay] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [focusOverdue, setFocusOverdue] = useState(false);
  const dragRef = useRef<{ id: string; grab: number; dur: number } | null>(null);

  // The visible window decides which classes and events are loaded for the schedule.
  const base = cursor ?? '';
  const range = useMemo(() => {
    if (!base) return null;
    if (calView === 'week') return { from: weekStart(base), to: addDays(weekStart(base), 6) };
    const s = weekStart(`${base.slice(0, 7)}-01`);
    return { from: s, to: addDays(s, 41) };
  }, [base, calView]);
  const q = useQuery(() => api<PlannerData>('/academics/planner', { query: range ?? {} }), [range?.from, range?.to], { refreshOn: ['academics', 'calendar', 'persona', 'clock'] });
  const d = q.data;
  useEffect(() => { if (d && !cursor) { setCursor(d.today); setSelectedDay(d.today); } }, [d, cursor]);

  // Deep links: ?item= opens a to-do (from notifications); ?repair=missed focuses what is overdue (from Today).
  useEffect(() => {
    if (!d) return;
    const item = params.get('item');
    if (item && d.items.some((i) => i.id === item)) setOpenId(item);
    if (params.get('repair')) { setFilter('all'); setMobileView('list'); setFocusOverdue(true); }
    if (item || params.get('repair') || params.get('setup')) setParams({}, { replace: true });
  }, [d, params, setParams]);

  const items = useMemo(() => (d?.items ?? []).filter((i) => filter === 'all' || (filter === 'instructors' ? i.kind === 'assessment' : i.kind !== 'assessment')), [d, filter]);
  const open = d?.items.find((i) => i.id === openId) ?? null;

  const patchLocal = useCallback((it: PlanItem) => q.setData((prev) => (prev ? { ...prev, items: prev.items.map((x) => (x.id === it.id ? it : x)) } : prev)), [q]);
  const run = async <T,>(fn: () => Promise<T>): Promise<T | null> => {
    setBusy(true);
    try { const r = await fn(); refreshAll('calendar'); void q.refetch(); return r; } catch (e) { toast.error(t('common.error'), errorMessage(e)); void q.refetch(); return null; } finally { setBusy(false); }
  };
  const toggle = (i: PlanItem) => {
    patchLocal({ ...i, done: !i.done, overdue: i.done ? i.overdue : false });
    void run(() => api<PlanItem>(`/academics/planner/items/${i.id}`, { method: 'PATCH', body: { done: !i.done } }));
  };
  const whenText = (date: string, time: string | null) => `${fmtDate(date, locale, { weekday: 'short', year: undefined })}${time ? ` · ${fmtTime(time, locale)}` : ''}`;
  const move = (i: PlanItem, date: string, time: string | null) => {
    if (!i.editable) return;
    const cur = i.start_at ? { date: localDate(i.start_at), time: hhmm(localMin(i.start_at)) } : { date: i.date, time: null };
    if (cur.date === date && cur.time === time) return;
    void run(() => api<PlanItem>(`/academics/planner/items/${i.id}`, { method: 'PATCH', body: { date, time } })).then((r) => { if (r) toast.success(t('planner.moved', { when: whenText(date, time) })); });
  };
  const listDragStart = (i: PlanItem, e: DragEvent) => {
    const dur = i.start_at && i.end_at ? (new Date(i.end_at).getTime() - new Date(i.start_at).getTime()) / 60000 : 60;
    dragRef.current = { id: i.id, grab: 0, dur };
    e.dataTransfer.setData('text/plain', i.id);
    e.dataTransfer.effectAllowed = 'move';
  };
  const blank = (date = '', time = ''): Draft => ({ title: '', kind: 'task', course_code: '', date, time, duration: '60', urgency: 'medium', remind: time ? '15m' : 'none', description: '' });
  const edit = (i: PlanItem) => {
    const dur = i.start_at && i.end_at ? Math.round((new Date(i.end_at).getTime() - new Date(i.start_at).getTime()) / 60000) : 60;
    const lead = i.remind_at && i.start_at ? Math.round((new Date(i.start_at).getTime() - new Date(i.remind_at).getTime()) / 60000) : null;
    setOpenId(null);
    setDraft({ id: i.id, title: i.title, kind: i.kind === 'reminder' ? 'reminder' : 'task', course_code: i.course_code ?? '', date: i.start_at ? localDate(i.start_at) : i.date ?? '', time: i.start_at ? hhmm(localMin(i.start_at)) : '', duration: String(DURATIONS.includes(dur) ? dur : 60), urgency: i.urgency, remind: lead === null ? 'none' : lead === 0 ? 'at' : lead <= 15 ? '15m' : lead <= 60 ? '1h' : '1d', description: i.description });
  };
  const save = async (f: Draft) => {
    const body = { title: f.title.trim(), kind: f.kind, course_code: f.course_code || null, date: f.date || null, time: f.date && f.time ? f.time : null, duration_min: f.kind === 'task' ? Number(f.duration) : 15, urgency: f.urgency, remind: f.time ? f.remind : 'none', description: f.description };
    const r = await run(() => api<PlanItem>(f.id ? `/academics/planner/items/${f.id}` : '/academics/planner/items', { method: f.id ? 'PATCH' : 'POST', body }));
    if (r) { setDraft(null); toast.success(f.id ? t('planner.saved') : r.date ? t('planner.addedFor', { when: whenText(r.date, r.start_at ? hhmm(localMin(r.start_at)) : null) }) : t('planner.added')); }
  };
  const remove = async (i: PlanItem) => {
    const r = await run(() => api(`/academics/planner/items/${i.id}`, { method: 'DELETE' }));
    if (r) { setConfirmDelete(null); setOpenId(null); toast.success(t('planner.deleted')); }
  };
  const openFromEmail = (emailId: string) => { const it = d?.items.find((i) => i.email?.id === emailId); if (it) setOpenId(it.id); return !!it; };

  const header = <PageHeader crumbs={[{ to: '/academics', label: t('nav.academics') }]} title={t('planner.title')} subtitle={t('planner.subtitle')} />;
  if (q.error && !d) return <div className="mx-auto max-w-6xl">{header}<AcademicsNav /><ErrorState error={q.error} onRetry={q.refetch} /></div>;
  if (!d || !cursor) return <div className="mx-auto max-w-6xl">{header}<AcademicsNav /><Skeleton className="mb-8 h-14" /><div className="grid gap-8 xl:grid-cols-[minmax(0,1fr)_minmax(0,1.9fr)]"><Skeleton className="h-96" /><Skeleton className="h-96" /></div></div>;

  const days = Array.from({ length: 7 }, (_, k) => addDays(weekStart(cursor), k));
  const shift = (dir: 1 | -1) => {
    if (calView === 'week') setCursor(addDays(cursor, 7 * dir));
    else { const [y, m] = cursor.split('-').map(Number); const nm = new Date(Date.UTC(y, m - 1 + dir, 1)); setCursor(nm.toISOString().slice(0, 10)); }
  };
  const rangeLabel = calView === 'week'
    ? `${fmtDate(days[0], locale, { year: undefined })} – ${fmtDate(days[6], locale)}`
    : fmtDate(`${cursor.slice(0, 7)}-01`, locale, { day: undefined, month: 'long' });
  const isCurrent = calView === 'week' ? weekStart(cursor) === weekStart(d.today) : cursor.slice(0, 7) === d.today.slice(0, 7);
  const setView = (v: 'list' | 'week' | 'month') => { setMobileView(v); if (v !== 'list') setCalView(v); };
  const dayItems = selectedDay ? items.filter((i) => (i.due_at ? localDate(i.due_at) : i.date) === selectedDay) : [];

  return (
    <div className="mx-auto max-w-6xl">
      {header}
      <AcademicsNav />
      <QuickAdd
        onAdded={(it) => { void q.refetch(); refreshAll('calendar'); toast.success(it.date ? t('planner.addedFor', { when: whenText(it.date, it.start_at ? hhmm(localMin(it.start_at)) : null) }) : t('planner.added')); }}
        onMore={(p, text) => setDraft({ ...blank(p?.date ?? '', p?.time ?? ''), title: p?.title ?? text, kind: p?.kind ?? 'task', course_code: p?.course_code ?? '', urgency: p?.urgency ?? 'medium' })} />

      <Segmented label={t('planner.views')} value={mobileView} onChange={setView} className="mb-5 xl:hidden"
        items={[{ value: 'list', label: t('planner.view.list') }, { value: 'week', label: t('planner.view.week') }, { value: 'month', label: t('planner.view.month') }]} />

      <div className="grid grid-cols-1 gap-x-10 gap-y-8 xl:grid-cols-[minmax(0,1fr)_minmax(0,1.9fr)]">
        <section aria-labelledby="todo-h" className={clsx(mobileView !== 'list' && 'hidden xl:block')}>
          <h2 id="todo-h" className="sr-only">{t('planner.view.list')}</h2>
          <TodoList d={d} items={items} filter={filter} setFilter={setFilter} onToggle={toggle} onOpen={(i) => setOpenId(i.id)} onDragStart={listDragStart} focusOverdue={focusOverdue} />
          <InstructorInbox d={d} onOpenItem={openFromEmail} onSimulate={() => setSimulate(true)} />
        </section>

        <section aria-labelledby="sched-h" className={clsx(mobileView === 'list' && 'hidden xl:block')}>
          <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-1">
              <Button variant="ghost" size="icon" aria-label={t('planner.prev')} onClick={() => shift(-1)}><ChevronLeft className="h-4 w-4 rtl:rotate-180" /></Button>
              <Button variant="ghost" size="icon" aria-label={t('planner.next')} onClick={() => shift(1)}><ChevronRight className="h-4 w-4 rtl:rotate-180" /></Button>
              <h2 id="sched-h" className="num ms-1 text-base font-semibold">{rangeLabel}</h2>
              {!isCurrent && <Button variant="ghost" size="sm" onClick={() => setCursor(d.today)}>{calView === 'week' ? t('planner.thisWeek') : t('planner.thisMonth')}</Button>}
            </div>
            <div className="hidden xl:block">
              <Segmented label={t('planner.views')} value={calView} onChange={(v) => setView(v)}
                items={[{ value: 'week', label: t('planner.view.week') }, { value: 'month', label: t('planner.view.month') }]} />
            </div>
          </div>
          {q.loading && !d ? <Skeleton className="h-96" /> : calView === 'week' ? (
            <>
              <WeekGrid d={d} days={days} items={items} dragRef={dragRef} onAdd={(date, time) => setDraft(blank(date, time ?? ''))} onOpen={(i) => setOpenId(i.id)} onMove={move} />
              <p className="mt-2 hidden text-xs text-muted sm:block">{t('planner.dragHint')}</p>
            </>
          ) : (
            <>
              <MonthGrid d={d} cursor={cursor} items={items} selected={selectedDay ?? ''} onSelect={setSelectedDay} />
              {selectedDay && (
                <div className="mt-5">
                  <div className="mb-1 flex items-center justify-between gap-3 px-2">
                    <h3 className="text-sm font-semibold">{fmtDate(selectedDay, locale, { weekday: 'long' })}</h3>
                    <Button variant="ghost" size="sm" icon={<Plus className="h-4 w-4" />} onClick={() => setDraft(blank(selectedDay))}>{t('planner.addThisDay')}</Button>
                  </div>
                  {dayItems.length === 0 ? <p className="px-2 text-sm text-muted">{t('planner.dayEmpty')}</p> : <ul>{dayItems.sort((a, b) => sortKey(a).localeCompare(sortKey(b))).map((i) => <ItemRow key={i.id} item={i} onToggle={() => toggle(i)} onOpen={() => setOpenId(i.id)} />)}</ul>}
                </div>
              )}
            </>
          )}
        </section>
      </div>

      {open && <ItemDetail item={open} now={d.now} onClose={() => setOpenId(null)} onToggle={() => toggle(open)} onEdit={() => edit(open)} onDelete={() => setConfirmDelete(open)} />}
      {draft && <ItemForm initial={draft} courses={d.courses} busy={busy} onClose={() => setDraft(null)} onSave={(f) => void save(f)} />}
      <ConfirmDialog open={!!confirmDelete} onClose={() => setConfirmDelete(null)} onConfirm={() => { if (confirmDelete) void remove(confirmDelete); }} danger title={t('planner.delete')} body={confirmDelete ? <span dir="auto">{confirmDelete.title}</span> : null} confirmLabel={t('planner.delete')} loading={busy} />
      {simulate && <SimulateEmail courses={d.courses} onClose={() => setSimulate(false)} onSent={(n, scheduled) => { setSimulate(false); toast.success(t('planner.sim.sent', { n: scheduled ? n : 0 })); void q.refetch(); refreshAll('calendar'); }} />}
    </div>
  );
}
