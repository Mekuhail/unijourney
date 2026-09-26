import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router';
import { motion } from 'motion/react';
import { Bookmark, BookmarkCheck, ExternalLink, Link2, RefreshCw, Search, MapPin, CalendarClock, ClipboardCheck, Sparkles } from 'lucide-react';
import clsx from 'clsx';
import SpotlightCard from '@/components/reactbits/SpotlightCard';
import { Badge, Button, Callout, EmptyState, ErrorState, Field, Input, Modal, Select, Skeleton, StatusPill, Toggle } from '@/components/ui';
import { useToast } from '@/components/ui/toast';
import { useI18n } from '@/i18n';
import { api, errorMessage } from '@/lib/api';
import { refreshAll } from '@/lib/bus';
import { useQuery } from '@/lib/useQuery';
import { fmtDate } from '@/lib/format';
import { MatchRing, SkillChip, EligibilityBadge } from './ui';
import { TYPE_LABEL, type OppList, type Opportunity } from './types';

interface Filters { q: string; type: string; city: string; remote: string; field: string; skill: string; deadlineBefore: string; includeExpired: boolean; saved: boolean }
const EMPTY: Filters = { q: '', type: '', city: '', remote: '', field: '', skill: '', deadlineBefore: '', includeExpired: false, saved: false };

export function Discover() {
  const { t, locale } = useI18n();
  const toast = useToast();
  const nav = useNavigate();
  const [f, setF] = useState<Filters>(EMPTY);
  const [detail, setDetail] = useState<Opportunity | null>(null);
  const [importOpen, setImportOpen] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const q = useQuery(() => api<OppList>('/career/opportunities', { query: { q: f.q, type: f.type, city: f.city, remote: f.remote, field: f.field, skill: f.skill, deadlineBefore: f.deadlineBefore, includeExpired: f.includeExpired ? '1' : '', saved: f.saved ? '1' : '' } }), [JSON.stringify(f)], { refreshOn: ['career'] });
  const facets = q.data?.facets;
  const active = useMemo(() => Object.entries(f).filter(([k, v]) => v && k !== 'q').length, [f]);

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
      <div className="card p-4">
        <div className="flex flex-col gap-3 md:flex-row md:items-end">
          <Field label={t('common.search')} className="flex-1">
            <div className="relative"><Search className="pointer-events-none absolute start-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" /><Input value={f.q} onChange={(e) => setF({ ...f, q: e.target.value })} placeholder={t('career.searchPlaceholder')} className="ps-9" /></div>
          </Field>
          <Field label={t('career.type')}><Select value={f.type} onChange={(e) => setF({ ...f, type: e.target.value })}><option value="">{t('common.all')}</option>{facets?.types.map((x) => <option key={x} value={x}>{TYPE_LABEL[x] ?? x}</option>)}</Select></Field>
          <Field label={t('career.city')}><Select value={f.city} onChange={(e) => setF({ ...f, city: e.target.value })}><option value="">{t('common.all')}</option>{facets?.cities.filter(Boolean).map((x) => <option key={x} value={x}>{x}</option>)}</Select></Field>
          <Field label={t('career.remote')}><Select value={f.remote} onChange={(e) => setF({ ...f, remote: e.target.value })}><option value="">{t('common.all')}</option>{facets?.remote.map((x) => <option key={x} value={x}>{t(`career.remote.${x}`)}</option>)}</Select></Field>
          <Field label={t('career.field')}><Select value={f.field} onChange={(e) => setF({ ...f, field: e.target.value })}><option value="">{t('common.all')}</option>{facets?.fields.filter(Boolean).map((x) => <option key={x} value={x}>{x}</option>)}</Select></Field>
          <Field label={t('career.deadlineBefore')}><Input type="date" value={f.deadlineBefore} onChange={(e) => setF({ ...f, deadlineBefore: e.target.value })} /></Field>
        </div>
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <span className="text-xs font-semibold uppercase tracking-wide text-muted">{t('career.skills')}:</span>
          {(facets?.skills ?? []).slice(0, 18).map((s) => (
            <button key={s} type="button" onClick={() => setF({ ...f, skill: f.skill === s ? '' : s })} className={clsx('rounded-lg border px-2 py-0.5 text-[11px] font-medium transition', f.skill === s ? 'border-brand-500 bg-brand-500 text-white' : 'border-line bg-surface-2 hover:border-brand-400')}>{s}</button>
          ))}
          <div className="ms-auto flex flex-wrap items-center gap-3">
            <Toggle checked={f.saved} onChange={(v) => setF({ ...f, saved: v })} label={t('career.savedOnly')} />
            <Toggle checked={f.includeExpired} onChange={(v) => setF({ ...f, includeExpired: v })} label={t('career.includeExpired')} />
            {active > 0 && <Button size="sm" variant="ghost" onClick={() => setF(EMPTY)}>{t('career.clearFilters')}</Button>}
          </div>
        </div>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="text-sm text-muted">{q.data ? t('career.results', { n: q.data.total }) : t('common.loading')} · <Badge tone="gold">{t('common.demoData')}</Badge></div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" icon={<Link2 className="h-4 w-4" />} onClick={() => setImportOpen(true)}>{t('career.addLink')}</Button>
          <Button variant="secondary" size="sm" icon={<RefreshCw className={clsx('h-4 w-4', busy === 'feed' && 'animate-spin')} />} loading={busy === 'feed'} onClick={() => void refresh()}>{t('career.refreshFeed')}</Button>
        </div>
      </div>

      {!!q.error && <ErrorState error={q.error} onRetry={() => void q.refetch()} />}
      {q.loading && !q.data && <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">{[1, 2, 3, 4, 5, 6].map((i) => <Skeleton key={i} className="h-56" />)}</div>}
      {q.data && q.data.items.length === 0 && <EmptyState icon={<Search className="h-6 w-6" />} title={t('career.noResults')} body={t('career.noResultsBody')} action={<Button variant="outline" onClick={() => setF(EMPTY)}>{t('career.clearFilters')}</Button>} />}
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
        {q.data?.items.map((o, i) => (
          <motion.div key={o.id} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: Math.min(i, 8) * 0.04 }}>
            <SpotlightCard className={clsx('!border-line !bg-surface !p-0 h-full !rounded-[1.25rem] shadow-[var(--shadow-soft)]', o.expired && 'opacity-70')} spotlightColor="rgba(240, 118, 43, 0.18)">
              <div className="flex h-full flex-col p-4">
                <button type="button" onClick={() => setDetail(o)} className="flex items-start gap-3 text-start">
                  <MatchRing score={o.match?.score ?? 0} label={t('career.match')} />
                  <div className="min-w-0 flex-1">
                    <div className="line-clamp-2 font-semibold leading-snug">{o.title}</div>
                    <div className="text-sm text-muted">{o.company}</div>
                    <div className="mt-1 flex flex-wrap gap-1.5">
                      <Badge tone="brand">{TYPE_LABEL[o.type] ?? o.type}</Badge>
                      {o.status !== 'demo' && <StatusPill status={o.status === 'expired' ? 'expired' : o.status} />}
                      {o.demo_label && o.status === 'demo' && <Badge tone="gold">{t('status.demo')}</Badge>}
                    </div>
                  </div>
                </button>
                <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted">
                  <span className="inline-flex items-center gap-1"><MapPin className="h-3.5 w-3.5" />{o.city || '—'} · {t(`career.remote.${o.remote}`)}</span>
                  {o.deadline && <span className={clsx('inline-flex items-center gap-1', o.expired && 'text-danger')}><CalendarClock className="h-3.5 w-3.5" />{fmtDate(o.deadline, locale)}</span>}
                </div>
                <div className="mt-2 flex flex-wrap gap-1">
                  {o.skills.map((s) => <SkillChip key={s} tone={o.match.missing.includes(s) ? 'missing' : 'have'}>{s}</SkillChip>)}
                </div>
                <ul className="mt-2 space-y-0.5 text-xs text-muted">
                  {o.match.reasons.slice(0, 2).map((r) => <li key={r} className="flex gap-1.5"><Sparkles className="mt-0.5 h-3 w-3 shrink-0 text-brand-500" />{r}</li>)}
                  {o.match.missing.length > 0 && <li className="text-warn">{t('career.missingSkills')}: {o.match.missing.join(', ')}</li>}
                </ul>
                <div className="mt-auto flex items-center gap-2 pt-3">
                  <EligibilityBadge eligible={o.match.eligible} note={o.match.eligibility_note} />
                  <div className="ms-auto flex gap-1.5">
                    <Button size="sm" variant={o.saved ? 'secondary' : 'outline'} loading={busy === o.id} icon={o.saved ? <BookmarkCheck className="h-4 w-4 text-brand-500" /> : <Bookmark className="h-4 w-4" />} onClick={() => void save(o)} aria-pressed={o.saved}>{o.saved ? t('career.saved') : t('career.save')}</Button>
                    {o.applicationId ? <Button size="sm" variant="ghost" onClick={() => nav(`/career/applications/${o.applicationId}`)}>{t('career.openTracker')}</Button> : <Button size="sm" disabled={o.expired} loading={busy === o.id} icon={<ClipboardCheck className="h-4 w-4" />} onClick={() => void track(o)}>{t('career.track')}</Button>}
                  </div>
                </div>
              </div>
            </SpotlightCard>
          </motion.div>
        ))}
      </div>

      <OpportunityDrawer o={detail} onClose={() => setDetail(null)} onSave={(o) => void save(o)} onTrack={(o) => void track(o)} busy={busy} />
      <ImportDialog open={importOpen} onClose={() => setImportOpen(false)} />
    </div>
  );
}

function OpportunityDrawer({ o, onClose, onSave, onTrack, busy }: { o: Opportunity | null; onClose: () => void; onSave: (o: Opportunity) => void; onTrack: (o: Opportunity) => void; busy: string | null }) {
  const { t, locale } = useI18n();
  const nav = useNavigate();
  return (
    <Modal open={!!o} onClose={onClose} title={o?.title ?? ''} description={o ? `${o.company} · ${TYPE_LABEL[o.type] ?? o.type}` : ''} size="lg" footer={o && (
      <>
        {o.url && <a href={o.url} target="_blank" rel="noreferrer" className="me-auto inline-flex items-center gap-1 text-sm text-brand-600 hover:underline"><ExternalLink className="h-4 w-4" />{t('career.sourceLink')}</a>}
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
              <ul className="list-disc space-y-0.5 ps-5 text-muted">{o.match.reasons.map((r) => <li key={r}>{r}</li>)}{o.match.reasons.length === 0 && <li>{t('career.noReasons')}</li>}</ul>
              {o.match.missing.length > 0 && <div className="text-warn">{t('career.missingSkills')}: {o.match.missing.join(', ')}</div>}
              <div className="flex items-center gap-2 pt-1"><EligibilityBadge eligible={o.match.eligible} note={o.match.eligibility_note} /><span className="text-xs text-muted">{o.match.eligibility_note}</span></div>
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
