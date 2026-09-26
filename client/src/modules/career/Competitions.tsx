import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router';
import clsx from 'clsx';
import { Trophy, CalendarClock, Users, MapPin, ExternalLink, Star, CheckCircle2, Award, Radio } from 'lucide-react';
import { Badge, Button, ButtonLink, EmptyState, ErrorState, Field, Input, Modal, Skeleton, Tabs } from '@/components/ui';
import { useEdgeFade } from '@/components/ui/useEdgeFade';
import { useToast } from '@/components/ui/toast';
import { useI18n } from '@/i18n';
import { api, errorMessage } from '@/lib/api';
import { refreshAll } from '@/lib/bus';
import { useQuery } from '@/lib/useQuery';
import { fmtDate, fmtDateRange, fmtDateTime } from '@/lib/format';
import { addToLinkedinUrl } from './linkedinExport';
import type { CompKind, Competition, CompetitionList, EntryStatus } from './portfolioTypes';

type Segment = 'open' | 'upcoming' | 'past' | 'mine';
const KINDS: CompKind[] = ['hackathon', 'programming', 'case', 'design', 'cyber', 'ai_data'];
const NEXT: Record<EntryStatus, EntryStatus | null> = { interested: 'registered', registered: 'team_formed', team_formed: 'submitted', submitted: null, result: null };

function Deadline({ c }: { c: Competition }) {
  const { t, locale } = useI18n();
  if (c.segment === 'past') return <span>{t('comp.ended', { date: fmtDate(c.ends_at, locale) })}</span>;
  if (c.segment === 'upcoming' && c.registration_opens && c.days_left > 0 && c.registration_opens > new Date().toISOString().slice(0, 10)) return <span>{t('comp.opensOn', { date: fmtDate(c.registration_opens, locale) })}</span>;
  if (c.days_left < 0) return <span>{t('comp.registrationClosed')}</span>;
  return <span className={clsx(c.days_left <= 7 && 'font-semibold text-warn')}>{t('comp.closesIn', { n: c.days_left, date: fmtDate(c.registration_deadline, locale, { year: undefined }) })}</span>;
}

function CompetitionCard({ c, highlight, onChanged }: { c: Competition; highlight: boolean; onChanged: () => void }) {
  const { t, locale } = useI18n();
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  const [resultOpen, setResultOpen] = useState(false);
  const [result, setResult] = useState('');
  const [team, setTeam] = useState(c.entry?.team_name ?? '');
  const set = async (status: EntryStatus, extra: Record<string, string> = {}) => {
    setBusy(true);
    try {
      await api(`/career/competitions/${c.id}/entry`, { method: 'PUT', body: { status, ...extra } });
      toast.success(t(`comp.toast.${status}`));
      refreshAll('career', 'calendar');
      onChanged();
    } catch (e) { toast.error(errorMessage(e)); } finally { setBusy(false); }
  };
  const withdraw = async () => {
    setBusy(true);
    try { await api(`/career/competitions/${c.id}/entry`, { method: 'DELETE' }); toast.info(t('comp.toast.withdrawn')); refreshAll('career', 'calendar'); onChanged(); }
    catch (e) { toast.error(errorMessage(e)); } finally { setBusy(false); }
  };
  const next = c.entry ? NEXT[c.entry.status] : null;
  const teamLabel = c.team.max <= 1 ? t('comp.solo') : c.team.min === c.team.max ? t('comp.teamOf', { n: c.team.max }) : t('comp.teamRange', { min: c.team.min, max: c.team.max });
  return (
    <article id={`comp-${c.id}`} className={clsx('card flex h-full flex-col p-4', highlight && 'ring-2 ring-brand-500')}>
      <div className="flex flex-wrap items-center gap-1.5">
        <Badge tone="brand">{t(`comp.kind.${c.kind}`)}</Badge>
        <Badge tone={c.scope === 'yu' ? 'gold' : 'neutral'}>{t(`comp.scope.${c.scope}`)}</Badge>
        {c.entry && <Badge tone={c.entry.status === 'result' ? 'success' : 'info'} dot>{t(`comp.status.${c.entry.status}`)}</Badge>}
      </div>
      <h3 dir="auto" className="mt-2 font-semibold leading-snug rtl:text-right">{c.title}</h3>
      <p dir="auto" className="text-sm text-muted rtl:text-right">{c.organiser}</p>
      <dl className="mt-3 space-y-1.5 text-sm">
        <div className="flex items-start gap-2"><dt className="sr-only">{t('comp.registration')}</dt><CalendarClock className="mt-0.5 h-4 w-4 shrink-0 text-muted" aria-hidden /><dd><Deadline c={c} /></dd></div>
        <div className="flex items-start gap-2"><dt className="sr-only">{t('comp.dates')}</dt><Trophy className="mt-0.5 h-4 w-4 shrink-0 text-muted" aria-hidden /><dd className="num">{fmtDateRange(c.starts_at, c.ends_at, locale)}</dd></div>
        <div className="flex items-start gap-2"><dt className="sr-only">{t('comp.format')}</dt><MapPin className="mt-0.5 h-4 w-4 shrink-0 text-muted" aria-hidden /><dd>{t(`comp.format.${c.format}`)}{c.city ? <> · <bdi>{c.city}</bdi></> : null}</dd></div>
        <div className="flex items-start gap-2"><dt className="sr-only">{t('comp.team')}</dt><Users className="mt-0.5 h-4 w-4 shrink-0 text-muted" aria-hidden /><dd><bdi>{teamLabel}</bdi></dd></div>
      </dl>
      {c.eligibility && <p dir="auto" className="mt-2 text-sm text-muted rtl:text-right">{c.eligibility}</p>}
      {c.prizes && <p className="mt-1 text-sm"><span className="text-muted">{t('comp.prizes')}:</span> <bdi>{c.prizes}</bdi></p>}
      {c.fit.length > 0 && <p className="mt-2 flex items-center gap-1.5 text-sm text-success"><CheckCircle2 className="h-4 w-4" aria-hidden />{t('comp.goodFit', { skills: c.fit.join(', ') })}</p>}
      {c.entry?.result && (
        <div className="mt-3 rounded-xl border border-gold-500/50 bg-gold-100/60 p-3 text-sm dark:bg-gold-700/20">
          <div className="flex items-center gap-2 font-semibold"><Award className="h-4 w-4 text-gold-700" aria-hidden />{c.entry.result}{c.entry.team_name ? ` · ${c.entry.team_name}` : ''}</div>
          <div className="mt-2 flex flex-wrap gap-2">
            <ButtonLink size="sm" variant="outline" to="/portfolio">{t('comp.viewInPortfolio')}</ButtonLink>
            {c.scope === 'yu' && <a className="inline-flex min-h-11 items-center gap-1.5 rounded-xl px-3 text-sm font-medium text-brand-600 hover:underline sm:min-h-8" href={addToLinkedinUrl({ name: `${c.entry.result} · ${c.title}`, org: c.organiser, date: c.ends_at.slice(0, 7), url: c.url, credentialId: `competition:${c.id}` })} target="_blank" rel="noreferrer noopener"><ExternalLink className="h-4 w-4" aria-hidden />{t('portfolio.addToLinkedin')}</a>}
          </div>
        </div>
      )}
      <div className="mt-auto flex flex-wrap items-center gap-2 pt-4">
        {c.segment !== 'past' && !c.entry && <Button size="sm" variant="outline" loading={busy} icon={<Star className="h-4 w-4" aria-hidden />} onClick={() => void set('interested')}>{t('comp.action.interested')}</Button>}
        {c.segment === 'open' && (!c.entry || c.entry.status === 'interested') && <Button size="sm" loading={busy} onClick={() => void set('registered')}>{t('comp.action.register')}</Button>}
        {c.entry && next && next !== 'registered' && c.segment !== 'past' && <Button size="sm" variant="secondary" loading={busy} onClick={() => void set(next, next === 'team_formed' && team ? { team_name: team } : {})}>{t(`comp.action.${next}`)}</Button>}
        {c.segment === 'past' && c.entry?.status !== 'result' && <Button size="sm" variant="outline" icon={<Award className="h-4 w-4" aria-hidden />} onClick={() => setResultOpen(true)}>{t('comp.action.addResult')}</Button>}
        {c.entry && c.entry.status !== 'result' && <Button size="sm" variant="ghost" loading={busy} onClick={() => void withdraw()}>{t('comp.action.withdraw')}</Button>}
        {c.url && <a href={c.url} target="_blank" rel="noreferrer noopener" className="ms-auto inline-flex min-h-11 items-center gap-1 text-sm font-medium text-brand-600 hover:underline sm:min-h-8"><ExternalLink className="h-4 w-4" aria-hidden />{t('comp.officialPage')}</a>}
      </div>
      {c.entry?.status === 'registered' && c.team.max > 1 && (
        <div className="mt-3 flex items-end gap-2">
          <Field label={t('comp.teamName')} className="min-w-0 flex-1"><Input value={team} onChange={(e) => setTeam(e.target.value)} maxLength={80} /></Field>
        </div>
      )}
      {c.entry?.status === 'registered' && <p className="mt-2 text-xs text-muted">{t('comp.registerNote')}</p>}
      <Modal open={resultOpen} onClose={() => setResultOpen(false)} title={t('comp.action.addResult')} description={c.title} footer={<><Button variant="ghost" onClick={() => setResultOpen(false)}>{t('common.cancel')}</Button><Button disabled={!result.trim()} loading={busy} onClick={() => void set('result', { result: result.trim(), ...(team ? { team_name: team } : {}) }).then(() => setResultOpen(false))}>{t('common.save')}</Button></>}>
        <div className="space-y-3">
          <Field label={t('comp.result')} hint={t('comp.resultHint')}><Input value={result} onChange={(e) => setResult(e.target.value)} placeholder={t('comp.resultPlaceholder')} maxLength={120} /></Field>
          {c.team.max > 1 && <Field label={t('comp.teamName')}><Input value={team} onChange={(e) => setTeam(e.target.value)} maxLength={80} /></Field>}
          <p className="text-sm text-muted">{c.scope === 'yu' ? t('comp.resultVerifiedNote') : t('comp.resultSelfNote')}</p>
        </div>
      </Modal>
    </article>
  );
}

function LiveFeed() {
  const { t, locale } = useI18n();
  const q = useQuery(() => api<{ items: Array<{ id: string; title: string; starts_at: string; duration_min: number; url: string }>; error?: string; disabled?: boolean }>('/career/competitions-live'), []);
  if (!q.data || q.data.disabled || (q.data.items.length === 0 && !q.data.error)) return null;
  return (
    <section aria-labelledby="live-h" className="card p-4">
      <h2 id="live-h" className="flex items-center gap-2 font-semibold"><Radio className="h-4 w-4 text-brand-600" aria-hidden />{t('comp.live.title')}</h2>
      <p className="text-sm text-muted">{t('comp.live.body')}</p>
      {q.data.error ? <p className="mt-2 text-sm text-muted">{t('comp.live.error')}</p> : (
        <ul className="mt-3 divide-y divide-line">
          {q.data.items.map((c) => (
            <li key={c.id}><a href={c.url} target="_blank" rel="noreferrer noopener" className="flex min-h-11 flex-wrap items-center justify-between gap-2 py-2 text-sm hover:text-brand-600"><span dir="auto" className="font-medium">{c.title}</span><span className="num text-muted">{fmtDateTime(c.starts_at, locale)} · {t('comp.live.duration', { n: Math.round(c.duration_min / 60 * 10) / 10 })}</span></a></li>
          ))}
        </ul>
      )}
    </section>
  );
}

export function Competitions() {
  const { t } = useI18n();
  const [params] = useSearchParams();
  const focusId = params.get('id');
  const [segment, setSegment] = useState<Segment>('open');
  const [kind, setKind] = useState<CompKind | ''>('');
  const chips = useEdgeFade<HTMLDivElement>(kind);
  const q = useQuery(() => api<CompetitionList>('/career/competitions', { query: { segment, kind } }), [segment, kind], { refreshOn: ['career'] });
  // Deep links (?id=) open the segment that contains the competition and scroll to it.
  const all = useQuery(() => (focusId ? api<Competition>(`/career/competitions/${focusId}`) : Promise.resolve(null)), [focusId]);
  useEffect(() => { if (all.data) setSegment(all.data.entry && all.data.segment !== 'past' ? all.data.segment : all.data.segment); }, [all.data]);
  useEffect(() => { if (focusId && q.data) document.getElementById(`comp-${focusId}`)?.scrollIntoView({ block: 'center' }); }, [focusId, q.data]);
  const counts = q.data?.counts;
  return (
    <div className="space-y-4">
      <Tabs label={t('comp.segments')} value={segment} onChange={setSegment} items={[
        { value: 'open', label: t('comp.segment.open'), count: counts?.open },
        { value: 'upcoming', label: t('comp.segment.upcoming'), count: counts?.upcoming },
        { value: 'past', label: t('comp.segment.past'), count: counts?.past },
        { value: 'mine', label: t('comp.segment.mine'), count: counts?.mine }
      ]} />
      <div ref={chips} role="group" aria-label={t('comp.kinds')} className="scroll-row -mx-1 flex gap-2 overflow-x-auto px-1 py-0.5">
        {(['', ...KINDS] as Array<CompKind | ''>).map((k) => (
          <button key={k || 'all'} type="button" aria-pressed={kind === k} onClick={() => setKind(k)} className={clsx('inline-flex min-h-11 shrink-0 items-center rounded-full border px-4 text-sm font-medium transition sm:min-h-9', kind === k ? 'border-brand-500 bg-brand-500 text-ink-950' : 'border-line bg-surface hover:border-brand-400')}>{k ? t(`comp.kind.${k}`) : t('common.all')}</button>
        ))}
      </div>
      {!!q.error && <ErrorState error={q.error} onRetry={() => void q.refetch()} />}
      {q.loading && !q.data && <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">{[1, 2, 3].map((i) => <Skeleton key={i} className="h-72" />)}</div>}
      {q.data && q.data.items.length === 0 && <EmptyState icon={<Trophy className="h-6 w-6" />} title={t(`comp.empty.${segment}`)} action={segment !== 'open' ? <Button variant="outline" onClick={() => setSegment('open')}>{t('comp.segment.open')}</Button> : undefined} />}
      <h2 className="sr-only">{t(`comp.segment.${segment}`)}</h2>
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
        {q.data?.items.map((c) => <CompetitionCard key={c.id} c={c} highlight={c.id === focusId} onChanged={() => void q.refetch()} />)}
      </div>
      {segment === 'open' && <LiveFeed />}
      <p className="text-sm text-muted">{t('comp.calendarNote')} <Link to="/calendar" className="font-medium text-brand-600 hover:underline">{t('nav.calendar')}</Link></p>
    </div>
  );
}

