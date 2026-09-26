import { useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router';
import clsx from 'clsx';
import { Search, ClipboardCheck, ChevronRight, ShieldCheck, LifeBuoy, Send, ArrowUpRight, ArrowDownRight } from 'lucide-react';
import { useI18n } from '@/i18n';
import { api, errorMessage } from '@/lib/api';
import { refreshAll } from '@/lib/bus';
import { useQuery } from '@/lib/useQuery';
import { fmtDate } from '@/lib/format';
import { useSession } from '@/lib/session';
import { useToast } from '@/components/ui/toast';
import { useEdgeFade } from '@/components/ui/useEdgeFade';
import { PageHeader } from '@/components/ui/PageHeader';
import { Badge, Button, ButtonLink, Card, ConfirmDialog, EmptyState, ErrorState, Field, Input, Select, Skeleton, Tabs, Textarea } from '@/components/ui';
import type { CourseListItem, Eligible, InstructorListItem, Mine, Overview, Ticket } from './types';
import { TEACHING_KPIS } from './types';
import { FeedbackForm, IndexRing, StatusBadge } from './components';

type Tab = 'give' | 'courses' | 'instructors' | 'help';

function WindowList({ ov }: { ov: Overview }) {
  const { t, l, locale } = useI18n();
  return (
    <ul className="space-y-2">
      {ov.windows.filter((w) => w.open).map((w) => (
        <li key={w.phase} className="flex items-start gap-2.5 text-sm">
          <ClipboardCheck className="mt-0.5 h-4 w-4 shrink-0 text-brand-600" aria-hidden />
          <span className="min-w-0"><span className="font-medium">{t(`fb.window.${w.phase}`, { term: l(w.term_label_en, w.term_label_ar) })}</span><span className="block text-xs text-muted">{t('fb.window.closes', { date: fmtDate(w.closes_on, locale) })}</span></span>
        </li>
      ))}
    </ul>
  );
}

// ------------------------------------------------------------------ your feedback
function GiveTab({ minResponses }: { minResponses: number }) {
  const { t, l, locale } = useI18n();
  const toast = useToast();
  const q = useQuery(() => api<Mine>('/feedback/mine'), [], { refreshOn: ['feedback'] });
  const [target, setTarget] = useState<Eligible | null>(null);
  const [withdraw, setWithdraw] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const d = q.data;
  const doWithdraw = async () => {
    if (!withdraw) return;
    setBusy(true);
    try { await api(`/feedback/responses/${withdraw}`, { method: 'DELETE' }); toast.info(t('fb.withdrawn')); refreshAll('feedback'); setWithdraw(null); }
    catch (e) { toast.error(errorMessage(e)); } finally { setBusy(false); }
  };
  const groups = d ? (['end_of_term', 'mid_term'] as const).map((phase) => ({ phase, window: d.windows.find((w) => w.phase === phase)!, items: d.items.filter((i) => i.phase === phase) })).filter((g) => g.items.length) : [];
  const pending = d?.items.filter((i) => i.status === 'pending') ?? [];
  const existing = target?.response_id ? d?.responses.find((r) => r.id === target.response_id) ?? null : null;
  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1fr)_340px]">
      <div className="min-w-0 space-y-6">
        {q.loading && !d && <Skeleton className="h-64" />}
        {q.error ? <ErrorState error={q.error} onRetry={() => void q.refetch()} /> : null}
        {d && (
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="text-sm font-medium">{t('fb.pending', { n: pending.length })}</p>
            {pending[0] && <Button size="sm" onClick={() => setTarget(pending[0])}>{t('fb.startNow', { code: pending[0].course_code })}</Button>}
          </div>
        )}
        {d && groups.length === 0 && <EmptyState icon={<ClipboardCheck className="h-6 w-6" />} title={t('fb.give.none')} />}
        {groups.map((g) => (
          <section key={g.phase} aria-labelledby={`g-${g.phase}`}>
            <h2 id={`g-${g.phase}`} className="font-semibold">{t(g.phase === 'end_of_term' ? 'fb.give.endTitle' : 'fb.give.midTitle', { term: l(g.window.term_label_en, g.window.term_label_ar) })}</h2>
            <p className="mb-3 text-sm text-muted">{t(g.phase === 'end_of_term' ? 'fb.give.endBody' : 'fb.give.midBody')} {g.window.open ? t('fb.window.closes', { date: fmtDate(g.window.closes_on, locale) }) : t('fb.window.closed')}</p>
            <ul className="card divide-y divide-line">
              {g.items.map((i) => {
                const resp = i.response_id ? d!.responses.find((r) => r.id === i.response_id) : null;
                return (
                  <li key={`${i.course_code}-${i.term}`} className="flex flex-wrap items-center gap-3 p-4">
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2"><span className="num font-semibold">{i.course_code}</span><span className="truncate text-sm">{l(i.title_en, i.title_ar)}</span></div>
                      <div className="text-xs text-muted">{l(i.instructor.name_en, i.instructor.name_ar)}</div>
                    </div>
                    {i.status !== 'pending' && <StatusBadge status={resp?.status === 'held' ? 'held' : i.status} />}
                    {i.status === 'pending' && <Button size="sm" variant="outline" onClick={() => setTarget(i)}>{t('fb.rate')}</Button>}
                    {i.status === 'submitted' && resp?.editable && <><Button size="sm" variant="outline" onClick={() => setTarget(i)}>{t('fb.edit')}</Button><Button size="sm" variant="ghost" onClick={() => setWithdraw(resp.id)}>{t('fb.withdraw')}</Button></>}
                    <Link to={`/feedback/courses/${encodeURIComponent(i.course_code)}`} aria-label={`${t('fb.openCourse')} ${i.course_code}`} className="grid h-11 w-11 place-items-center rounded-full text-muted hover:bg-line/60 hover:text-fg sm:h-9 sm:w-9"><ChevronRight className="h-4 w-4 rtl:rotate-180" aria-hidden /></Link>
                  </li>
                );
              })}
            </ul>
          </section>
        ))}
      </div>
      <aside className="min-w-0">
        <Card>
          <h2 className="flex items-center gap-2 font-semibold"><ShieldCheck className="h-5 w-5 text-brand-600" aria-hidden />{t('fb.privacy.title')}</h2>
          <ul className="mt-3 space-y-2.5 text-sm">
            {[1, 2, 3, 4, 5].map((n) => <li key={n} className="flex gap-2"><span aria-hidden className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-brand-500" /><span>{t(`fb.privacy.${n}`, { n: minResponses })}</span></li>)}
          </ul>
        </Card>
      </aside>
      {target && <FeedbackForm key={target.course_code + target.term} target={target} existing={existing} open onClose={() => setTarget(null)} />}
      <ConfirmDialog open={!!withdraw} onClose={() => setWithdraw(null)} onConfirm={() => void doWithdraw()} title={t('fb.withdraw')} body={t('fb.withdrawConfirm')} loading={busy} />
    </div>
  );
}

// ------------------------------------------------------------------ explore
function CollegeChips({ colleges, value, onChange }: { colleges: Overview['colleges']; value: string; onChange: (v: string) => void }) {
  const { t, l } = useI18n();
  const ref = useEdgeFade<HTMLDivElement>(value);
  return (
    <div ref={ref} role="group" aria-label={t('fb.colleges')} className="scroll-row -mx-1 flex gap-2 overflow-x-auto px-1 py-0.5">
      {[{ key: '', en: t('fb.college.all'), ar: t('fb.college.all') }, ...colleges].map((c) => (
        <button key={c.key || 'all'} type="button" aria-pressed={value === c.key} onClick={() => onChange(c.key)} className={clsx('inline-flex min-h-11 shrink-0 items-center rounded-full border px-4 text-sm font-medium transition sm:min-h-9', value === c.key ? 'border-brand-500 bg-brand-500 text-ink-950' : 'border-line bg-surface hover:border-brand-400')}>{l(c.en, c.ar)}</button>
      ))}
    </div>
  );
}

function SearchBox({ value, onChange, placeholder }: { value: string; onChange: (v: string) => void; placeholder: string }) {
  const { t } = useI18n();
  return (
    <div className="relative max-w-xl">
      <Search className="pointer-events-none absolute start-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" aria-hidden />
      <label htmlFor="fb-search" className="sr-only">{t('fb.search.label')}</label>
      <Input id="fb-search" type="search" value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} className="ps-9" />
    </div>
  );
}

function MiniKpis({ kpis, keys }: { kpis: Record<string, { mean: number | null }>; keys: string[] }) {
  const { t } = useI18n();
  return (
    <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-2">
      {keys.map((k) => {
        const m = kpis[k]?.mean ?? null;
        return (
          <div key={k} className="min-w-0">
            <dt className="truncate text-xs text-muted">{t(`fb.kpi.${k}`)}</dt>
            <dd className="flex items-center gap-2"><span className="num w-7 text-sm font-semibold">{m === null ? '–' : m.toFixed(1)}</span><span className="h-1.5 min-w-0 flex-1 rounded-full bg-line"><span className={clsx('block h-full rounded-full', m === null ? '' : m >= 4.2 ? 'bg-success' : m >= 3.6 ? 'bg-brand-500' : 'bg-gold-500')} style={{ width: m === null ? 0 : `${((m - 1) / 4) * 100}%` }} /></span></dd>
          </div>
        );
      })}
    </dl>
  );
}

function Delta({ n }: { n: number | null }) {
  const { t } = useI18n();
  if (n === null || n === 0) return null;
  const Icon = n > 0 ? ArrowUpRight : ArrowDownRight;
  return <span className={clsx('inline-flex items-center gap-0.5 text-xs font-medium', n > 0 ? 'text-success' : 'text-muted')}><Icon className="h-3.5 w-3.5 rtl:-scale-x-100" aria-hidden />{t('fb.delta', { sign: n > 0 ? '+' : '−', n: Math.abs(n) })}</span>;
}

function CoursesTab({ ov }: { ov: Overview }) {
  const { t, l } = useI18n();
  const [q, setQ] = useState('');
  const [college, setCollege] = useState('');
  const list = useQuery(() => api<{ items: CourseListItem[] }>('/feedback/courses', { query: { q, college } }), [q, college], { refreshOn: ['feedback'] });
  const colleges = useMemo(() => ov.colleges.filter((c) => c.key !== 'law'), [ov.colleges]);
  return (
    <div className="space-y-4">
      <SearchBox value={q} onChange={setQ} placeholder={t('fb.search.courses')} />
      <CollegeChips colleges={colleges} value={college} onChange={setCollege} />
      {list.loading && !list.data && <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">{[1, 2, 3].map((i) => <Skeleton key={i} className="h-48" />)}</div>}
      {list.error ? <ErrorState error={list.error} onRetry={() => void list.refetch()} /> : null}
      {list.data && list.data.items.length === 0 && <EmptyState icon={<Search className="h-6 w-6" />} title={t('fb.emptySearch')} body={t('fb.emptySearchBody')} />}
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
        {list.data?.items.map((c) => (
          <Link key={c.code} to={`/feedback/courses/${encodeURIComponent(c.code)}`} className="card flex min-w-0 flex-col p-4 transition hover:border-brand-400">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0"><div className="num font-semibold">{c.code}</div><div className="truncate text-sm">{l(c.title_en, c.title_ar)}</div><div className="truncate text-xs text-muted">{c.instructors.map((i) => l(i.name_en, i.name_ar)).join(' · ')}</div></div>
              <div className="shrink-0 text-end"><div className="num text-2xl font-bold leading-none">{c.index ?? '–'}</div><div className="text-xs text-muted">{t('fb.courseIndex')}</div></div>
            </div>
            {c.enough ? <MiniKpis kpis={c.kpis} keys={['clarity', 'grading', 'workload', 'value']} /> : <p className="mt-3 text-sm text-muted">{t('fb.notEnough')}</p>}
            <div className="mt-auto flex flex-wrap items-center gap-x-3 gap-y-1 pt-3 text-xs text-muted">
              <span>{t('fb.responses', { n: c.n })}</span>
              {c.hours !== null && <span className="num">{c.hours} {t('fb.hoursShort')}</span>}
              {c.recommend !== null && <span className="num">{c.recommend}% {t('fb.recommendShort')}</span>}
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
}

function InstructorsTab({ ov }: { ov: Overview }) {
  const { t, l } = useI18n();
  const [q, setQ] = useState('');
  const [college, setCollege] = useState('');
  const list = useQuery(() => api<{ items: InstructorListItem[] }>('/feedback/instructors', { query: { q, college } }), [q, college], { refreshOn: ['feedback'] });
  const colleges = useMemo(() => ov.colleges.filter((c) => c.key !== 'law'), [ov.colleges]);
  return (
    <div className="space-y-4">
      <SearchBox value={q} onChange={setQ} placeholder={t('fb.search.instructors')} />
      <CollegeChips colleges={colleges} value={college} onChange={setCollege} />
      {list.loading && !list.data && <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">{[1, 2, 3].map((i) => <Skeleton key={i} className="h-48" />)}</div>}
      {list.error ? <ErrorState error={list.error} onRetry={() => void list.refetch()} /> : null}
      {list.data && list.data.items.length === 0 && <EmptyState icon={<Search className="h-6 w-6" />} title={t('fb.emptySearch')} body={t('fb.emptySearchBody')} />}
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
        {list.data?.items.map((i) => (
          <Link key={i.slug} to={`/feedback/instructors/${i.slug}`} className="card flex min-w-0 flex-col p-4 transition hover:border-brand-400">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0"><div className="truncate font-semibold">{l(i.name_en, i.name_ar)}</div><div className="num truncate text-xs text-muted">{i.courses.join(' · ')}</div></div>
              <div className="shrink-0 text-end"><div className="num text-2xl font-bold leading-none">{i.index ?? '–'}</div><div className="text-xs text-muted">{t('fb.index')}</div></div>
            </div>
            {i.enough ? <MiniKpis kpis={i.kpis} keys={TEACHING_KPIS} /> : <p className="mt-3 text-sm text-muted">{t('fb.notEnough')}</p>}
            <div className="mt-auto flex flex-wrap items-center gap-x-3 gap-y-1 pt-3 text-xs text-muted">
              <span>{t('fb.responses', { n: i.n })}</span>
              {i.recommend !== null && <span className="num">{i.recommend}% {t('fb.recommendShort')}</span>}
              <Delta n={i.delta} />
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
}

// ------------------------------------------------------------------ help
function HelpTab() {
  const { t, locale } = useI18n();
  const toast = useToast();
  const tickets = useQuery(() => api<Ticket[]>('/feedback/help/tickets'), [], { refreshOn: ['feedback'] });
  const [category, setCategory] = useState('question');
  const [subject, setSubject] = useState('');
  const [body, setBody] = useState('');
  const [page, setPage] = useState('');
  const [busy, setBusy] = useState(false);
  const send = async () => {
    setBusy(true);
    try {
      const r = await api<Ticket>('/feedback/help/tickets', { method: 'POST', body: { category, subject: subject.trim(), body: body.trim(), page: page.trim() || undefined } });
      toast.success(t('fb.help.sent', { id: r.public_id }));
      setSubject(''); setBody(''); setPage('');
      refreshAll('feedback');
    } catch (e) { toast.error(errorMessage(e)); } finally { setBusy(false); }
  };
  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,24rem)]">
      <section aria-labelledby="faq-h" className="min-w-0">
        <h2 id="faq-h" className="mb-3 font-semibold">{t('fb.help.faq')}</h2>
        <div className="card divide-y divide-line">
          {[1, 2, 3, 4, 5, 6].map((n) => (
            <details key={n} className="group">
              <summary className="flex min-h-12 cursor-pointer list-none items-center justify-between gap-3 px-4 py-3 text-sm font-medium hover:bg-line/30 [&::-webkit-details-marker]:hidden">
                {t(`fb.help.q${n}`)}<ChevronRight className="h-4 w-4 shrink-0 text-muted transition-transform group-open:rotate-90 rtl:rotate-180 rtl:group-open:rotate-90" aria-hidden />
              </summary>
              <p className="px-4 pb-4 text-sm text-muted">{t(`fb.help.a${n}`)}</p>
            </details>
          ))}
        </div>
        <h2 className="mb-3 mt-8 font-semibold">{t('fb.help.mine')}</h2>
        {tickets.loading && !tickets.data && <Skeleton className="h-24" />}
        {tickets.data && tickets.data.length === 0 && <p className="text-sm text-muted">{t('fb.help.none')}</p>}
        <ul className="space-y-3">
          {tickets.data?.map((tk) => (
            <li key={tk.id} className="card p-4">
              <div className="flex flex-wrap items-center gap-2"><span className="num text-xs text-muted">{tk.public_id}</span><Badge tone="neutral">{t(`fb.help.cat.${tk.category}`)}</Badge><Badge tone={tk.status === 'answered' ? 'success' : tk.status === 'open' ? 'warn' : 'neutral'} dot>{t(`fb.help.status.${tk.status}`)}</Badge><span className="num ms-auto text-xs text-muted">{fmtDate(tk.created_at, locale)}</span></div>
              <div className="mt-2 font-medium" dir="auto">{tk.subject}</div>
              <p className="mt-1 text-sm text-muted" dir="auto">{tk.body}</p>
              {tk.reply && <div className="mt-3 rounded-xl bg-surface-2 p-3 text-sm"><div className="mb-1 text-xs font-semibold text-muted">{t('fb.help.reply')}</div><p dir="auto">{tk.reply}</p></div>}
            </li>
          ))}
        </ul>
      </section>
      <section aria-labelledby="contact-h" className="min-w-0">
        <Card>
          <h2 id="contact-h" className="flex items-center gap-2 font-semibold"><LifeBuoy className="h-5 w-5 text-brand-600" aria-hidden />{t('fb.help.contact')}</h2>
          <p className="mb-4 text-sm text-muted">{t('fb.help.contactBody')}</p>
          <form className="space-y-3" onSubmit={(e) => { e.preventDefault(); void send(); }}>
            <Field label={t('fb.help.category')}><Select value={category} onChange={(e) => setCategory(e.target.value)}>{['question', 'bug', 'suggestion', 'account', 'other'].map((c) => <option key={c} value={c}>{t(`fb.help.cat.${c}`)}</option>)}</Select></Field>
            <Field label={t('fb.help.subject')} required><Input value={subject} maxLength={120} onChange={(e) => setSubject(e.target.value)} /></Field>
            <Field label={t('fb.help.message')} hint={t('fb.help.messageHint')} required><Textarea rows={4} maxLength={2000} value={body} onChange={(e) => setBody(e.target.value)} /></Field>
            <Field label={t('fb.help.page')}><Input value={page} maxLength={200} onChange={(e) => setPage(e.target.value)} placeholder="/campus/map" dir="ltr" /></Field>
            <Button type="submit" loading={busy} disabled={subject.trim().length < 4 || body.trim().length < 10} icon={<Send className="h-4 w-4" aria-hidden />}>{t('fb.help.send')}</Button>
          </form>
        </Card>
      </section>
    </div>
  );
}

// ------------------------------------------------------------------ page
export function FeedbackPage() {
  const { t, l } = useI18n();
  const { hasRole } = useSession();
  const [params, setParams] = useSearchParams();
  const student = hasRole('student');
  const tab = (params.get('tab') as Tab | null) ?? (student ? 'give' : 'courses');
  const setTab = (v: Tab) => setParams((p) => { p.set('tab', v); return p; }, { replace: true });
  const ov = useQuery(() => api<Overview>('/feedback/overview'), [], { refreshOn: ['feedback'] });
  const d = ov.data;
  const items: Array<{ value: Tab; label: string; count?: number }> = [
    ...(student ? [{ value: 'give' as Tab, label: t('fb.tab.give'), count: d?.me.pending || undefined }] : []),
    { value: 'courses', label: t('fb.tab.courses') },
    { value: 'instructors', label: t('fb.tab.instructors') },
    { value: 'help', label: t('fb.tab.help') }
  ];
  return (
    <div>
      <PageHeader title={t('fb.title')} subtitle={t('fb.subtitle')} actions={d?.is_staff ? <ButtonLink to="/staff/feedback" variant="gold" size="sm">{t('fb.staff.title')}</ButtonLink> : undefined} />
      {d && (
        <Card className="mb-6 grid gap-5 md:grid-cols-[minmax(0,1fr)_minmax(0,18rem)] md:items-center">
          <div className="flex min-w-0 items-center gap-4">
            <IndexRing value={d.overall.index} label={t('fb.index')} />
            <div className="min-w-0 text-sm">
              <div className="font-semibold">{t('fb.totals', { r: d.totals.responses, c: d.totals.courses, i: d.totals.instructors })}</div>
              <div className="text-muted">{t('fb.basedOn', { terms: d.public_terms.map((x) => l(x.en, x.ar)).join(' · ') })}</div>
              <ul className="mt-2 flex flex-wrap gap-x-3 gap-y-1">{TEACHING_KPIS.map((k) => <li key={k} className="inline-flex items-center gap-1 text-xs"><span className="text-muted">{t(`fb.kpi.${k}`)}</span><span className="num font-semibold">{d.overall.kpis[k].mean?.toFixed(1) ?? '–'}</span></li>)}</ul>
            </div>
          </div>
          <div className="border-line md:border-s md:ps-5"><WindowList ov={d} /></div>
        </Card>
      )}
      {ov.loading && !d && <Skeleton className="mb-6 h-24" />}
      {ov.error ? <ErrorState error={ov.error} onRetry={() => void ov.refetch()} /> : null}
      <Tabs className="mb-5" label={t('fb.tabs')} value={tab} onChange={setTab} items={items} />
      {tab === 'give' && student && <GiveTab minResponses={d?.min_responses ?? 5} />}
      {tab === 'courses' && d && <CoursesTab ov={d} />}
      {tab === 'instructors' && d && <InstructorsTab ov={d} />}
      {tab === 'help' && <HelpTab />}
      {(tab === 'courses' || tab === 'instructors') && <p className="mt-6 text-xs text-muted">{t('fb.bands')} {t('fb.demoNote')}</p>}
    </div>
  );
}
