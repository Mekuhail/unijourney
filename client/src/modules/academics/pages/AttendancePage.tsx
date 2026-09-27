import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router';
import clsx from 'clsx';
import { Search, FileText, Stethoscope, Trophy, HelpCircle, ChevronDown, Clock, CheckCircle2 } from 'lucide-react';
import { useI18n } from '@/i18n';
import { api, errorMessage } from '@/lib/api';
import { useQuery } from '@/lib/useQuery';
import { refreshAll } from '@/lib/bus';
import { useToast } from '@/components/ui/toast';
import { fmtDate, weekdayName, fmtTime } from '@/lib/format';
import { PageHeader } from '@/components/ui/PageHeader';
import { AbsenceBar } from '@/components/ui/AbsenceBar';
import { Skeleton, ErrorState, Modal, Button, Input, Callout, StatusPill } from '@/components/ui';
import { AcademicsNav } from '../components';
import type { AttendanceCourse, AttendanceOverview, AttendanceSession, Excuse } from '../api';

type ExcuseType = 'medical' | 'event' | 'other';
type Filter = 'all' | 'missed' | 'excused';

const addDays = (date: string, n: number) => { const d = new Date(`${date}T00:00:00Z`); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };
const daysBetween = (a: string, b: string) => Math.round((new Date(`${b}T00:00:00Z`).getTime() - new Date(`${a}T00:00:00Z`).getTime()) / 86400000);
const IN_REVIEW = new Set(['submitting', 'submitted', 'under_review', 'approved']);

export function SessionPill({ s, onExcuse }: { s: AttendanceSession; onExcuse?: (s: AttendanceSession) => void }) {
  const { t } = useI18n();
  const clickable = (s.status === 'absent' || s.status === 'late') && !s.excuse_request_id && !!onExcuse;
  const cls = clsx('inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-semibold transition', s.status === 'present' && 'border-success/30 bg-success/10 text-success', s.status === 'absent' && 'border-danger/40 bg-danger/10 text-danger', s.status === 'late' && 'border-warn/40 bg-warn/10 text-warn', s.status === 'excused' && 'border-info/40 bg-info/10 text-info', clickable && 'cursor-pointer hover:ring-2 hover:ring-danger/40');
  const label = <>{t(`status.${s.status}`)}{s.excuse_request_id && s.status !== 'excused' && <span className="rounded-full bg-line/70 px-1 text-xs uppercase text-muted">{t(`status.${s.excuse_status ?? 'draft'}`)}</span>}</>;
  if (s.excuse_request_id) return <Link to={`/academics/excuses/${s.excuse_request_id}`} className={cls} title={t('academics.attendance.openRequest')}>{label}</Link>;
  if (clickable) return <button type="button" className={cls} onClick={() => onExcuse!(s)} title={t('academics.attendance.clickToExcuse')}>{label}</button>;
  return <span className={cls}>{label}</span>;
}

/** One missed session in the action list: what, when, the deadline, and the single next step. */
function ActionRow({ s, due, left, onExcuse }: { s: AttendanceSession; due: string; left: number; onExcuse: () => void }) {
  const { t, locale } = useI18n();
  const draft = !!s.excuse_request_id;
  return (
    <li id={`a-${s.id}`} className="flex flex-wrap items-center gap-x-4 gap-y-2 py-3">
      <div className="min-w-0 flex-1">
        <p className="text-sm"><span className="font-semibold">{s.course_code}</span> <span className="text-muted">·</span> {t(`status.${s.status}`)} <span className="text-muted">·</span> <span className="num">{weekdayName(new Date(`${s.session_date}T00:00:00Z`).getUTCDay(), locale)} {fmtDate(s.session_date, locale, { year: undefined })} · {fmtTime(s.start_time, locale)}</span></p>
        <p className={clsx('num text-sm', left <= 1 ? 'font-medium text-danger' : left <= 3 ? 'text-warn' : 'text-muted')}>
          {draft ? `${t('academics.att.draftStarted')} · ` : ''}{left === 0 ? t('academics.att.dueToday') : t('academics.att.dueIn', { date: fmtDate(due, locale, { weekday: 'short', year: undefined }), n: left })}
        </p>
      </div>
      {draft
        ? <Link to={`/academics/excuses/${s.excuse_request_id}`} className="inline-flex min-h-11 items-center rounded-xl border border-line px-3 text-sm font-semibold hover:border-brand-400">{t('academics.att.continueDraft')}</Link>
        : <Button size="sm" onClick={onExcuse} icon={<FileText className="h-4 w-4" />}>{t('academics.att.startExcuse')}</Button>}
    </li>
  );
}

function CourseHistory({ c, focus, onExcuse }: { c: AttendanceCourse; focus: string | null; onExcuse: (s: AttendanceSession) => void }) {
  const { t, l, locale } = useI18n();
  const hasFocus = !!focus && c.sessions.some((s) => s.id === focus);
  const [open, setOpen] = useState(hasFocus);
  const [filter, setFilter] = useState<Filter>(hasFocus ? 'all' : 'missed');
  useEffect(() => { if (hasFocus) { setOpen(true); setFilter('all'); } }, [hasFocus]);
  const missed = c.sessions.filter((s) => ['absent', 'late'].includes(s.status) || ['absent', 'late'].includes(s.original_status)).length;
  const list = c.sessions.slice().reverse().filter((s) => filter === 'all' || (filter === 'missed' ? ['absent', 'late'].includes(s.status) || ['absent', 'late'].includes(s.original_status) : s.status === 'excused'));
  const tone = c.level === 'denial' ? 'danger' : c.level === 'warning' ? 'warn' : 'ok';
  return (
    <li className="py-4">
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <h3 className="min-w-0"><Link to={`/academics/courses/${encodeURIComponent(c.course_code)}`} className="font-semibold hover:text-brand-600">{c.course_code}</Link> <span className="text-sm text-muted" dir="auto">{l(c.title_en, c.title_ar)}</span></h3>
        <span className={clsx('num text-sm font-semibold', tone === 'danger' ? 'text-danger' : tone === 'warn' ? 'text-warn' : 'text-success')}>{t('academics.att.percentAbsent', { n: c.absence_percent })}{tone === 'ok' ? '' : ` · ${t(`academics.att.level.${c.level}`)}`}</span>
      </div>
      <AbsenceBar label={c.course_code} percent={c.absence_percent} warn={c.warning_percent} deny={c.denial_percent} level={tone} showScale className="mt-2" />
      <p className="mt-1 text-xs text-muted">{t('academics.attendance.counts', { p: c.counts.present, a: c.counts.absent, l: c.counts.late, e: c.counts.excused, total: c.total })}</p>
      <button type="button" aria-expanded={open} aria-controls={`hist-${c.section_id}`} onClick={() => setOpen((v) => !v)} className="mt-1 inline-flex min-h-11 items-center gap-1 text-sm font-medium text-brand-600 hover:underline sm:min-h-9">
        <ChevronDown className={clsx('h-4 w-4 transition-transform', open && 'rotate-180')} aria-hidden />{open ? t('academics.att.hideSessions') : t('academics.att.showSessions', { n: c.total })}
      </button>
      {open && (
        <div id={`hist-${c.section_id}`} className="mt-1">
          <div role="group" aria-label={t('academics.att.filter')} className="mb-2 inline-flex rounded-xl bg-surface-2 p-1">
            {(['missed', 'excused', 'all'] as const).map((f) => (
              <button key={f} type="button" aria-pressed={filter === f} onClick={() => setFilter(f)} className={clsx('min-h-9 rounded-lg px-3 text-sm font-medium touch:min-h-11', filter === f ? 'bg-surface text-fg shadow-sm' : 'text-muted hover:text-fg')}>
                {t(`academics.att.filter.${f}`, { n: f === 'missed' ? missed : f === 'excused' ? c.counts.excused : c.total })}
              </button>
            ))}
          </div>
          {list.length === 0 ? <p className="py-2 text-sm text-muted">{t(filter === 'missed' ? 'academics.att.noneMissed' : 'academics.att.noneExcused')}</p> : (
            <ul aria-label={t('attendance.sessionsOf', { course: c.course_code })} className="space-y-1">
              {list.map((s) => (
                <li key={s.id} id={`s-${s.id}`} className={clsx('flex items-center justify-between gap-2 rounded-lg px-1.5 py-1.5 text-sm', focus === s.id && 'bg-brand-500/10 ring-1 ring-brand-500/40')}>
                  <span className="num text-muted">{weekdayName(new Date(`${s.session_date}T00:00:00Z`).getUTCDay(), locale)} {fmtDate(s.session_date, locale, { year: undefined })} · {fmtTime(s.start_time, locale)}</span>
                  <SessionPill s={s} onExcuse={onExcuse} />
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </li>
  );
}

export function AttendancePage() {
  const { t, locale } = useI18n();
  const nav = useNavigate();
  const toast = useToast();
  const [params] = useSearchParams();
  const focus = params.get('session');
  const q = useQuery(() => api<AttendanceOverview & { today?: string }>('/academics/attendance'), [], { refreshOn: ['academics', 'persona', 'clock'] });
  const [draftFor, setDraftFor] = useState<AttendanceSession[] | null>(null);
  const [type, setType] = useState<ExcuseType>('medical');
  const [busy, setBusy] = useState(false);
  const [text, setText] = useState('');
  const [resolved, setResolved] = useState<{ message: string; matches: AttendanceSession[]; needsChoice: boolean } | null>(null);
  const [picked, setPicked] = useState<string[]>([]);
  const [showLate, setShowLate] = useState(false);
  const all = useMemo(() => q.data?.courses.flatMap((c) => c.sessions) ?? [], [q.data]);
  useEffect(() => { if (focus && all.length) { const s = all.find((x) => x.id === focus); if (s && !s.excuse_request_id && s.status !== 'present') setDraftFor([s]); window.setTimeout(() => document.getElementById(`s-${focus}`)?.scrollIntoView({ block: 'center' }), 50); } }, [focus, all]);

  // Sort every missed session into what the student can still do about it (dates on the demo clock).
  const groups = useMemo(() => {
    const d = q.data;
    if (!d) return null;
    const today = d.today ?? new Date(Date.now() + 3 * 3600 * 1000).toISOString().slice(0, 10);
    const days = d.policy.excuseDeadlineDays.value;
    const open: Array<{ s: AttendanceSession; due: string; left: number }> = [], late: typeof open = [], review: AttendanceSession[] = [];
    for (const s of all) {
      if (s.status !== 'absent' && s.status !== 'late') continue;
      if (s.excuse_request_id && s.excuse_status && IN_REVIEW.has(s.excuse_status)) { review.push(s); continue; }
      const due = addDays(s.session_date, days);
      const left = daysBetween(today, due);
      (left < 0 ? late : open).push({ s, due, left });
    }
    open.sort((a, b) => a.left - b.left);
    return { open, late, review, days };
  }, [q.data, all]);

  const create = async () => {
    if (!draftFor?.length) return;
    setBusy(true);
    try {
      const ex = await api<Excuse>('/academics/excuses', { body: { attendanceIds: draftFor.map((s) => s.id), type } });
      refreshAll('academics');
      toast.success(t('academics.excuses.draftCreated'));
      nav(`/academics/excuses/${ex.id}`);
    } catch (e) { toast.error(t('common.error'), errorMessage(e)); } finally { setBusy(false); }
  };
  const resolve = async () => {
    if (!text.trim()) return;
    setBusy(true);
    try { const r = await api<{ message: string; matches: AttendanceSession[]; needsChoice: boolean }>('/academics/excuses/resolve', { body: { text } }); setResolved(r); setPicked(r.matches.length === 1 ? [r.matches[0].id] : []); } catch (e) { toast.error(t('common.error'), errorMessage(e)); } finally { setBusy(false); }
  };
  const header = <PageHeader crumbs={[{ to: '/academics', label: t('nav.academics') }]} title={t('academics.attendance.title')} subtitle={t('academics.att.subtitle')} actions={<Link to="/academics/excuses" className="inline-flex min-h-11 items-center text-sm font-semibold text-brand-600 hover:underline">{t('academics.att.myRequests')}</Link>} />;
  if (q.error) return <div>{header}<AcademicsNav /><ErrorState error={q.error} onRetry={q.refetch} /></div>;
  if (!q.data || !groups) return <div>{header}<AcademicsNav /><Skeleton className="h-64" /></div>;
  const d = q.data;
  const excuse = (s: AttendanceSession) => { setDraftFor([s]); setType('medical'); };

  return (
    <div>
      {header}
      <AcademicsNav />

      {/* 1. What needs doing, soonest deadline first */}
      <section aria-labelledby="att-action-h" className="mb-10">
        <h2 id="att-action-h" className="text-lg font-semibold">{groups.open.length ? t('academics.att.needsAction', { n: groups.open.length }) : t('academics.att.nothingToDo')}</h2>
        <p className="text-sm text-muted">{t('academics.att.windowNote', { days: groups.days })}</p>
        {groups.open.length > 0 && <ul className="mt-1 divide-y divide-line">{groups.open.map(({ s, due, left }) => <ActionRow key={s.id} s={s} due={due} left={left} onExcuse={() => excuse(s)} />)}</ul>}
        {groups.open.length === 0 && <p className="mt-2 flex items-center gap-2 text-sm text-success"><CheckCircle2 className="h-4 w-4" aria-hidden />{t('academics.att.allClear')}</p>}
        {groups.review.length > 0 && (
          <div className="mt-4">
            <h3 className="flex items-center gap-1.5 text-sm font-semibold"><Clock className="h-4 w-4 text-muted" aria-hidden />{t('academics.att.inReview', { n: groups.review.length })}</h3>
            <ul className="mt-1 space-y-1">{groups.review.map((s) => <li key={s.id} className="flex flex-wrap items-center justify-between gap-2 text-sm"><span><span className="font-semibold">{s.course_code}</span> <span className="num text-muted">{fmtDate(s.session_date, locale, { year: undefined })}</span></span><Link to={`/academics/excuses/${s.excuse_request_id}`} className="inline-flex min-h-11 items-center gap-2 sm:min-h-0"><StatusPill status={s.excuse_status ?? 'submitted'} /></Link></li>)}</ul>
          </div>
        )}
        {groups.late.length > 0 && (
          <div className="mt-4">
            <button type="button" aria-expanded={showLate} onClick={() => setShowLate((v) => !v)} className="inline-flex min-h-11 items-center gap-1 text-sm font-semibold text-muted hover:text-fg sm:min-h-9">
              <ChevronDown className={clsx('h-4 w-4 transition-transform', showLate && 'rotate-180')} aria-hidden />{t('academics.att.pastDeadline', { n: groups.late.length })}
            </button>
            {showLate && (
              <div className="mt-1">
                <p className="text-sm text-muted">{t('academics.att.pastDeadlineNote', { days: groups.days })}</p>
                <ul className="divide-y divide-line">{groups.late.map(({ s }) => (
                  <li key={s.id} className="flex flex-wrap items-center justify-between gap-2 py-2 text-sm">
                    <span><span className="font-semibold">{s.course_code}</span> · {t(`status.${s.status}`)} · <span className="num text-muted">{fmtDate(s.session_date, locale, { weekday: 'short', year: undefined })}</span></span>
                    {s.excuse_request_id ? <Link to={`/academics/excuses/${s.excuse_request_id}`} className="font-semibold text-brand-600 hover:underline">{t('academics.att.continueDraft')}</Link> : <Button size="sm" variant="outline" onClick={() => excuse(s)}>{t('academics.att.startAnyway')}</Button>}
                  </li>
                ))}</ul>
              </div>
            )}
          </div>
        )}
      </section>

      {/* 2. Find a session by describing it */}
      <section aria-labelledby="att-find-h" className="mb-10 max-w-3xl">
        <h2 id="att-find-h" className="flex items-center gap-2 text-lg font-semibold"><Search className="h-4 w-4 text-brand-500" aria-hidden />{t('academics.att.findTitle')}</h2>
        <p className="text-sm text-muted">{t('academics.att.findHelp')}</p>
        <form className="mt-2 flex flex-col gap-2 sm:flex-row" onSubmit={(e) => { e.preventDefault(); void resolve(); }}>
          <label htmlFor="att-find" className="sr-only">{t('academics.att.findTitle')}</label>
          <Input id="att-find" value={text} onChange={(e) => setText(e.target.value)} placeholder={t('academics.attendance.resolvePlaceholder')} />
          <Button type="submit" loading={busy} variant="secondary">{t('academics.attendance.resolve')}</Button>
        </form>
        {resolved && (
          <div className="mt-3 space-y-2" aria-live="polite">
            <p className="text-sm text-muted">{resolved.message}</p>
            {resolved.matches.length > 0 && (
              <fieldset className="space-y-1.5">
                <legend className="sr-only">{t('academics.att.pickSessions')}</legend>
                {resolved.matches.map((m) => (
                  <label key={m.id} className="flex cursor-pointer items-center gap-2 rounded-xl border border-line p-2 text-sm hover:border-brand-400">
                    <input type={resolved.needsChoice ? 'checkbox' : 'radio'} name="att-match" checked={picked.includes(m.id)} onChange={(e) => setPicked((v) => (resolved.needsChoice ? (e.target.checked ? [...new Set([...v, m.id])] : v.filter((x) => x !== m.id)) : [m.id]))} />
                    <span className="font-semibold">{m.course_code}</span><span className="num text-muted">{weekdayName(new Date(`${m.session_date}T00:00:00Z`).getUTCDay(), locale)} {fmtDate(m.session_date, locale)} · {fmtTime(m.start_time, locale)}</span><StatusPill status={m.status} />
                  </label>
                ))}
                <Button size="sm" disabled={!picked.length} onClick={() => setDraftFor(resolved.matches.filter((m) => picked.includes(m.id)))}>{t('academics.attendance.draftFor', { n: picked.length })}</Button>
              </fieldset>
            )}
          </div>
        )}
      </section>

      {/* 3. Each course: percentage against the thresholds, then its history on request */}
      <section aria-labelledby="att-courses-h">
        <h2 id="att-courses-h" className="text-lg font-semibold">{t('academics.att.byCourse')}</h2>
        <p className="text-sm text-muted">{t('academics.attendance.policyNote', { warn: d.policy.warning.value, deny: d.policy.denial.value })}. {t('academics.att.demoPolicy')}</p>
        <ul className="divide-y divide-line">{d.courses.map((c) => <CourseHistory key={c.section_id} c={c} focus={focus} onExcuse={excuse} />)}</ul>
      </section>

      <Modal open={!!draftFor} onClose={() => setDraftFor(null)} title={t('academics.attendance.newExcuse')} description={t('academics.attendance.newExcuseHint')} footer={<><Button variant="ghost" onClick={() => setDraftFor(null)}>{t('common.cancel')}</Button><Button onClick={create} loading={busy} icon={<FileText className="h-4 w-4" />}>{t('academics.attendance.createDraft')}</Button></>}>
        <ul className="mb-3 space-y-1 text-sm">{draftFor?.map((s) => <li key={s.id} className="flex items-center justify-between rounded-xl border border-line p-2"><span><span className="font-semibold">{s.course_code}</span> · {fmtDate(s.session_date, locale)} {s.start_time}–{s.end_time}</span><span className="font-mono text-xs text-muted">{s.id}</span></li>)}</ul>
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
          {([['medical', Stethoscope, t('academics.excuses.type.medical'), t('academics.excuses.type.medicalHint')], ['event', Trophy, t('academics.excuses.type.event'), t('academics.excuses.type.eventHint')], ['other', HelpCircle, t('academics.excuses.type.other'), t('academics.excuses.type.otherHint')]] as const).map(([k, Icon, label, hint]) => (
            <button key={k} type="button" onClick={() => setType(k)} className={clsx('rounded-2xl border p-3 text-start text-sm transition', type === k ? 'border-brand-500 bg-brand-500/10' : 'border-line hover:border-brand-400')} aria-pressed={type === k}><Icon className="mb-1 h-4 w-4 text-brand-600" /><div className="font-semibold">{label}</div><div className="text-xs text-muted">{hint}</div></button>
          ))}
        </div>
        <div className="mt-3"><Callout tone="info">{t('academics.excuses.noChangeNote')}</Callout></div>
      </Modal>
    </div>
  );
}
