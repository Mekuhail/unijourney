import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router';
import { Bookmark, BookmarkCheck, ExternalLink, Link2, RefreshCw, Search, MapPin, CalendarClock, ClipboardCheck, Sparkles, SlidersHorizontal, CheckCircle2 } from 'lucide-react';
import clsx from 'clsx';
import { Badge, Button, Callout, EmptyState, ErrorState, Field, Input, Modal, Select, Skeleton, StatusPill, Toggle, ButtonLink } from '@/components/ui';
import { useToast } from '@/components/ui/toast';
import { useEdgeFade } from '@/components/ui/useEdgeFade';
import { useI18n } from '@/i18n';
import { api, errorMessage } from '@/lib/api';
import { refreshAll } from '@/lib/bus';
import { useQuery } from '@/lib/useQuery';
import { fmtDate } from '@/lib/format';
import { MatchRing, SkillChip, EligibilityBadge } from './ui';
import { oppTypeLabel, explainText, type OppList, type Opportunity } from './types';

interface Filters { q: string; type: string; city: string; remote: string; field: string; skill: string; deadlineBefore: string; includeExpired: boolean; saved: boolean; eligibleOnly: boolean; sort: 'match' | 'deadline' | 'posted' }
const EMPTY: Filters = { q: '', type: '', city: '', remote: '', field: '', skill: '', deadlineBefore: '', includeExpired: false, saved: false, eligibleOnly: false, sort: 'match' };
const JOB_TYPES = ['coop', 'internship', 'entry', 'research'];

export function Discover() {
  const { t, locale } = useI18n();
  const toast = useToast();
  const nav = useNavigate();
  const [f, setF] = useState<Filters>(EMPTY);
  const [detail, setDetail] = useState<Opportunity | null>(null);
  const [params, setParams] = useSearchParams();
  const [importOpen, setImportOpen] = useState(false);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const q = useQuery(() => api<OppList>('/career/opportunities', { query: { q: f.q, type: f.type, city: f.city, remote: f.remote, field: f.field, skill: f.skill, deadlineBefore: f.deadlineBefore, includeExpired: f.includeExpired ? '1' : '', saved: f.saved ? '1' : '', sort: f.sort } }), [JSON.stringify({ ...f, eligibleOnly: undefined })], { refreshOn: ['career'] });
  const facets = q.data?.facets;
  // Deep link from portfolio suggestions: /career?open=<id> opens that posting's details.
  const openId = params.get('open');
  useEffect(() => {
    if (!openId || !q.data) return;
    const hit = q.data.items.find((o) => o.id === openId);
    if (hit) setDetail(hit);
  }, [openId, q.data]);
  const closeDetail = () => { setDetail(null); if (openId) { const p = new URLSearchParams(params); p.delete('open'); setParams(p, { replace: true }); } };
  const active = useMemo(() => Object.entries(f).filter(([k, v]) => v && !['q', 'type', 'eligibleOnly', 'sort'].includes(k)).length, [f]);
  const chipRow = useEdgeFade<HTMLDivElement>(f.type);
  // Competitions have their own tab; this list is the job market only.
  const items = (q.data?.items ?? []).filter((o) => o.type !== 'competition' && (!f.eligibleOnly || o.match.eligible === true));

  const save = async (o: Opportunity) => {
    setBusy(o.id);
    try {
      if (o.saved) { await api(`/career/opportunities/${o.id}/save`, { method: 'DELETE' }); toast.info(t('career.unsaved')); }
      else { await api(`/career/opportunities/${o.id}/save`, { method: 'POST', body: {} }); toast.success(t('career.savedToast')); }
      refreshAll('career');
      if (detail?.id === o.id) setDetail({ ...o, saved: !o.saved });
    } catch (e) { toast.error(errorMessage(e)); } finally { setBusy(null); }
  };
  const track = async (o: Opportunity) => {
    setBusy(o.id);
    try {
      const r = await api<{ id: string; duplicate: boolean }>('/career/applications', { body: { opportunityId: o.id } });
      if (r.duplicate) toast.info(t('career.alreadyTracked'));
      else toast.success(t('career.trackedToast'));
      refreshAll('career');
      nav(`/career/applications/${r.id}`);
    } catch (e) { toast.error(errorMessage(e)); } finally { setBusy(null); }
  };
  const refresh = async () => {
    setBusy('feed');
    try {
      const r = await api<{ added: number; skipped: number; notified: number }>('/career/feed/refresh', { body: {} });
      toast.success(t('career.feedResult', { added: r.added, skipped: r.skipped }), t('career.feedSimulated'));
      refreshAll('career');
    } catch (e) { toast.error(errorMessage(e)); } finally { setBusy(null); }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-end gap-2">
        <Field label={t('common.search')} className="min-w-0 flex-1">
          <div className="relative"><Search className="pointer-events-none absolute start-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" /><Input type="search" value={f.q} onChange={(e) => setF({ ...f, q: e.target.value })} placeholder={t('career.searchPlaceholder')} className="ps-9" /></div>
        </Field>
        <Button variant={active > 0 ? 'secondary' : 'outline'} icon={<SlidersHorizontal className="h-4 w-4" />} onClick={() => setFiltersOpen(true)} aria-haspopup="dialog">{t('career.filters')}{active > 0 && <span className="num rounded-full bg-brand-500 px-1.5 text-xs font-bold text-ink-950">{active}</span>}</Button>
      </div>

      <div ref={chipRow} role="group" aria-label={t('career.type')} className="scroll-row -mx-1 flex gap-2 overflow-x-auto px-1 py-0.5">
        {['', ...JOB_TYPES.filter((x) => !facets || facets.types.includes(x))].map((ty) => (
          <button key={ty || 'all'} type="button" aria-pressed={f.type === ty} onClick={() => setF({ ...f, type: ty })} className={clsx('inline-flex min-h-11 shrink-0 items-center rounded-full border px-4 text-sm font-medium transition sm:min-h-9', f.type === ty ? 'border-brand-500 bg-brand-500 text-ink-950' : 'border-line bg-surface hover:border-brand-400')}>{ty ? oppTypeLabel(t, ty) : t('common.all')}</button>
        ))}
        <button type="button" aria-pressed={f.eligibleOnly} onClick={() => setF({ ...f, eligibleOnly: !f.eligibleOnly })} className={clsx('inline-flex min-h-11 shrink-0 items-center gap-1.5 rounded-full border px-4 text-sm font-medium transition sm:min-h-9', f.eligibleOnly ? 'border-success bg-success/15 text-success' : 'border-line bg-surface hover:border-brand-400')}><CheckCircle2 className="h-4 w-4" aria-hidden />{t('career.eligibleNow')}</button>
      </div>

      <Modal open={filtersOpen} onClose={() => setFiltersOpen(false)} title={t('career.filters')} footer={<>{active > 0 && <Button variant="ghost" onClick={() => setF({ ...EMPTY, q: f.q })}>{t('career.clearFilters')}</Button>}<Button onClick={() => setFiltersOpen(false)}>{q.data ? t('career.showResults', { n: q.data.total }) : t('common.close')}</Button></>}>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Field label={t('career.city')}><Select value={f.city} onChange={(e) => setF({ ...f, city: e.target.value })}><option value="">{t('common.all')}</option>{facets?.cities.filter(Boolean).map((x) => <option key={x} value={x}>{x}</option>)}</Select></Field>
          <Field label={t('career.remote')}><Select value={f.remote} onChange={(e) => setF({ ...f, remote: e.target.value })}><option value="">{t('common.all')}</option>{facets?.remote.map((x) => <option key={x} value={x}>{t(`career.remote.${x}`)}</option>)}</Select></Field>
          <Field label={t('career.field')}><Select value={f.field} onChange={(e) => setF({ ...f, field: e.target.value })}><option value="">{t('common.all')}</option>{facets?.fields.filter(Boolean).map((x) => <option key={x} value={x}>{x}</option>)}</Select></Field>
          <Field label={t('career.deadlineBefore')}><Input type="date" value={f.deadlineBefore} onChange={(e) => setF({ ...f, deadlineBefore: e.target.value })} /></Field>
        </div>
        <fieldset className="mt-4">
          <legend className="mb-2 text-sm font-medium">{t('career.skills')}</legend>
          <div className="flex flex-wrap gap-2">
            {(facets?.skills ?? []).slice(0, 18).map((s) => (
              <button key={s} type="button" aria-pressed={f.skill === s} onClick={() => setF({ ...f, skill: f.skill === s ? '' : s })} className={clsx('min-h-9 rounded-xl border px-3 text-sm font-medium transition touch:min-h-11', f.skill === s ? 'border-brand-500 bg-brand-500 text-ink-950' : 'border-line bg-surface-2 hover:border-brand-400')}>{s}</button>
            ))}
          </div>
        </fieldset>
        <div className="mt-4 space-y-3">
          <Toggle checked={f.saved} onChange={(v) => setF({ ...f, saved: v })} label={t('career.savedOnly')} />
          <Toggle checked={f.includeExpired} onChange={(v) => setF({ ...f, includeExpired: v })} label={t('career.includeExpired')} />
        </div>
      </Modal>

      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-2 text-sm text-muted" aria-live="polite">{q.data ? t('career.results', { n: items.length }) : t('common.loading')}<Select aria-label={t('career.sortBy')} value={f.sort} onChange={(e) => setF({ ...f, sort: e.target.value as Filters['sort'] })} className="!w-auto !py-1.5 text-sm">{(['match', 'deadline', 'posted'] as const).map((k) => <option key={k} value={k}>{t(`career.sort.${k}`)}</option>)}</Select></div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" icon={<Link2 className="h-4 w-4" />} onClick={() => setImportOpen(true)}>{t('career.addLink')}</Button>
          <Button variant="secondary" size="sm" icon={<RefreshCw className={clsx('h-4 w-4', busy === 'feed' && 'animate-spin')} />} loading={busy === 'feed'} onClick={() => void refresh()}>{t('career.refreshFeed')}</Button>
        </div>
      </div>

      {!!q.error && <ErrorState error={q.error} onRetry={() => void q.refetch()} />}
      {q.loading && !q.data && <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">{[1, 2, 3, 4, 5, 6].map((i) => <Skeleton key={i} className="h-56" />)}</div>}
      {q.data && items.length === 0 && <EmptyState icon={<Search className="h-6 w-6" />} title={t('career.noResults')} body={t('career.noResultsBody')} action={<Button variant="outline" onClick={() => setF(EMPTY)}>{t('career.clearFilters')}</Button>} />}
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
        {items.map((o) => (
          <div key={o.id}>
            <article className="card h-full">
              <div className="flex h-full flex-col p-4">
                <button type="button" onClick={() => setDetail(o)} className="flex items-start gap-3 text-start">
                  <MatchRing score={o.match?.score ?? 0} label={t('career.match')} />
                  <div className="min-w-0 flex-1">
                    <div className="line-clamp-2 font-semibold leading-snug">{o.title}</div>
                    <div className="text-sm text-muted">{o.company}</div>
                    <div className="mt-1 flex flex-wrap gap-1.5">
                      <Badge tone="brand">{oppTypeLabel(t, o.type)}</Badge>
                      {o.status !== 'demo' && <StatusPill status={o.status === 'expired' ? 'expired' : o.status} />}
                    </div>
                  </div>
                </button>
                <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted">
                  <span className="inline-flex items-center gap-1"><MapPin className="h-3.5 w-3.5" />{o.remote === 'remote' || !o.city ? t(`career.remote.${o.remote}`) : `${o.city} · ${t(`career.remote.${o.remote}`)}`}</span>
                  {o.deadline && <span className={clsx('inline-flex items-center gap-1', o.expired && 'text-danger')}><CalendarClock className="h-3.5 w-3.5" />{fmtDate(o.deadline, locale)}</span>}
                </div>
                <div className="mt-2 flex flex-wrap gap-1">
                  {o.skills.map((s) => <SkillChip key={s} tone={o.match.missing.includes(s) ? 'missing' : 'have'}>{s}</SkillChip>)}
                </div>
                <ul className="mt-2 space-y-0.5 text-xs text-muted">
                  {(o.match.explain ?? o.match.reasons.map((r) => ({ key: r, params: {}, text: r }))).slice(0, 2).map((r) => <li key={r.key + r.text} className="flex gap-1.5"><Sparkles className="mt-0.5 h-3 w-3 shrink-0 text-brand-600" aria-hidden />{explainText(t, r)}</li>)}
                  {o.match.missing.length > 0 && <li className="text-warn">{t('career.missingSkills')}: {o.match.missing.join(', ')}</li>}
                </ul>
                <div className="mt-2"><EligibilityBadge eligible={o.match.eligible} note={o.match.eligibility ? explainText(t, o.match.eligibility) : o.match.eligibility_note} /></div>
                <div className="mt-auto flex flex-wrap items-center gap-2 pt-3">
                  <Button size="sm" variant="outline" className={clsx(o.saved && 'border-brand-500 bg-brand-50 text-brand-700 dark:bg-brand-900/30 dark:text-brand-200')} loading={busy === o.id} icon={o.saved ? <BookmarkCheck className="h-4 w-4" aria-hidden /> : <Bookmark className="h-4 w-4" aria-hidden />} onClick={() => void save(o)} aria-pressed={o.saved}>{o.saved ? t('career.saved') : t('career.save')}</Button>
                  {o.applicationId
                    ? <ButtonLink size="sm" variant="ghost" to={`/career/applications/${o.applicationId}`} icon={<ClipboardCheck className="h-4 w-4" aria-hidden />}>{t('career.openTracker')}</ButtonLink>
                    : <Button size="sm" variant="ghost" disabled={o.expired} loading={busy === o.id} icon={<ClipboardCheck className="h-4 w-4" aria-hidden />} onClick={() => void track(o)}>{t('career.track')}</Button>}
                </div>
              </div>
            </article>
          </div>
        ))}
      </div>

      <OpportunityDrawer o={detail} onClose={closeDetail} onSave={(o) => void save(o)} onTrack={(o) => void track(o)} busy={busy} />
      <ImportDialog open={importOpen} onClose={() => setImportOpen(false)} />
    </div>
  );
}

function OpportunityDrawer({ o, onClose, onSave, onTrack, busy }: { o: Opportunity | null; onClose: () => void; onSave: (o: Opportunity) => void; onTrack: (o: Opportunity) => void; busy: string | null }) {
  const { t, locale } = useI18n();
  const nav = useNavigate();
  return (
    <Modal open={!!o} onClose={onClose} title={o?.title ?? ''} description={o ? `${o.company} · ${oppTypeLabel(t, o.type)}` : ''} size="lg" footer={o && (
      <>
        {o.url && <a href={o.url} target="_blank" rel="noreferrer" className="me-auto inline-flex items-center gap-1 text-sm text-brand-600 hover:underline min-h-11"><ExternalLink className="h-4 w-4" />{t('career.sourceLink')}</a>}
        <Button variant="outline" loading={busy === o.id} onClick={() => onSave(o)}>{o.saved ? t('career.unsave') : t('career.save')}</Button>
        {o.applicationId ? <Button onClick={() => { onClose(); nav(`/career/applications/${o.applicationId}`); }}>{t('career.openTracker')}</Button> : <Button disabled={o.expired} loading={busy === o.id} onClick={() => onTrack(o)}>{t('career.track')}</Button>}
      </>
    )}>
      {o && (
        <div className="space-y-4">
          <div className="flex flex-wrap items-start gap-4">
            <MatchRing score={o.match?.score ?? 0} size={72} label={t('career.match')} />
            <div className="min-w-0 flex-1 space-y-1 text-sm">
              <div className="font-semibold">{t('career.whyMatch')}</div>
              <ul className="list-disc space-y-0.5 ps-5 text-muted">{(o.match.explain ?? []).map((r) => <li key={r.key + r.text}>{explainText(t, r)}</li>)}{!(o.match.explain ?? []).length && <li>{t('career.noReasons')}</li>}</ul>
              {o.match.missing.length > 0 && <div className="text-warn">{t('career.missingSkills')}: {o.match.missing.join(', ')}</div>}
              {o.match.breakdown && <dl className="mt-2 grid grid-cols-2 gap-x-4 gap-y-1 sm:grid-cols-3">{o.match.breakdown.map((b) => <div key={b.key} className="flex justify-between gap-2"><dt className="text-muted">{t(`career.breakdown.${b.key}`)}</dt><dd className="num font-medium">{b.points}/{b.max}</dd></div>)}</dl>}
              <div className="pt-1"><EligibilityBadge eligible={o.match.eligible} note={o.match.eligibility ? explainText(t, o.match.eligibility) : o.match.eligibility_note} /></div>
              {o.match.eligible !== null && o.match.eligibility && <p className="text-sm text-muted">{explainText(t, o.match.eligibility)}</p>}
            </div>
          </div>
          <Callout tone="info" title={t('career.recommendationNote')}>{t('career.recommendationBody')}</Callout>
          <p className="text-sm leading-relaxed">{o.description}</p>
          <dl className="grid grid-cols-1 gap-x-6 gap-y-2 text-sm sm:grid-cols-2">
            <div><dt className="text-muted">{t('common.location')}</dt><dd className="font-medium">{o.location || o.city || '—'} · {t(`career.remote.${o.remote}`)}</dd></div>
            <div><dt className="text-muted">{t('career.deadline')}</dt><dd className={clsx('font-medium', o.expired && 'text-danger')}>{o.deadline ? fmtDate(o.deadline, locale) : t('career.noDeadline')}{o.expired && ` · ${t('status.expired')}`}</dd></div>
            <div><dt className="text-muted">{t('career.eligibility')}</dt><dd className="font-medium">{o.eligibility || '—'}</dd></div>
            <div><dt className="text-muted">{t('career.salary')}</dt><dd className="font-medium">{o.salary ?? '—'}</dd></div>
            <div><dt className="text-muted">{t('career.posted')}</dt><dd className="font-medium">{fmtDate(o.posted_at, locale)} · {t('career.lastChecked')} {fmtDate(o.last_checked_at, locale)}</dd></div>
            <div><dt className="text-muted">{t('career.source')}</dt><dd className="font-medium">{o.source} <StatusPill status={o.status} className="ms-1" /></dd></div>
          </dl>
          <div className="flex flex-wrap gap-1">{o.skills.map((s) => <SkillChip key={s} tone={o.match.missing.includes(s) ? 'missing' : 'have'}>{s}</SkillChip>)}</div>
        </div>
      )}
    </Modal>
  );
}

function ImportDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { t } = useI18n();
  const toast = useToast();
  const [url, setUrl] = useState('');
  const [title, setTitle] = useState('');
  const [company, setCompany] = useState('');
  const [err, setErr] = useState<string | null>(null);
  const [dup, setDup] = useState<Opportunity | null>(null);
  const [loading, setLoading] = useState(false);
  const submit = async () => {
    setErr(null); setDup(null); setLoading(true);
    try {
      const r = await api<{ duplicate: boolean; opportunity: Opportunity; message?: string }>('/career/opportunities/import', { body: { url, title: title || undefined, company: company || undefined } });
      if (r.duplicate) { setDup(r.opportunity); return; }
      toast.success(t('career.importOk'));
      refreshAll('career');
      setUrl(''); setTitle(''); setCompany('');
      onClose();
    } catch (e) { setErr(errorMessage(e)); } finally { setLoading(false); }
  };
  return (
    <Modal open={open} onClose={onClose} title={t('career.addLink')} description={t('career.addLinkBody')} size="sm" footer={<><Button variant="ghost" onClick={onClose}>{t('common.cancel')}</Button><Button loading={loading} disabled={!url.trim()} onClick={() => void submit()}>{t('career.import')}</Button></>}>
      <form className="space-y-3" onSubmit={(e) => { e.preventDefault(); void submit(); }}>
        <Field label="URL" required error={err}><Input value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://careers.example.sa/…" autoFocus /></Field>
        <Field label={t('career.titleField')} hint={t('common.optional')}><Input value={title} onChange={(e) => setTitle(e.target.value)} /></Field>
        <Field label={t('career.company')} hint={t('common.optional')}><Input value={company} onChange={(e) => setCompany(e.target.value)} /></Field>
        {dup && <Callout tone="warn" title={t('career.duplicate')}>{t('career.duplicateBody', { title: dup.title, company: dup.company })}</Callout>}
        <p className="text-xs text-muted">{t('career.importNote')}</p>
      </form>
    </Modal>
  );
}
