import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router';
import clsx from 'clsx';
import { Search, FileText, Stethoscope, Trophy, HelpCircle } from 'lucide-react';
import { useI18n } from '@/i18n';
import { api, errorMessage } from '@/lib/api';
import { useQuery } from '@/lib/useQuery';
import { refreshAll } from '@/lib/bus';
import { useToast } from '@/components/ui/toast';
import { fmtDate, weekdayName, fmtTime } from '@/lib/format';
import { PageHeader } from '@/components/ui/PageHeader';
import { AbsenceBar } from '@/components/ui/AbsenceBar';
import { Card, Skeleton, ErrorState, Badge, Modal, Button, Input, Callout, StatusPill } from '@/components/ui';
import { AcademicsNav } from '../components';
import type { AttendanceOverview, AttendanceSession, Excuse } from '../api';

type ExcuseType = 'medical' | 'event' | 'other';

export function SessionPill({ s, onExcuse }: { s: AttendanceSession; onExcuse?: (s: AttendanceSession) => void }) {
  const { t } = useI18n();
  const clickable = (s.status === 'absent' || s.status === 'late') && !s.excuse_request_id && !!onExcuse;
  const cls = clsx('inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-semibold transition', s.status === 'present' && 'border-success/30 bg-success/10 text-success', s.status === 'absent' && 'border-danger/40 bg-danger/10 text-danger', s.status === 'late' && 'border-warn/40 bg-warn/10 text-warn', s.status === 'excused' && 'border-info/40 bg-info/10 text-info', clickable && 'cursor-pointer hover:ring-2 hover:ring-danger/40');
  const label = <>{t(`status.${s.status}`)}{s.excuse_request_id && s.status !== 'excused' && <span className="rounded-full bg-line/70 px-1 text-xs uppercase text-muted">{t(`status.${s.excuse_status ?? 'draft'}`)}</span>}</>;
  if (s.excuse_request_id) return <Link to={`/academics/excuses/${s.excuse_request_id}`} className={cls} title={t('academics.attendance.openRequest')}>{label}</Link>;
  if (clickable) return <button type="button" className={cls} onClick={() => onExcuse!(s)} title={t('academics.attendance.clickToExcuse')}>{label}</button>;
  return <span className={cls}>{label}</span>;
}

export function AttendancePage() {
  const { t, l, locale } = useI18n();
  const nav = useNavigate();
  const toast = useToast();
  const [params] = useSearchParams();
  const focus = params.get('session');
  const q = useQuery(() => api<AttendanceOverview>('/academics/attendance'), [], { refreshOn: ['academics', 'persona'] });
  const [draftFor, setDraftFor] = useState<AttendanceSession[] | null>(null);
  const [type, setType] = useState<ExcuseType>('medical');
  const [busy, setBusy] = useState(false);
  const [text, setText] = useState('');
  const [resolved, setResolved] = useState<{ message: string; matches: AttendanceSession[]; needsChoice: boolean } | null>(null);
  const [picked, setPicked] = useState<string[]>([]);
  const all = useMemo(() => q.data?.courses.flatMap((c) => c.sessions) ?? [], [q.data]);
  useEffect(() => { if (focus && all.length) { const s = all.find((x) => x.id === focus); if (s && !s.excuse_request_id && s.status !== 'present') setDraftFor([s]); document.getElementById(`s-${focus}`)?.scrollIntoView({ block: 'center' }); } }, [focus, all]);
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
  if (q.error) return <div><AcademicsNav /><ErrorState error={q.error} onRetry={q.refetch} /></div>;
  if (!q.data) return <div><AcademicsNav /><Skeleton className="h-64" /></div>;
  const d = q.data;
  return (
    <div>
      <PageHeader crumbs={[{ to: '/academics', label: t('nav.academics') }]} title={t('academics.attendance.title')} subtitle={t('academics.attendance.subtitle')} />
      <AcademicsNav />
      <Card className="mb-5">
        <div className="flex items-center gap-2 text-sm font-semibold"><Search className="h-4 w-4 text-brand-500" />{t('academics.attendance.resolveTitle')}</div>
        <div className="mt-2 flex flex-col gap-2 sm:flex-row">
          <Input value={text} onChange={(e) => setText(e.target.value)} placeholder={t('academics.attendance.resolvePlaceholder')} onKeyDown={(e) => { if (e.key === 'Enter') void resolve(); }} />
          <Button onClick={resolve} loading={busy} variant="secondary">{t('academics.attendance.resolve')}</Button>
        </div>
        {resolved && (
          <div className="mt-3 space-y-2">
            <div className="text-sm text-muted">{resolved.message}</div>
            {resolved.matches.length > 0 && (
              <div className="space-y-1.5">
                {resolved.matches.map((m) => (
                  <label key={m.id} className="flex cursor-pointer items-center gap-2 rounded-xl border border-line p-2 text-sm hover:border-brand-400">
                    <input type={resolved.needsChoice ? 'checkbox' : 'radio'} checked={picked.includes(m.id)} onChange={(e) => setPicked((v) => e.target.checked ? [...new Set([...v, m.id])] : v.filter((x) => x !== m.id))} />
                    <span className="font-semibold">{m.course_code}</span><span className="text-muted">{weekdayName(new Date(`${m.session_date}T00:00:00Z`).getUTCDay(), locale)} {fmtDate(m.session_date, locale)} · {fmtTime(m.start_time, locale)}–{m.end_time}</span><StatusPill status={m.status} />
                  </label>
                ))}
                <Button size="sm" disabled={!picked.length} onClick={() => setDraftFor(resolved.matches.filter((m) => picked.includes(m.id)))}>{t('academics.attendance.draftFor', { n: picked.length })}</Button>
              </div>
            )}
          </div>
        )}
      </Card>
      <div className="mb-3 text-xs text-muted">{t('academics.attendance.policyNote', { warn: d.policy.warning.value, deny: d.policy.denial.value })} · {d.policy.warning.provenance} · {t('academics.attendance.deadlineNote', { days: d.policy.excuseDeadlineDays.value })}</div>
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        {d.courses.map((c) => (
          <Card key={c.section_id} className="!p-4">
            <div className="flex items-start justify-between gap-2">
              <div><Link to={`/academics/courses/${encodeURIComponent(c.course_code)}`} className="inline-flex items-center touch:min-h-11 font-semibold hover:text-brand-600">{c.course_code}</Link><div className="text-xs text-muted">{l(c.title_en, c.title_ar)} · sec {c.section_no} · {c.instructor}</div></div>
              <Badge tone={c.level === 'denial' ? 'danger' : c.level === 'warning' ? 'warn' : 'success'}>{c.absence_percent}% {t('academics.attendance.absent')}</Badge>
            </div>
            <AbsenceBar label={c.course_code} percent={c.absence_percent} warn={c.warning_percent} deny={c.denial_percent} level={c.level === 'denial' ? 'danger' : c.level === 'warning' ? 'warn' : 'ok'} showScale className="mt-3" />
            <div className="mt-1 flex justify-between text-xs text-muted"><span>{t('academics.attendance.counts', { p: c.counts.present, a: c.counts.absent, l: c.counts.late, e: c.counts.excused, total: c.total })}</span><span>{t('academics.attendance.thresholds', { warn: c.warning_percent, deny: c.denial_percent })}</span></div>
            <ul tabIndex={0} aria-label={t('attendance.sessionsOf', { course: c.course_code })} className="mt-3 max-h-56 space-y-1 overflow-y-auto rounded-lg pe-1">
              {c.sessions.slice().reverse().map((s) => (
                <li key={s.id} id={`s-${s.id}`} className={clsx('flex items-center justify-between gap-2 rounded-lg px-1.5 py-1 text-xs', focus === s.id && 'bg-brand-500/10 ring-1 ring-brand-500/40')}>
                  <span className="num text-muted">{weekdayName(new Date(`${s.session_date}T00:00:00Z`).getUTCDay(), locale).slice(0, 3)} {fmtDate(s.session_date, locale)} · {fmtTime(s.start_time, locale)}</span>
                  <SessionPill s={s} onExcuse={(x) => { setDraftFor([x]); setType('medical'); }} />
                </li>
              ))}
            </ul>
          </Card>
        ))}
      </div>
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
