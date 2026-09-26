import { useEffect, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router';
import clsx from 'clsx';
import { Sparkles, Pin, PinOff, ArrowLeftRight, Trash2, Plus, RefreshCw, ShieldCheck, Send, Receipt as ReceiptIcon, ChevronDown, Info, BookOpen, ListTodo } from 'lucide-react';
import { useI18n } from '@/i18n';
import { api, errorMessage } from '@/lib/api';
import { useQuery } from '@/lib/useQuery';
import { refreshAll } from '@/lib/bus';
import { useToast } from '@/components/ui/toast';
import { useTheme } from '@/lib/theme';
import { fmtDateTime, weekdayName } from '@/lib/format';
import { PageHeader } from '@/components/ui/PageHeader';
import { Button, Card, SectionTitle, Skeleton, ErrorState, Callout, Field, Input, Textarea, Toggle, Select, StatusPill, Badge, Modal, KeyValue, CopyId, ButtonLink } from '@/components/ui';
import { AcademicsNav, ChecksList, FlowSteps, WeekGrid, meetingsToBlocks, type FlowStep } from '../components';
import { termLabel, type Proposal, type EligibleCourse, type PlanOption, type SectionView, type SubmitResult, type Preferences } from '../api';

const EXAMPLES = ['Plan next term around my remaining requirements, avoid early classes, and leave time for a weekly workshop on Tuesday at 4pm', 'No Thursday classes, max 15 credits', 'Compact week, count in-progress courses'];

function PreferencesForm({ initial, eligibility, onGenerate, busy }: { initial: Preferences; eligibility: EligibleCourse[] | null; onGenerate: (p: Preferences) => void; busy: boolean }) {
  const { t, locale } = useI18n();
  const [text, setText] = useState(initial.text ?? '');
  const [avoidEarly, setAvoidEarly] = useState(!!initial.avoidEarly);
  const [avoidDays, setAvoidDays] = useState<number[]>(initial.avoidDays ?? []);
  const [maxCredits, setMaxCredits] = useState<string>(initial.maxCredits ? String(initial.maxCredits) : '');
  const [countInProgress, setCountInProgress] = useState(!!initial.countInProgress);
  const [compact, setCompact] = useState(!!initial.compact);
  const [lightLoad, setLightLoad] = useState(!!initial.lightLoad);
  const [courses, setCourses] = useState<string[]>(initial.courses ?? []);
  const [win, setWin] = useState<{ day: number; start: string; end: string } | null>(initial.keepWindows?.[0] ?? null);
  const [open, setOpen] = useState(false);
  const submit = () => onGenerate({ text: text || undefined, avoidEarly: avoidEarly || undefined, avoidDays, maxCredits: maxCredits ? Number(maxCredits) : undefined, countInProgress: countInProgress || undefined, compact: compact || undefined, lightLoad: lightLoad || undefined, courses, keepWindows: win ? [win] : [] });
  return (
    <Card>
      <SectionTitle action={<button type="button" className="inline-flex min-h-11 items-center text-sm font-semibold text-brand-600 hover:underline" onClick={() => setOpen((v) => !v)}>{open ? t('common.less') : t('academics.register.moreOptions')}</button>}>{t('academics.register.preferences')}</SectionTitle>
      <Field label={t('academics.register.nlLabel')} hint={t('academics.register.nlHint')}>
        <Textarea value={text} onChange={(e) => setText(e.target.value)} placeholder={t('academics.register.promptPlaceholder')} rows={3} />
      </Field>
      <div className="mt-2 flex flex-wrap gap-1.5">{EXAMPLES.map((ex) => <button key={ex} type="button" onClick={() => setText(ex)} className="rounded-full border border-dashed border-line px-2.5 py-1 text-xs text-muted hover:border-brand-400 hover:text-fg">{ex.slice(0, 48)}{ex.length > 48 ? '…' : ''}</button>)}</div>
      {open && (
        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          <Toggle checked={avoidEarly} onChange={setAvoidEarly} label={t('academics.register.avoidEarly')} description={t('academics.register.avoidEarlyHint')} />
          <Toggle checked={countInProgress} onChange={setCountInProgress} label={t('academics.register.countInProgress')} description={t('academics.register.countInProgressHint')} />
          <Toggle checked={compact} onChange={setCompact} label={t('academics.register.compact')} />
          <Toggle checked={lightLoad} onChange={setLightLoad} label={t('academics.register.lightLoad')} />
          <div className="text-sm"><div className="mb-1.5 font-medium">{t('academics.register.avoidDays')}</div><div className="flex flex-wrap gap-1.5">{[0, 1, 2, 3, 4].map((d) => <button key={d} type="button" onClick={() => setAvoidDays((v) => v.includes(d) ? v.filter((x) => x !== d) : [...v, d])} className={clsx('rounded-full border px-2.5 py-1 text-xs', avoidDays.includes(d) ? 'border-brand-500 bg-brand-500 text-ink-950' : 'border-line')} aria-pressed={avoidDays.includes(d)}>{weekdayName(d, locale)}</button>)}</div></div>
          <Field label={t('academics.register.maxCredits')}><Input type="number" min={1} max={24} value={maxCredits} onChange={(e) => setMaxCredits(e.target.value)} placeholder="19" /></Field>
          <div className="text-sm sm:col-span-2">
            <div className="mb-1.5 font-medium">{t('academics.register.keepWindow')}</div>
            <div className="flex flex-wrap items-center gap-2">
              <Select value={win ? String(win.day) : ''} onChange={(e) => setWin(e.target.value === '' ? null : { day: Number(e.target.value), start: win?.start ?? '16:00', end: win?.end ?? '18:00' })} className="!w-40"><option value="">{t('common.none')}</option>{[0, 1, 2, 3, 4].map((d) => <option key={d} value={d}>{weekdayName(d, locale)}</option>)}</Select>
              <Input type="time" value={win?.start ?? '16:00'} disabled={!win} onChange={(e) => setWin((w) => w && { ...w, start: e.target.value })} className="!w-32" />
              <Input type="time" value={win?.end ?? '18:00'} disabled={!win} onChange={(e) => setWin((w) => w && { ...w, end: e.target.value })} className="!w-32" />
            </div>
          </div>
          {eligibility && (
            <div className="text-sm sm:col-span-2"><div className="mb-1.5 font-medium">{t('academics.register.mustInclude')}</div><div className="flex flex-wrap gap-1.5">{eligibility.filter((e) => e.eligible).map((e) => <button key={e.code} type="button" onClick={() => setCourses((v) => v.includes(e.code) ? v.filter((x) => x !== e.code) : [...v, e.code])} className={clsx('rounded-full border px-2.5 py-1 text-xs', courses.includes(e.code) ? 'border-brand-500 bg-brand-500 text-ink-950' : 'border-line')} aria-pressed={courses.includes(e.code)}>{e.code}</button>)}</div></div>
          )}
        </div>
      )}
      <div className="mt-4 flex flex-wrap items-center gap-3">
        <Button onClick={submit} loading={busy} icon={<Sparkles className="h-4 w-4" />}>{t('academics.register.generate')}</Button>
        <span className="text-xs text-muted">{t('academics.register.generateHint')}</span>
      </div>
    </Card>
  );
}

function OptionCard({ o, chosen, onChoose, busy }: { o: PlanOption; chosen: boolean; onChoose: () => void; busy: boolean }) {
  const { t, l } = useI18n();
  const fails = o.checks.filter((c) => c.status === 'fail').length, warns = o.checks.filter((c) => c.status === 'warn').length;
  return (
    <div className={clsx('h-full rounded-2xl border bg-surface p-4', chosen ? 'border-brand-500 ring-2 ring-brand-500/40' : 'border-line')}>
      <div className="flex items-start justify-between gap-2">
        <div className="font-semibold"><span className="text-muted">{t('academics.register.option')} {o.id} · </span>{l(o.label_en, o.label_ar)}</div>
        <div className="text-end"><div className="num text-2xl font-bold">{o.credits}</div><div className="text-xs uppercase text-muted">{t('common.credits')}</div></div>
      </div>
      <ul className="mt-3 space-y-1 text-xs">{o.courses.map((c) => <li key={c.section_id} className="flex items-center justify-between gap-2"><span className="truncate"><span className="font-semibold">{c.code}</span> <span className="text-muted">sec {c.section_no} · {c.instructor}</span></span><span className="num shrink-0 text-muted">{c.meetings.map((m) => `${weekdayName(m.day, 'en').slice(0, 2)}`).join('/')} {c.meetings[0]?.start}</span></li>)}</ul>
      <div className="mt-3"><WeekGrid compact blocks={meetingsToBlocks(o.courses.map((c) => ({ id: c.section_id, code: c.code, meetings: c.meetings, tone: c.seats_left <= 2 ? 'warn' : 'brand' })))} /></div>
      <div className="mt-3 flex flex-wrap gap-1.5">
        <Badge tone={fails ? 'danger' : 'success'}>{fails ? t('academics.register.failsN', { n: fails }) : t('academics.register.allHardPass')}</Badge>
        {warns > 0 && <Badge tone="warn">{t('academics.register.warnsN', { n: warns })}</Badge>}
        <Badge tone="neutral">{t('academics.register.daysN', { n: o.days.length })}</Badge>
      </div>
      {o.tradeoffs.length > 0 && <ul className="mt-2 list-disc space-y-0.5 ps-4 text-xs text-muted">{o.tradeoffs.map((x, i) => <li key={i}>{x}</li>)}</ul>}
      <div className="mt-3"><Button size="sm" variant={chosen ? 'secondary' : 'primary'} onClick={onChoose} disabled={chosen || busy}>{chosen ? t('academics.register.chosen') : t('academics.register.choose')}</Button></div>
    </div>
  );
}

function ReceiptPanel({ p }: { p: Proposal }) {
  const { t, locale } = useI18n();
  const { reducedMotion } = useTheme();
  const r = p.receipt!;
  const codes = r.nextSteps?.resources ?? [];
  return (
    <Card className="border-gold-500/50">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2 font-semibold"><ReceiptIcon className="h-5 w-5 text-gold-700" /><span>{t('academics.register.receiptTitle')}</span></div>
      </div>
      <div className="mt-3 grid gap-3 sm:grid-cols-2">
        <KeyValue items={[{ k: t('academics.register.portalRef'), v: <CopyId value={r.portalRef} /> }, { k: t('common.status'), v: <StatusPill status={r.status === 'committed' ? 'submitted' : r.status} /> }, { k: t('academics.register.operationId'), v: <span className="font-mono text-xs">{r.operationId}</span> }, { k: t('academics.register.committedAt'), v: fmtDateTime(r.committedAt, locale) }]} />
        <ul className="space-y-1 text-sm">{r.perSection.map((s) => { const sec = p.sections.find((x) => x.id === s.sectionId); return <li key={s.sectionId} className="flex items-center justify-between gap-2"><span>{sec ? `${sec.course_code} sec ${sec.section_no}` : s.sectionId}</span><Badge tone={s.result === 'enrolled' ? 'success' : 'danger'}>{s.result}{s.message ? ` · ${s.message}` : ''}</Badge></li>; })}</ul>
      </div>
      {codes.length > 0 && (
        <div className="mt-4 rounded-2xl border border-line bg-surface-2 p-3">
          <div className="text-sm font-semibold">{t('academics.register.nextSteps')}</div>
          <div className="mt-2 flex flex-wrap gap-2">
            {codes.map((c) => <ButtonLink key={c} to={`/campus/resources?course=${encodeURIComponent(c)}`} size="sm" variant="outline" icon={<BookOpen className="h-3.5 w-3.5" />}>{t('academics.register.notesFor', { code: c })}</ButtonLink>)}
            <ButtonLink to={`/academics/study?setup=${encodeURIComponent(codes.join(','))}`} size="sm" variant="gold" icon={<ListTodo className="h-3.5 w-3.5" />}>{t('academics.register.studySetup')}</ButtonLink>
            <ButtonLink to={`/academics/timetable?term=${p.term}`} size="sm" variant="secondary">{t('academics.register.viewTimetable')}</ButtonLink>
          </div>
        </div>
      )}
    </Card>
  );
}

export function RegisterPage() {
  const { t, l, locale } = useI18n();
  const toast = useToast();
  const [params, setParams] = useSearchParams();
  const pid = params.get('proposal');
  const [busy, setBusy] = useState(false);
  const [simulate, setSimulate] = useState<'' | 'stale_capacity' | 'timeout' | 'partial'>('');
  const [swapFor, setSwapFor] = useState<SectionView | null>(null);
  const [addOpen, setAddOpen] = useState(false);
  const [logOpen, setLogOpen] = useState(false);
  const [lastResult, setLastResult] = useState<SubmitResult | null>(null);
  const list = useQuery(() => api<Proposal[]>('/academics/proposals'), [], { refreshOn: ['academics', 'persona'] });
  const detail = useQuery(() => pid ? api<{ proposal: Proposal; eligibility: EligibleCourse[] }>(`/academics/proposals/${pid}`) : Promise.resolve(null), [pid], { refreshOn: ['academics'] });
  const p = detail.data?.proposal ?? null;
  const eligibility = detail.data?.eligibility ?? null;
  useEffect(() => { if (!pid && list.data?.length && !params.get('new')) setParams({ proposal: list.data[0].id }, { replace: true }); }, [pid, list.data, params, setParams]);
  const chosenOption = useMemo(() => p ? p.options.find((o) => o.section_ids.slice().sort().join() === p.section_ids.slice().sort().join()) ?? null : null, [p]);
  const run = async <T,>(fn: () => Promise<T>, okMsg?: string): Promise<T | null> => {
    setBusy(true);
    try { const r = await fn(); if (okMsg) toast.success(okMsg); refreshAll('academics', 'calendar'); return r; } catch (e) { toast.error(t('common.error'), errorMessage(e)); refreshAll('academics'); return null; } finally { setBusy(false); }
  };
  const generate = async (prefs: Preferences) => { const r = await run(() => api<{ proposal: Proposal }>('/academics/proposals', { body: { term: '2026-2', preferences: prefs } }), t('academics.register.generated')); if (r) setParams({ proposal: r.proposal.id }); };
  const patch = (body: Record<string, unknown>) => run(() => api(`/academics/proposals/${p!.id}`, { method: 'PUT', body }));
  const approve = () => run(() => api(`/academics/proposals/${p!.id}/approve`, { method: 'POST' }), t('academics.register.approved'));
  const submit = async (double = false) => {
    if (!p?.approval_id) return;
    const body = { approvalId: p.approval_id, simulate: simulate || undefined };
    setBusy(true);
    try {
      const calls = double ? [api<SubmitResult>(`/academics/proposals/${p.id}/submit`, { body }), api<SubmitResult>(`/academics/proposals/${p.id}/submit`, { body })] : [api<SubmitResult>(`/academics/proposals/${p.id}/submit`, { body })];
      const results = await Promise.allSettled(calls);
      const okRes = results.find((r): r is PromiseFulfilledResult<SubmitResult> => r.status === 'fulfilled');
      const err = results.find((r): r is PromiseRejectedResult => r.status === 'rejected');
      if (okRes) { setLastResult(okRes.value); toast[okRes.value.outcome === 'outcome_unknown' ? 'info' : 'success'](okRes.value.message); }
      if (err) toast.error(t('academics.register.submitFailed'), errorMessage(err.reason));
      if (double && results.every((r) => r.status === 'fulfilled')) toast.info(t('academics.register.duplicateInfo'));
    } finally { setBusy(false); refreshAll('academics', 'calendar'); }
  };
  const checkStatus = async () => { const r = await run(() => api<SubmitResult>(`/academics/proposals/${p!.id}/status`)); if (r) { setLastResult(r); toast.info(r.message); } };
  const steps: FlowStep[] = useMemo(() => {
    const st = p?.status ?? 'draft';
    const s = (k: string, state: FlowStep['state']): FlowStep => ({ key: k, label: t(`academics.register.step.${k}`), state });
    if (!p) return [s('generate', 'current'), s('review', 'todo'), s('approve', 'todo'), s('submit', 'todo'), s('receipt', 'todo')];
    if (['submitted', 'partial', 'failed'].includes(st)) return [s('generate', 'done'), s('review', 'done'), s('approve', 'done'), s('submit', 'done'), s('receipt', st === 'failed' ? 'blocked' : 'done')];
    if (st === 'outcome_unknown') return [s('generate', 'done'), s('review', 'done'), s('approve', 'done'), s('submit', 'blocked'), s('receipt', 'todo')];
    if (st === 'approved') return [s('generate', 'done'), s('review', 'done'), s('approve', 'done'), s('submit', 'current'), s('receipt', 'todo')];
    return [s('generate', 'done'), s('review', 'current'), s('approve', p.hard_fails.length ? 'blocked' : 'todo'), s('submit', 'todo'), s('receipt', 'todo')];
  }, [p, t]);
  const editable = !!p && ['needs_review', 'approved', 'draft'].includes(p.status);
  return (
    <div>
      <PageHeader crumbs={[{ to: '/academics', label: t('nav.academics') }]} title={t('academics.register.title')} subtitle={t('academics.register.subtitle', { term: termLabel('2026-2', locale) })} actions={<Button variant="outline" size="sm" onClick={() => setParams({ new: '1' })} icon={<Plus className="h-4 w-4" />}>{t('academics.register.newProposal')}</Button>} />
      <AcademicsNav />
      <div className="mb-4"><FlowSteps steps={steps} /></div>
      {(!p || params.get('new')) && <PreferencesForm initial={{}} eligibility={eligibility} onGenerate={generate} busy={busy} />}
      {detail.error ? <div className="mt-4"><ErrorState error={detail.error} onRetry={detail.refetch} /></div> : null}
      {pid && !p && !detail.error && <Skeleton className="mt-4 h-64" />}
      {p && !params.get('new') && (
        <div className="mt-4 space-y-5">
          <Card className="!p-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex flex-wrap items-center gap-2 text-sm"><StatusPill status={p.status} /><span className="text-muted">{t('academics.register.revision')} {p.revision} · {l(p.term_label.en, p.term_label.ar)} · <span className="num font-semibold text-fg">{p.credits} {t('common.credits')}</span></span>{p.approval && <Badge tone={p.approval.status === 'approved' ? 'info' : 'neutral'}>{t('academics.register.approval')}: {t(`status.${p.approval.status}`)}{p.approval.status === 'approved' ? ` · ${t('academics.register.expires')} ${fmtDateTime(p.approval.expires_at, locale)}` : ''}</Badge>}</div>
              {list.data && list.data.length > 1 && <Select value={p.id} onChange={(e) => setParams({ proposal: e.target.value })} className="!w-auto text-xs">{list.data.map((x) => <option key={x.id} value={x.id}>{x.id.slice(-6)} · {t(`status.${x.status}`)} · {x.credits} cr</option>)}</Select>}
            </div>
            {p.preferences.understood && p.preferences.understood.length > 0 && <div className="mt-2 flex flex-wrap gap-1.5">{p.preferences.understood.map((u, i) => <Badge key={i} tone="brand">{u}</Badge>)}{p.preferences.unparsed?.map((u, i) => <Badge key={`u${i}`} tone="neutral" className="line-through">{u}</Badge>)}</div>}
            {p.preferences.ai && <div className="mt-1 text-xs text-muted">{p.preferences.ai}</div>}
            {p.sections.length > 0 && (
              <ul className="mt-3 divide-y divide-line rounded-xl border border-line" aria-label={t('academics.register.whyCourses')}>
                {p.sections.map((s) => {
                  const e = eligibility?.find((x) => x.code === s.course_code);
                  const courseChecks = p.checks.filter((c) => c.status !== 'pass' && JSON.stringify(c.details ?? '').includes(s.course_code));
                  return (
                    <li key={s.id} className="flex flex-wrap items-start gap-x-3 gap-y-1 px-3 py-2 text-sm">
                      <span className="w-20 shrink-0 font-mono font-semibold">{s.course_code}</span>
                      <span className="flex shrink-0 gap-1">
                        <Badge tone={e?.required ? 'brand' : 'neutral'}>{e?.required ? t('academics.register.required') : t('academics.register.elective')}</Badge>
                        {s.seats_left <= 2 && <Badge tone={s.seats_left === 0 ? 'danger' : 'warn'}>{s.seats_left === 0 ? t('academics.register.full') : t('academics.register.fewSeats')}</Badge>}
                        {courseChecks.some((c) => c.status === 'fail') && <Badge tone="danger">{t('status.blocked')}</Badge>}
                      </span>
                      <span className="min-w-0 flex-1 text-muted">{e?.reasons?.[0] ?? l(s.title_en, s.title_ar)}</span>
                    </li>
                  );
                })}
              </ul>
            )}
            {p.rationale && <details className="mt-2 text-sm"><summary className="flex min-h-11 cursor-pointer items-center font-medium text-brand-600 sm:min-h-8">{t('academics.register.howChosen')}</summary><p className="mt-1 max-w-[70ch] text-muted">{p.rationale}</p></details>}
            {p.error && p.status === 'needs_review' && <div className="mt-2"><Callout tone="danger" title={t('academics.register.revalidationFailed')}>{p.error}</Callout></div>}
          </Card>
          {p.status === 'outcome_unknown' && (
            <Callout tone="warn" title={t('academics.register.unknownTitle')}>
              <div>{t('academics.register.unknownBody', { op: p.operation_id ?? '' })}</div>
              <div className="mt-2"><Button size="sm" onClick={checkStatus} loading={busy} icon={<RefreshCw className="h-4 w-4" />}>{t('academics.register.checkStatus')}</Button></div>
            </Callout>
          )}
          {p.receipt && <ReceiptPanel p={p} />}
          {lastResult && lastResult.outcome === 'replayed' && <Callout tone="info">{lastResult.message}</Callout>}
          {p.options.length > 0 && editable && (
            <div>
              <SectionTitle>{t('academics.register.options')}</SectionTitle>
              <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">{p.options.map((o) => <OptionCard key={o.id} o={o} chosen={chosenOption?.id === o.id} onChoose={() => void patch({ optionId: o.id })} busy={busy} />)}</div>
            </div>
          )}
          {p.options.length === 0 && editable && <Callout tone="warn" title={t('academics.register.noOptions')}>{t('academics.register.noOptionsBody')}</Callout>}
          <div className="grid grid-cols-1 gap-5 lg:grid-cols-5">
            <div className="space-y-4 lg:col-span-3">
              <Card>
                <SectionTitle action={editable ? <Button size="sm" variant="outline" icon={<Plus className="h-3.5 w-3.5" />} onClick={() => setAddOpen(true)}>{t('academics.register.addCourse')}</Button> : undefined}>{t('academics.register.basket')} · {p.sections.length}</SectionTitle>
                {p.sections.length === 0 && <div className="text-sm text-muted">{t('academics.register.emptyBasket')}</div>}
                <ul className="divide-y divide-line">
                  {p.sections.map((s) => {
                    const pinned = p.preferences.pinned?.includes(s.id);
                    return (
                      <li key={s.id} className="flex flex-wrap items-center gap-2 py-2 text-sm">
                        <div className="min-w-0 flex-1"><div className="font-semibold">{s.course_code} <span className="font-normal text-muted">sec {s.section_no} · {l(s.title_en, s.title_ar)}</span></div><div className="text-xs text-muted">{s.instructor} · {s.meetings.map((m) => `${weekdayName(m.day, locale)} ${m.start}–${m.end}${m.location ? ` · ${l(m.location.name_en, m.location.name_ar)}` : ''}`).join(' · ')} · <span className={clsx('num', s.seats_left === 0 ? 'text-danger' : s.seats_left <= 2 ? 'text-warn' : '')}>{t('academics.register.seats', { n: s.seats_left })}</span></div></div>
                        <span className="num text-xs text-muted">{s.credits} cr</span>
                        {editable && <>
                          <Button size="sm" variant="ghost" title={pinned ? t('academics.register.unpin') : t('academics.register.pin')} onClick={() => void patch({ pinned: pinned ? (p.preferences.pinned ?? []).filter((x) => x !== s.id) : [...(p.preferences.pinned ?? []), s.id] })}>{pinned ? <Pin className="h-4 w-4 text-brand-600" /> : <PinOff className="h-4 w-4" />}</Button>
                          <Button size="sm" variant="ghost" title={t('academics.register.swap')} onClick={() => setSwapFor(s)}><ArrowLeftRight className="h-4 w-4" /></Button>
                          <Button size="sm" variant="ghost" title={t('common.remove')} onClick={() => void patch({ remove: s.id })}><Trash2 className="h-4 w-4 text-danger" /></Button>
                        </>}
                      </li>
                    );
                  })}
                </ul>
                {p.sections.length > 0 && <div className="mt-3"><WeekGrid blocks={[...meetingsToBlocks(p.sections.map((s) => ({ id: s.id, code: s.course_code, meetings: s.meetings, tone: s.seats_left === 0 ? 'danger' : s.seats_left <= 2 ? 'warn' : 'brand' }))), ...(p.preferences.keepWindows ?? []).map((w, i) => ({ id: `kw${i}`, day: w.day, start: w.start, end: w.end, title: w.label ?? t('academics.register.protected'), tone: 'gold' as const, dashed: true }))]} /></div>}
              </Card>
              <Card>
                <SectionTitle>{t('academics.register.checks')}</SectionTitle>
                <ChecksList checks={p.checks} />
              </Card>
            </div>
            <div className="space-y-4 lg:col-span-2">
              <Card className={clsx(p.status === 'approved' && 'border-brand-500/60')}>
                <SectionTitle>{t('academics.register.finalReview')}</SectionTitle>
                <p className="text-xs text-muted">{t('academics.register.finalReviewHint')}</p>
                <ul className="mt-2 space-y-1 text-sm">{p.sections.map((s) => <li key={s.id} className="flex justify-between"><span>{s.course_code} · sec {s.section_no} <span className="font-mono text-xs text-muted">{s.id}</span></span><span className="num">{s.credits}</span></li>)}<li className="flex justify-between border-t border-line pt-1 font-semibold"><span>{t('academics.register.total')}</span><span className="num">{p.credits} {t('common.credits')}</span></li></ul>
                {p.hard_fails.length > 0 && <div className="mt-2"><Callout tone="danger" title={t('academics.register.blocked')}>{p.hard_fails.join(' · ')}</Callout></div>}
                <div className="mt-3 flex flex-wrap gap-2">
                  {editable && <Button onClick={approve} disabled={!p.can_approve} loading={busy} icon={<ShieldCheck className="h-4 w-4" />}>{p.status === 'approved' ? t('academics.register.reapprove') : t('academics.register.approveExact')}</Button>}
                  {p.status === 'approved' && <Button variant="gold" onClick={() => void submit(false)} loading={busy} icon={<Send className="h-4 w-4" />}>{t('academics.register.submit')}</Button>}
                </div>
                {p.status === 'approved' && (
                  <div className="mt-4 rounded-2xl border border-dashed border-gold-500/60 bg-gold-100/40 p-3 text-xs dark:bg-gold-700/10">
                    <div className="mb-2 font-semibold text-gold-700">{t('academics.register.demoControls')}</div>
                    <div className="flex flex-wrap items-center gap-2">
                      <Select value={simulate} onChange={(e) => setSimulate(e.target.value as typeof simulate)} className="!w-auto"><option value="">{t('academics.register.simNone')}</option><option value="stale_capacity">{t('academics.register.simStale')}</option><option value="timeout">{t('academics.register.simTimeout')}</option><option value="partial">{t('academics.register.simPartial')}</option></Select>
                      <Button size="sm" variant="outline" onClick={() => void submit(true)} loading={busy}>{t('academics.register.simDouble')}</Button>
                    </div>
                  </div>
                )}
              </Card>
              {eligibility && (
                <Card>
                  <SectionTitle>{t('academics.register.eligibility')}</SectionTitle>
                  <div className="mb-2 flex flex-wrap gap-1">{eligibility.filter((e) => e.eligible).map((e) => <span key={e.code} className={clsx('rounded-md border px-1.5 py-0.5 text-xs font-medium', e.required ? 'border-brand-500/40 bg-brand-500/10' : 'border-line')} title={e.title_en}>{e.code}{e.conditional ? '*' : ''}</span>)}</div>
                  <details className="text-xs"><summary className="cursor-pointer font-semibold text-muted">{t('academics.register.blockedN', { n: eligibility.filter((e) => !e.eligible).length })}</summary><ul className="mt-1 space-y-1">{eligibility.filter((e) => !e.eligible).map((e) => <li key={e.code}><span className="font-semibold">{e.code}</span> <span className="text-muted">— {e.reasons.join('; ')}</span></li>)}</ul></details>
                </Card>
              )}
              <Card className="!p-3">
                <button type="button" onClick={() => setLogOpen((v) => !v)} className="flex w-full items-center justify-between text-sm font-semibold" aria-expanded={logOpen}><span className="flex items-center gap-2"><Info className="h-4 w-4 text-muted" />{t('academics.register.actionLog')} ({p.action_log.length})</span><ChevronDown className={clsx('h-4 w-4 transition', logOpen && 'rotate-180')} /></button>
                {logOpen && <ol className="mt-2 max-h-72 space-y-1.5 overflow-y-auto text-xs">{p.action_log.map((a, i) => <li key={i} className="rounded-lg bg-surface-2 p-2"><span className="num text-muted">{fmtDateTime(a.at, locale)}</span> <span className="font-semibold">{a.step}</span><div className="text-muted">{a.detail}</div></li>)}</ol>}
              </Card>
            </div>
          </div>
        </div>
      )}
      <SwapModal open={!!swapFor} section={swapFor} onClose={() => setSwapFor(null)} onPick={async (to) => { if (swapFor) { await patch({ swap: { from: swapFor.id, to } }); setSwapFor(null); } }} />
      <AddModal open={addOpen} eligibility={eligibility ?? []} onClose={() => setAddOpen(false)} onPick={async (id) => { await patch({ add: id }); setAddOpen(false); }} />
    </div>
  );
}

function SectionRow({ s, onPick, disabled }: { s: SectionView; onPick: () => void; disabled?: boolean }) {
  const { t, l, locale } = useI18n();
  return (
    <li className="flex items-center justify-between gap-2 rounded-xl border border-line p-2.5 text-sm">
      <div><div className="font-semibold">sec {s.section_no} · {s.instructor}</div><div className="text-xs text-muted">{s.meetings.map((m) => `${weekdayName(m.day, locale)} ${m.start}–${m.end}${m.location ? ` · ${l(m.location.name_en, m.location.name_ar)}` : ''}`).join(' · ')}</div></div>
      <div className="flex items-center gap-2"><span className={clsx('num text-xs', s.seats_left === 0 ? 'text-danger' : s.seats_left <= 2 ? 'text-warn' : 'text-muted')}>{t('academics.register.seats', { n: s.seats_left })}</span><Button size="sm" variant="outline" onClick={onPick} disabled={disabled}>{t('academics.register.pick')}</Button></div>
    </li>
  );
}
function SwapModal({ open, section, onClose, onPick }: { open: boolean; section: SectionView | null; onClose: () => void; onPick: (id: string) => Promise<void> }) {
  const { t } = useI18n();
  const q = useQuery(() => section ? api<SectionView[]>('/academics/sections', { query: { term: section.term, course: section.course_code } }) : Promise.resolve([]), [section?.id]);
  return (
    <Modal open={open} onClose={onClose} title={section ? `${t('academics.register.swap')} · ${section.course_code}` : ''} description={t('academics.register.swapHint')}>
      {!q.data ? <Skeleton className="h-24" /> : <ul className="space-y-2">{q.data.map((s) => <SectionRow key={s.id} s={s} disabled={s.id === section?.id} onPick={() => void onPick(s.id)} />)}</ul>}
    </Modal>
  );
}
function AddModal({ open, eligibility, onClose, onPick }: { open: boolean; eligibility: EligibleCourse[]; onClose: () => void; onPick: (id: string) => Promise<void> }) {
  const { t, l } = useI18n();
  const [code, setCode] = useState<string>('');
  const e = eligibility.find((x) => x.code === code);
  return (
    <Modal open={open} onClose={onClose} title={t('academics.register.addCourse')} description={t('academics.register.addHint')}>
      <Select value={code} onChange={(ev) => setCode(ev.target.value)}><option value="">{t('academics.register.chooseCourse')}</option>{eligibility.map((x) => <option key={x.code} value={x.code} disabled={!x.eligible}>{x.code} · {l(x.title_en, x.title_ar)}{x.eligible ? '' : ` · ${x.reasons[0]}`}</option>)}</Select>
      {e && <ul className="mt-3 space-y-2">{e.sections.map((s) => <SectionRow key={s.id} s={s} onPick={() => void onPick(s.id)} />)}</ul>}
    </Modal>
  );
}
