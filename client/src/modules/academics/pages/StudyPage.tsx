import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router';
import clsx from 'clsx';
import { Lock, Unlock, Plus, Wand2, Wrench, CalendarClock, Settings2, Trash2, CheckCircle2, Clock, History, RotateCcw, Sparkles, ArrowRight } from 'lucide-react';
import { useI18n } from '@/i18n';
import { api, errorMessage } from '@/lib/api';
import { useQuery } from '@/lib/useQuery';
import { refreshAll } from '@/lib/bus';
import { useToast } from '@/components/ui/toast';
import { fmtDate, fmtDateTime, weekdayName, minutesLabel } from '@/lib/format';
import { PageHeader } from '@/components/ui/PageHeader';
import { Card, SectionTitle, Skeleton, ErrorState, EmptyState, Button, Field, Input, Textarea, Select, Modal, Progress, Badge, Callout, Toggle } from '@/components/ui';
import { AcademicsNav, DayLoadBars } from '../components';
import type { StudyState, StudyTask, StudyProposal, TaskDraft } from '../api';

function TaskRow({ t: task, onPatch, onDelete, busy }: { t: StudyTask; onPatch: (b: Record<string, unknown>) => void; onDelete: () => void; busy: boolean }) {
  const { t, locale } = useI18n();
  const [logOpen, setLogOpen] = useState(false);
  const [mins, setMins] = useState('30');
  const done = task.status === 'done';
  return (
    <li className={clsx('rounded-2xl border p-3 text-sm', done ? 'border-line bg-surface-2' : 'border-line bg-surface', task.locked && 'border-gold-500/60')}>
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-1.5">
            {task.course_code && <Badge tone="brand">{task.course_code}</Badge>}
            <span className={clsx('font-semibold', done && 'line-through')}>{task.title}</span>
            {task.locked && <Lock className="h-3.5 w-3.5 text-gold-700" aria-label="locked" />}
            {task.priority === 1 && <Badge tone="danger">{t('academics.study.high')}</Badge>}
          </div>
          <div className="mt-1 flex flex-wrap gap-x-3 gap-y-0.5 text-xs text-muted">
            <span className="inline-flex items-center gap-1"><Clock className="h-3 w-3" />{minutesLabel(task.effort_min, locale)}{task.actual_min > 0 && ` · ${t('academics.study.actual')} ${minutesLabel(task.actual_min, locale)}`}</span>
            {task.deadline && <span className="num">{t('academics.study.due')} {fmtDate(task.deadline, locale)}</span>}
            {task.scheduled_date ? <span className="num">{t('academics.study.plannedFor')} {weekdayName(new Date(`${task.scheduled_date}T00:00:00Z`).getUTCDay(), locale)} {fmtDate(task.scheduled_date, locale)}</span> : <Badge tone="danger">{t('status.unscheduled')}</Badge>}
            {task.source === 'nl' && <Badge tone="neutral">NL</Badge>}
          </div>
          {task.status === 'partial' && <Progress label={task.title} value={task.progress} className="mt-2 h-1.5 max-w-xs" tone="gold" />}
        </div>
        <div className="flex flex-wrap items-center gap-1">
          {!done && <>
            <div className="flex items-center gap-1"><Input type="number" min={5} max={600} value={mins} onChange={(e) => setMins(e.target.value)} className="!h-8 !w-16 !px-2 !py-1 text-xs touch:!h-11" aria-label={t('common.minutes')} /><Button size="sm" variant="outline" onClick={() => onPatch({ status: 'partial', add_minutes: Number(mins) || 30 })} disabled={busy}>{t('academics.study.logPartial')}</Button></div>
            <Button size="sm" variant="success" icon={<CheckCircle2 className="h-3.5 w-3.5" />} onClick={() => onPatch({ status: 'done', add_minutes: Number(mins) || undefined })} disabled={busy}>{t('status.done')}</Button>
          </>}
          {done && <Button size="sm" variant="ghost" onClick={() => onPatch({ status: 'todo' })} disabled={busy}>{t('academics.study.reopen')}</Button>}
          <Button size="icon" variant="ghost" title={task.locked ? t('academics.study.unlock') : t('academics.study.lock')} aria-label={task.locked ? t('academics.study.unlock') : t('academics.study.lock')} onClick={() => onPatch({ locked: !task.locked })} disabled={busy}>{task.locked ? <Unlock className="h-4 w-4" /> : <Lock className="h-4 w-4" />}</Button>
          <Input type="date" value={task.scheduled_date ?? ''} onChange={(e) => onPatch({ scheduled_date: e.target.value || null })} className="!h-8 !w-36 !px-2 !py-1 text-xs" aria-label={t('academics.study.plannedFor')} disabled={busy} />
          <Button size="icon" variant="ghost" title={t('academics.study.history')} aria-label={t('academics.study.history')} aria-expanded={logOpen} onClick={() => setLogOpen((v) => !v)}><History className="h-4 w-4" /></Button>
          <Button size="icon" variant="ghost" title={t('common.delete')} aria-label={t('common.delete')} onClick={onDelete} disabled={busy}><Trash2 className="h-4 w-4 text-danger" /></Button>
        </div>
      </div>
      {logOpen && <ol className="mt-2 space-y-0.5 border-t border-line pt-2 text-xs text-muted">{task.history.slice().reverse().map((h, i) => <li key={i}><span className="num">{fmtDateTime(h.at, locale)}</span> · {h.action}{'from' in h && h.from !== undefined ? ` ${String(h.from ?? '—')} → ${String(h.to ?? '—')}` : ''}{'minutes' in h ? ` +${String(h.minutes)} min` : ''}{'why' in h ? ` — ${String(h.why)}` : ''}</li>)}</ol>}
    </li>
  );
}

function ProposalModal({ p, onClose, onApply, onDiscard, busy }: { p: StudyProposal | null; onClose: () => void; onApply: () => void; onDiscard: () => void; busy: boolean }) {
  const { t, locale } = useI18n();
  return (
    <Modal open={!!p} onClose={onClose} size="lg" title={p ? (p.kind === 'repair' ? t('academics.study.repairProposal') : t('academics.study.scheduleProposal')) : ''} description={p ? t('academics.study.proposalHint') : undefined} footer={p && p.status === 'preview' ? <><Button variant="ghost" onClick={onDiscard} disabled={busy}>{t('academics.study.discard')}</Button><Button onClick={onApply} loading={busy} icon={<CheckCircle2 className="h-4 w-4" />}>{t('academics.study.apply')}</Button></> : undefined}>
      {p && (
        <div className="space-y-4">
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <div><div className="mb-1 text-xs font-semibold uppercase tracking-wide text-muted">{t('academics.study.changes')} ({p.changes.length})</div>{p.changes.length === 0 ? <div className="text-sm text-muted">{t('academics.study.noChanges')}</div> : <ul className="space-y-1.5 text-sm">{p.changes.map((c) => <li key={c.taskId} className="rounded-xl border border-line p-2"><div className="font-semibold">{c.title}</div><div className="num text-xs">{c.from ? fmtDate(c.from, locale) : t('status.unscheduled')} <ArrowRight className="inline h-3.5 w-3.5 rtl:rotate-180" aria-label={t('common.to')} /> <span className="font-semibold text-success">{c.to ? fmtDate(c.to, locale) : '—'}</span></div><div className="text-xs text-muted">{c.why}</div></li>)}</ul>}</div>
            <div><div className="mb-1 text-xs font-semibold uppercase tracking-wide text-muted">{t('academics.study.infeasible')} ({p.infeasible.length})</div>{p.infeasible.length === 0 ? <div className="text-sm text-muted">{t('academics.study.noInfeasible')}</div> : <ul className="space-y-1.5 text-sm">{p.infeasible.map((c) => <li key={c.taskId} className="rounded-xl border border-danger/30 bg-danger/5 p-2"><div className="font-semibold">{c.title}</div><div className="text-xs text-danger">{c.why}</div><div className="text-xs text-muted">{c.suggestion}</div></li>)}</ul>}</div>
          </div>
          <div><div className="mb-1 text-xs font-semibold uppercase tracking-wide text-muted">{t('academics.study.beforeAfter')}</div><DayLoadBars before={p.before_state.loads} after={p.after_state.loads} /></div>
          <div className="text-xs text-muted">{t('academics.study.lockedNote')}</div>
        </div>
      )}
    </Modal>
  );
}

export function StudyPage() {
  const { t, locale } = useI18n();
  const toast = useToast();
  const [params, setParams] = useSearchParams();
  const q = useQuery(() => api<StudyState>('/academics/study'), [], { refreshOn: ['academics', 'calendar', 'persona'] });
  const d = q.data;
  const [busy, setBusy] = useState(false);
  const [proposal, setProposal] = useState<StudyProposal | null>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [settings, setSettings] = useState({ daily: 180, friday: 60, unavailable: '' });
  const [nl, setNl] = useState('');
  const [drafts, setDrafts] = useState<TaskDraft[] | null>(null);
  const [parseNote, setParseNote] = useState<string | null>(null);
  const [quick, setQuick] = useState({ title: '', course_code: '', effort_min: '60', deadline: '', locked: false });
  const [repairReason, setRepairReason] = useState<'missed' | 'availability' | 'event' | 'manual'>('missed');
  useEffect(() => { if (d) setSettings({ daily: d.settings.daily_capacity_min, friday: d.settings.weekday_capacity['5'] ?? d.settings.daily_capacity_min, unavailable: d.settings.unavailable_dates.join(', ') }); }, [d]);
  useEffect(() => { if (d?.proposal && !proposal) setProposal(d.proposal); }, [d, proposal]);
  useEffect(() => { const setup = params.get('setup'); if (setup && !nl) setNl(setup.split(',').map((c) => `Read syllabus and set up notes for ${c.trim()}, 45 min, next week`).join('\n')); }, [params, nl]);
  const run = async <T,>(fn: () => Promise<T>, okMsg?: string): Promise<T | null> => { setBusy(true); try { const r = await fn(); if (okMsg) toast.success(okMsg); refreshAll('academics', 'calendar'); return r; } catch (e) { toast.error(t('common.error'), errorMessage(e)); return null; } finally { setBusy(false); } };
  const repair = async (reason = repairReason) => { const p = await run(() => api<StudyProposal>('/academics/study/repair', { body: { reason } })); if (p) setProposal(p); };
  useEffect(() => { if (params.get('repair') && d) { void repair('missed'); setParams({}, { replace: true }); } // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params, d]);
  const schedule = async () => { const p = await run(() => api<StudyProposal>('/academics/study/schedule', { method: 'POST' })); if (p) setProposal(p); };
  const apply = async () => { if (!proposal) return; const r = await run(() => api(`/academics/study/proposals/${proposal.id}/apply`, { method: 'POST' }), t('academics.study.applied')); if (r) setProposal(null); };
  const discard = async () => { if (!proposal) return; await run(() => api(`/academics/study/proposals/${proposal.id}/discard`, { method: 'POST' })); setProposal(null); };
  const patchTask = (id: string, body: Record<string, unknown>) => run(() => api(`/academics/study/tasks/${id}`, { method: 'PUT', body }));
  const deleteTask = (id: string) => run(() => api(`/academics/study/tasks/${id}`, { method: 'DELETE' }), t('common.delete'));
  const saveSettings = async () => { const ok = await run(() => api('/academics/study/settings', { method: 'PUT', body: { daily_capacity_min: Number(settings.daily), weekday_capacity: { '5': Number(settings.friday) }, unavailable_dates: settings.unavailable.split(/[,\s]+/).map((s) => s.trim()).filter((s) => /^\d{4}-\d{2}-\d{2}$/.test(s)) } }), t('common.save')); if (ok) setSettingsOpen(false); };
  const parse = async () => { const r = await run(() => api<{ drafts: TaskDraft[]; ai: string | null; note: string }>('/academics/study/intake/parse', { body: { text: nl } })); if (r) { setDrafts(r.drafts); setParseNote(r.ai ?? r.note); } };
  const commit = async () => { if (!drafts?.length) return; const r = await run(() => api('/academics/study/intake/commit', { body: { drafts: drafts.map((x) => ({ title: x.title, course_code: x.course_code || null, effort_min: x.effort_min, deadline: x.deadline || null, priority: x.priority, line: x.line })), raw_text: nl } }), t('academics.study.committed')); if (r) { setDrafts(null); setNl(''); } };
  const addQuick = async () => { if (!quick.title.trim()) return; const r = await run(() => api('/academics/study/tasks', { body: { title: quick.title, course_code: quick.course_code || null, effort_min: Number(quick.effort_min) || 60, deadline: quick.deadline || null, locked: quick.locked } }), t('academics.study.added')); if (r) setQuick({ title: '', course_code: '', effort_min: '60', deadline: '', locked: false }); };
  const groups = useMemo(() => {
    if (!d) return [];
    const today = d.today;
    const out: Array<{ key: string; label: string; tasks: StudyTask[]; tone?: 'danger' | 'muted' }> = [];
    const overdue = d.tasks.filter((x) => x.status !== 'done' && ((x.scheduled_date && x.scheduled_date < today) || (!x.scheduled_date && x.deadline && x.deadline < today)));
    if (overdue.length) out.push({ key: 'overdue', label: t('academics.study.missed'), tasks: overdue, tone: 'danger' });
    const unsched = d.tasks.filter((x) => x.status !== 'done' && !x.scheduled_date && !overdue.includes(x));
    if (unsched.length) out.push({ key: 'unscheduled', label: t('status.unscheduled'), tasks: unsched, tone: 'danger' });
    const days = [...new Set(d.tasks.filter((x) => x.scheduled_date && x.scheduled_date >= today && x.status !== 'done').map((x) => x.scheduled_date!))].sort();
    for (const day of days) out.push({ key: day, label: `${weekdayName(new Date(`${day}T00:00:00Z`).getUTCDay(), locale)} · ${fmtDate(day, locale)}${day === today ? ` · ${t('common.today')}` : ''}`, tasks: d.tasks.filter((x) => x.scheduled_date === day && x.status !== 'done') });
    const done = d.tasks.filter((x) => x.status === 'done');
    if (done.length) out.push({ key: 'done', label: t('status.done'), tasks: done, tone: 'muted' });
    return out;
  }, [d, t, locale]);
  if (q.error) return <div><AcademicsNav /><ErrorState error={q.error} onRetry={q.refetch} /></div>;
  if (!d) return <div><AcademicsNav /><Skeleton className="h-64" /></div>;
  const overdueCount = groups.find((g) => g.key === 'overdue')?.tasks.length ?? 0;
  return (
    <div>
      <PageHeader crumbs={[{ to: '/academics', label: t('nav.academics') }]} title={t('academics.study.title')} subtitle={t('academics.study.subtitle', { cap: d.settings.daily_capacity_min })} actions={<><Button variant="outline" size="sm" icon={<Settings2 className="h-4 w-4" />} onClick={() => setSettingsOpen(true)}>{t('academics.study.settings')}</Button><Button variant="secondary" size="sm" icon={<CalendarClock className="h-4 w-4" />} onClick={schedule} loading={busy}>{t('academics.study.schedule')}</Button><Button size="sm" icon={<Wrench className="h-4 w-4" />} onClick={() => repair()} loading={busy}>{t('academics.study.repair')}</Button></>} />
      <AcademicsNav />
      {overdueCount > 0 && <div className="mb-4"><Callout tone="warn" title={t('academics.study.missedTitle', { n: overdueCount })}>{t('academics.study.missedBody')} <Select aria-label={t('common.reason')} value={repairReason} onChange={(e) => setRepairReason(e.target.value as typeof repairReason)} className="!ms-2 !inline-block !w-auto !py-1 text-xs"><option value="missed">{t('academics.study.reason.missed')}</option><option value="availability">{t('academics.study.reason.availability')}</option><option value="event">{t('academics.study.reason.event')}</option></Select> <Button size="sm" className="ms-2" onClick={() => repair()} loading={busy}>{t('academics.study.repair')}</Button></Callout></div>}
      <div className="grid grid-cols-1 gap-5 lg:grid-cols-5">
        <div className="space-y-4 lg:col-span-3">
          {groups.length === 0 && <EmptyState title={t('academics.study.noTasks')} body={t('academics.study.noTasksBody')} />}
          {groups.map((g) => (
            <div key={g.key}>
              <div className={clsx('mb-2 flex items-center justify-between text-xs font-semibold uppercase tracking-wide', g.tone === 'danger' ? 'text-danger' : 'text-muted')}><span>{g.label}</span><span className="num">{g.tasks.reduce((s, x) => s + x.effort_min, 0)} min</span></div>
              <ul className="space-y-2">{g.tasks.map((task) => <TaskRow key={task.id} t={task} busy={busy} onPatch={(b) => void patchTask(task.id, b)} onDelete={() => void deleteTask(task.id)} />)}</ul>
            </div>
          ))}
        </div>
        <div className="space-y-4 lg:col-span-2">
          <Card>
            <SectionTitle>{t('academics.study.load')}</SectionTitle>
            <DayLoadBars after={d.loads} />
            <div className="mt-2 text-xs text-muted">{t('academics.study.loadHint')}</div>
          </Card>
          <Card>
            <SectionTitle>{t('academics.study.intake')}</SectionTitle>
            <div className="grid gap-2">
              <Input value={quick.title} onChange={(e) => setQuick({ ...quick, title: e.target.value })} placeholder={t('academics.study.quickTitle')} />
              <div className="grid grid-cols-3 gap-2">
                <Select aria-label={t('common.course')} value={quick.course_code} onChange={(e) => setQuick({ ...quick, course_code: e.target.value })}><option value="">{t('academics.study.noCourse')}</option>{d.courses.map((c) => <option key={c} value={c}>{c}</option>)}</Select>
                <Input type="number" min={5} value={quick.effort_min} onChange={(e) => setQuick({ ...quick, effort_min: e.target.value })} aria-label={t('common.minutes')} />
                <Input type="date" value={quick.deadline} onChange={(e) => setQuick({ ...quick, deadline: e.target.value })} aria-label={t('academics.study.due')} />
              </div>
              <div className="flex items-center justify-between"><Toggle checked={quick.locked} onChange={(v) => setQuick({ ...quick, locked: v })} label={t('academics.study.lock')} /><Button size="sm" icon={<Plus className="h-4 w-4" />} onClick={addQuick} loading={busy}>{t('academics.study.add')}</Button></div>
            </div>
            <div className="mt-4 border-t border-line pt-3">
              <div className="mb-1 flex items-center gap-2 text-sm font-semibold"><Sparkles className="h-4 w-4 text-brand-600" />{t('academics.study.nlTitle')}</div>
              <Textarea value={nl} onChange={(e) => setNl(e.target.value)} placeholder={'Read ch. 3 for CIS 321, 2h, by Oct 5\nSWE 302 design doc 90 min due 2026-10-03'} rows={3} />
              <div className="mt-2 flex items-center gap-2"><Button size="sm" variant="secondary" icon={<Wand2 className="h-4 w-4" />} onClick={parse} loading={busy} disabled={!nl.trim()}>{t('academics.study.parse')}</Button><span className="text-xs text-muted">{t('academics.study.parseHint')}</span></div>
              {drafts && (
                <div className="mt-3 space-y-2">
                  {parseNote && <div className="text-xs text-muted">{parseNote}</div>}
                  {drafts.map((x, i) => (
                    <div key={i} className="rounded-xl border border-line p-2 text-xs">
                      <div className="grid grid-cols-1 gap-1.5 sm:grid-cols-[1fr_90px_80px_120px]">
                        <Input value={x.title} onChange={(e) => setDrafts(drafts.map((y, k) => k === i ? { ...y, title: e.target.value } : y))} className="!py-1.5" />
                        <Select aria-label={t('common.course')} value={x.course_code ?? ''} onChange={(e) => setDrafts(drafts.map((y, k) => k === i ? { ...y, course_code: e.target.value || null } : y))} className="!py-1.5"><option value="">—</option>{d.courses.map((c) => <option key={c} value={c}>{c}</option>)}</Select>
                        <Input type="number" value={x.effort_min} onChange={(e) => setDrafts(drafts.map((y, k) => k === i ? { ...y, effort_min: Number(e.target.value) } : y))} className="!py-1.5" />
                        <Input type="date" value={x.deadline ?? ''} onChange={(e) => setDrafts(drafts.map((y, k) => k === i ? { ...y, deadline: e.target.value || null } : y))} className="!py-1.5" />
                      </div>
                      <div className="mt-1 flex flex-wrap items-center gap-2"><Badge tone={x.confidence >= 0.8 ? 'success' : x.confidence >= 0.5 ? 'warn' : 'danger'}>{Math.round(x.confidence * 100)}%</Badge>{x.issues.map((iss, k) => <span key={k} className="text-warn">{iss}</span>)}<button type="button" className="ms-auto text-muted hover:text-danger" onClick={() => setDrafts(drafts.filter((_, k) => k !== i))}>{t('common.remove')}</button></div>
                    </div>
                  ))}
                  <div className="flex gap-2"><Button size="sm" onClick={commit} loading={busy} disabled={!drafts.length}>{t('academics.study.commit', { n: drafts.length })}</Button><Button size="sm" variant="ghost" onClick={() => setDrafts(null)}>{t('common.cancel')}</Button></div>
                </div>
              )}
            </div>
          </Card>
          <Card>
            <SectionTitle>{t('academics.study.versions')}</SectionTitle>
            <ul className="space-y-1.5 text-sm">{d.versions.map((v) => <li key={v.id} className="flex items-center justify-between gap-2"><span><span className="font-semibold">{v.label}</span><div className="text-xs text-muted">{fmtDateTime(v.created_at, locale)} · {v.reason}</div></span><Button size="sm" variant="outline" icon={<RotateCcw className="h-3.5 w-3.5" />} onClick={() => run(() => api(`/academics/study/versions/${v.id}/restore`, { method: 'POST' }), t('academics.study.restored'))} disabled={busy}>{t('academics.study.restore')}</Button></li>)}</ul>
            <div className="mt-2 text-xs text-muted">{t('academics.study.restoreNote')}</div>
            {d.history.length > 0 && <div className="mt-3 border-t border-line pt-2 text-xs text-muted">{t('academics.study.proposalHistory')}: {d.history.map((h) => `${h.kind} (${h.status}, ${h.changes} ${t('academics.study.changes').toLowerCase()})`).join(' · ')}</div>}
          </Card>
        </div>
      </div>
      <ProposalModal p={proposal} onClose={() => setProposal(null)} onApply={apply} onDiscard={discard} busy={busy} />
      <Modal open={settingsOpen} onClose={() => setSettingsOpen(false)} title={t('academics.study.settings')} footer={<><Button variant="ghost" onClick={() => setSettingsOpen(false)}>{t('common.cancel')}</Button><Button onClick={saveSettings} loading={busy}>{t('common.save')}</Button></>}>
        <div className="grid gap-3">
          <Field label={t('academics.study.dailyCapacity')} hint={t('academics.study.dailyCapacityHint')}><Input type="number" min={0} max={720} value={settings.daily} onChange={(e) => setSettings({ ...settings, daily: Number(e.target.value) })} /></Field>
          <Field label={t('academics.study.fridayCapacity')}><Input type="number" min={0} max={720} value={settings.friday} onChange={(e) => setSettings({ ...settings, friday: Number(e.target.value) })} /></Field>
          <Field label={t('academics.study.unavailable')} hint={t('academics.study.unavailableHint')}><Input value={settings.unavailable} onChange={(e) => setSettings({ ...settings, unavailable: e.target.value })} placeholder="2026-10-01, 2026-10-08" /></Field>
        </div>
      </Modal>
    </div>
  );
}
