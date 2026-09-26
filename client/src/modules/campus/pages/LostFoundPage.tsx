import { PageHeader } from '@/components/ui/PageHeader';
import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router';
import { Search, FilePlus2, ListChecks, CheckCircle2, Route, Mail, ArrowLeft, Paperclip, ShieldCheck } from 'lucide-react';
import clsx from 'clsx';
import { useI18n } from '@/i18n';
import { placeName } from '../map/style';
import { useQuery } from '@/lib/useQuery';
import { api, apiUpload, errorMessage } from '@/lib/api';
import { refreshAll } from '@/lib/bus';
import { useSession } from '@/lib/session';
import { useTheme } from '@/lib/theme';
import { usePageTitle } from '@/lib/usePageTitle';
import { Badge, Button, Callout, Card, CopyId, EmptyState, ErrorState, Field, Input, Select, Skeleton, StatusPill, Tabs, Textarea } from '@/components/ui';
import { fmtDate, fmtDateTime } from '@/lib/format';
import type { DocumentMeta } from '@shared/types';
import type { LfLocations, LostFoundMinimal, LostFoundRequest } from '../types';

type Tab = 'new' | 'status' | 'mine';
const STEPS = ['reported', 'searching', 'found', 'ready_for_collection', 'collected'];

export function LfHero() {
  const { t } = useI18n();
  usePageTitle(t('campus.lf.title'));
  return (
    <>
      <div className="mb-6 rounded-3xl border border-line bg-ink-900 p-6 text-white sm:p-8">
        <h1 tabIndex={-1} className="text-3xl font-bold tracking-tight sm:text-4xl">{t('campus.lf.tagline')}</h1>
        <p className="mt-2 max-w-[70ch] text-sm text-white/80">{t('campus.lf.subtitle')}</p>
        <p className="mt-4 inline-flex items-center gap-2 rounded-full bg-white/10 px-3 py-1 text-sm font-semibold text-gold-300">YU Claimed</p>
      </div>
    </>
  );
}

function StatusSteps({ status }: { status: string }) {
  const { t } = useI18n();
  const idx = status === 'closed' ? STEPS.length : STEPS.indexOf(status);
  return (
    <ol className="flex flex-wrap gap-1.5 text-xs">
      {STEPS.map((s, i) => <li key={s} className={clsx('rounded-full border px-2 py-0.5', i <= idx ? 'border-gold-500 bg-gold-100 text-gold-700 dark:bg-gold-700/30 dark:text-gold-300' : 'border-line text-muted')}>{t(`status.${s}`)}</li>)}
      {status === 'closed' && <li className="rounded-full border border-line px-2 py-0.5 text-muted">{t('status.closed')}</li>}
    </ol>
  );
}

export function RequestDetails({ r }: { r: LostFoundRequest }) {
  const { t, l, locale } = useI18n();
  const ln = (en: string, ar?: string | null) => placeName(l(en, ar));
  const nav = useNavigate();
  const found = r.status === 'found' || r.status === 'ready_for_collection';
  const rows: Array<[string, React.ReactNode]> = [
    [t('campus.lf.requestId'), <CopyId key="id" value={r.public_id} />],
    [t('campus.lf.name'), r.owner ? ln(r.owner.name_en, r.owner.name_ar) : '—'],
    [t('campus.lf.item'), <span key="item">{r.item} <Badge tone="neutral">{t(`campus.lf.categories.${r.category}`)}</Badge></span>],
    [t('campus.lf.description'), r.description || '—'],
    [t('common.location'), r.last_location ? l(r.last_location.name_en, r.last_location.name_ar) : r.last_location_text],
    [t('campus.lf.dateLost'), fmtDate(r.lost_date, locale)],
    [t('common.status'), <StatusPill key="st" status={r.status} />],
    [t('campus.lf.dateReported'), fmtDateTime(r.created_at, locale)],
    ...(r.document ? [[t('campus.lf.attachment'), <a key="doc" href={r.document.url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-brand-600 hover:underline touch:min-h-11"><Paperclip className="h-3.5 w-3.5" />{r.document.filename}</a>] as [string, React.ReactNode]] : [])
  ];
  return (
    <div className="space-y-4">
      {found && r.collection_location && (
        <div className="rounded-2xl border border-success/40 bg-success/10 p-4">
          <div className="flex items-center gap-2 font-semibold text-success"><CheckCircle2 className="h-5 w-5" />{t('campus.lf.foundBanner')}</div>
          <div className="mt-1 text-sm">{t('campus.lf.foundBannerBody')} <strong>{l(r.collection_location.name_en, r.collection_location.name_ar)}</strong></div>
          {r.collection_note && <div className="mt-1 text-xs text-muted">{t('campus.lf.securityNote')}: {r.collection_note}</div>}
          <div className="mt-1 text-xs text-muted">{t('campus.lf.bring')}</div>
          <div className="mt-3 flex flex-wrap gap-2">
            <Button size="sm" variant="success" icon={<Route className="h-4 w-4" />} onClick={() => nav(r.map_link ?? `/campus/map?to=${r.collection_location_id}`)}>{t('campus.lf.routeToCollection')}</Button>
            {r.email_id && <Button size="sm" variant="outline" icon={<Mail className="h-4 w-4" />} onClick={() => nav('/notifications')}>{t('campus.lf.emailPreview')}</Button>}
          </div>
        </div>
      )}
      {r.status === 'searching' && <Callout tone="info">{t('campus.lf.searchingBody')}</Callout>}
      {r.status === 'collected' && <Callout tone="success" icon={<ShieldCheck className="h-4 w-4 text-success" />}>{t('campus.lf.collected')}</Callout>}
      {r.status === 'closed' && <Callout tone="info">{t('campus.lf.closed')}</Callout>}
      <StatusSteps status={r.status} />
      <div className="overflow-x-auto rounded-2xl border border-line">
        <table className="w-full text-sm">
          <caption className="sr-only">{t('campus.lf.details')}</caption>
          <tbody>
            {rows.map(([k, v], i) => <tr key={i} className="border-b border-line last:border-0"><th scope="row" className="w-40 bg-surface-2 px-3 py-2 text-start text-xs font-semibold text-muted">{k}</th><td className="px-3 py-2">{v}</td></tr>)}
          </tbody>
        </table>
      </div>
      <div>
        <div className="mb-1.5 text-xs font-semiboldr text-muted">{t('campus.lf.timeline')}</div>
        <ol className="space-y-1.5 border-s border-line ps-4">
          {r.timeline.map((ti, i) => <li key={i} className="text-sm"><span className="num text-xs text-muted">{fmtDateTime(ti.at, locale)}</span> · <StatusPill status={ti.status} />{ti.note && <span className="ms-2 text-muted">{ti.note}</span>}</li>)}
        </ol>
      </div>
    </div>
  );
}

function NewRequestForm({ onSubmitted }: { onSubmitted: (r: LostFoundRequest) => void }) {
  const { t, l } = useI18n();
  const ln = (en: string, ar?: string | null) => placeName(l(en, ar));
  const { user } = useSession();
  const [form, setForm] = useState({ item: '', category: 'other', lost_date: '2026-09-26', last_location_id: '', last_location_text: '', contact_email: user?.email ?? '', description: '' });
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const locs = useQuery(() => api<LfLocations>('/campus/lost-found/locations'), []);
  useEffect(() => { if (user?.email && !form.contact_email) setForm((f) => ({ ...f, contact_email: user.email })); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [user?.email]);
  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true); setError(null);
    try {
      let documentId: string | undefined;
      if (file) documentId = (await apiUpload<DocumentMeta>('/documents', file, { kind: 'lost_item', label: form.item })).id;
      const r = await api<LostFoundRequest>('/campus/lost-found', { body: { item: form.item, category: form.category, lost_date: form.lost_date, last_location_id: form.last_location_id || null, last_location_text: form.last_location_text || undefined, contact_email: form.contact_email, description: form.description, documentId } });
      refreshAll('campus'); onSubmitted(r);
    } catch (err) { setError(errorMessage(err)); } finally { setBusy(false); }
  };
  const campusLocs = (locs.data?.locations ?? []).filter((x) => !user || x.campus_id === user.campus_id);
  return (
    <form onSubmit={(e) => void submit(e)} className="grid grid-cols-1 gap-3 sm:grid-cols-2">
      <Field label={t('campus.lf.name')}><Input value={user ? ln(user.name_en, user.name_ar) : ''} readOnly disabled /></Field>
      <Field label={t('campus.lf.item')} required><Input value={form.item} onChange={(e) => setForm({ ...form, item: e.target.value })} placeholder="Black backpack" /></Field>
      <Field label={t('campus.lf.category')}><Select value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })}>{(locs.data?.categories ?? ['other']).map((c) => <option key={c} value={c}>{t(`campus.lf.categories.${c}`)}</option>)}</Select></Field>
      <Field label={t('campus.lf.dateLost')} required><Input type="date" value={form.lost_date} max="2026-09-27" onChange={(e) => setForm({ ...form, lost_date: e.target.value })} /></Field>
      <Field label={t('campus.lf.lastPlace')}><Select value={form.last_location_id} onChange={(e) => setForm({ ...form, last_location_id: e.target.value })}><option value="">—</option>{campusLocs.map((x) => <option key={x.id} value={x.id}>{ln(x.name_en, x.name_ar)}</option>)}</Select></Field>
      <Field label={t('campus.lf.lastPlaceOther')}><Input value={form.last_location_text} onChange={(e) => setForm({ ...form, last_location_text: e.target.value })} /></Field>
      <Field label={t('campus.lf.email')} required><Input type="email" value={form.contact_email} onChange={(e) => setForm({ ...form, contact_email: e.target.value })} /></Field>
      <Field label={t('campus.lf.photo')}><input type="file" accept="image/png,image/jpeg,application/pdf" onChange={(e) => setFile(e.target.files?.[0] ?? null)} className="block min-h-11 w-full text-sm file:me-3 file:rounded-lg file:border-0 file:bg-gold-500 file:px-3 file:py-2 file:text-sm file:font-medium file:text-white" /></Field>
      <Field label={t('campus.lf.description')} className="sm:col-span-2"><Textarea value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} placeholder="Colour, brand, contents, distinguishing marks…" /></Field>
      {error && <div className="sm:col-span-2"><Callout tone="danger">{error}</Callout></div>}
      <div className="sm:col-span-2"><Button type="submit" variant="gold" size="lg" loading={busy} disabled={form.item.trim().length < 2 || (!form.last_location_id && !form.last_location_text.trim())}>{t('campus.lf.submit')}</Button></div>
    </form>
  );
}

function SuccessPanel({ r, onCheck }: { r: LostFoundRequest; onCheck: () => void }) {
  const { t } = useI18n();
  return (
    <div className="rounded-3xl border border-gold-500/50 bg-gold-100/50 p-6 text-center dark:bg-gold-700/15">
      <CheckCircle2 className="mx-auto h-10 w-10 text-success" />
      <div className="mt-2 text-xl font-bold">{t('campus.lf.success')}</div>
      <div className="mt-1 text-sm text-muted">{t('campus.lf.successBody')}</div>
      <div className="mt-3 flex justify-center"><CopyId value={r.public_id} className="text-lg" /></div>
      <div className="mt-2 text-xs text-muted">{t('campus.lf.keepId')}</div>
      <div className="mt-4 flex flex-wrap justify-center gap-2"><Button variant="gold" onClick={onCheck}>{t('campus.lf.checkStatus')}</Button><Link to={`/campus/lost-found/${r.id}`} className="inline-flex h-10 items-center rounded-xl border border-line px-4 text-sm font-medium hover:border-brand-400 min-h-11">{t('common.details')}</Link></div>
    </div>
  );
}

function StatusLookup({ initialId }: { initialId: string }) {
  const { t, locale } = useI18n();
  const [id, setId] = useState(initialId);
  const [result, setResult] = useState<LostFoundRequest | LostFoundMinimal | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const lookup = async (pid = id) => {
    if (!pid.trim()) return;
    setBusy(true); setError(null); setResult(null);
    try { setResult(await api<LostFoundRequest | LostFoundMinimal>(`/campus/lost-found/status/${encodeURIComponent(pid.trim())}`)); }
    catch (e) { setError(errorMessage(e)); } finally { setBusy(false); }
  };
  useEffect(() => { if (initialId) { setId(initialId); void lookup(initialId); } /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [initialId]);
  return (
    <div className="space-y-4">
      <form onSubmit={(e) => { e.preventDefault(); void lookup(); }} className="flex flex-col gap-2 sm:flex-row">
        <Input value={id} onChange={(e) => setId(e.target.value.toUpperCase())} placeholder="YU-XXXX-XXXXX" aria-label={t('campus.lf.enterId')} className="font-mono tracking-wider sm:flex-1" />
        <Button type="submit" variant="gold" loading={busy} icon={<Search className="h-4 w-4" />}>{t('campus.lf.lookup')}</Button>
      </form>
      <div className="text-xs text-muted">{t('campus.lf.idFormat')}</div>
      {error && <Callout tone="danger">{error}</Callout>}
      {result && 'restricted' in result && (
        <Card><Callout tone="warn">{t('campus.lf.restricted')}</Callout><div className="mt-3 flex items-center gap-3 text-sm"><CopyId value={result.public_id} /><StatusPill status={result.status} /><span className="num text-xs text-muted">{fmtDateTime(result.updated_at, locale)}</span></div></Card>
      )}
      {result && !('restricted' in result) && <Card><div className="mb-3 text-sm font-semiboldr text-muted">{t('campus.lf.details')}</div><RequestDetails r={result} /></Card>}
    </div>
  );
}

export function LostFoundPage() {
  const { t, l, locale } = useI18n();
  const ln = (en: string, ar?: string | null) => placeName(l(en, ar));
  const [params, setParams] = useSearchParams();
  const tab = (params.get('tab') as Tab) || 'new';
  const [submitted, setSubmitted] = useState<LostFoundRequest | null>(null);
  const mine = useQuery(() => api<LostFoundRequest[]>('/campus/lost-found/mine'), [], { refreshOn: ['campus'], enabled: tab === 'mine' });
  const setTab = (v: Tab, id?: string) => { const p = new URLSearchParams(params); p.set('tab', v); if (id) p.set('id', id); else p.delete('id'); setParams(p, { replace: true }); };
  return (
    <div>
      <LfHero />
      <Tabs value={tab} onChange={(v) => setTab(v)} className="mb-4 w-fit max-w-full" items={[{ value: 'new', label: t('campus.lf.tabNew'), icon: <FilePlus2 className="h-4 w-4" /> }, { value: 'status', label: t('campus.lf.tabStatus'), icon: <Search className="h-4 w-4" /> }, { value: 'mine', label: t('campus.lf.tabMine'), icon: <ListChecks className="h-4 w-4" /> }]} />
      {tab === 'new' && (submitted ? <SuccessPanel r={submitted} onCheck={() => { setTab('status', submitted.public_id); }} /> : <Card><NewRequestForm onSubmitted={setSubmitted} /></Card>)}
      {tab === 'status' && <StatusLookup initialId={params.get('id') ?? ''} />}
      {tab === 'mine' && (
        <div className="space-y-2">
          {mine.loading && <Skeleton className="h-32" />}
          {mine.error ? <ErrorState error={mine.error} onRetry={() => void mine.refetch()} /> : null}
          {mine.data && mine.data.length === 0 && <EmptyState title={t('campus.lf.noRequests')} action={<Button variant="gold" onClick={() => setTab('new')}>{t('campus.lf.newRequest')}</Button>} />}
          {mine.data?.map((r) => (
            <Link key={r.id} to={`/campus/lost-found/${r.id}`} className="card flex flex-wrap items-center gap-3 p-4 transition hover:border-gold-500">
              <span className="min-w-0 flex-1"><span className="block font-semibold">{r.item}</span><span className="block text-xs text-muted">{r.last_location ? l(r.last_location.name_en, r.last_location.name_ar) : r.last_location_text} · {fmtDate(r.lost_date, locale)}</span></span>
              <span className="font-mono text-xs text-gold-700 dark:text-gold-300">{r.public_id}</span>
              <StatusPill status={r.status} />
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}

export function LostFoundDetailPage() {
  const { id } = useParams();
  const { t } = useI18n();
  const q = useQuery(() => api<LostFoundRequest>(`/campus/lost-found/${id}`), [id], { refreshOn: ['campus'] });
  return (
    <div>
      <PageHeader crumbs={[{ to: '/campus/lost-found?tab=mine', label: t('nav.lostFound') }]} title={t('campus.lf.details')} />
      {q.loading && <Skeleton className="h-64" />}
      {q.error ? <ErrorState error={q.error} onRetry={() => void q.refetch()} /> : null}
      {q.data && <Card><RequestDetails r={q.data} /></Card>}
    </div>
  );
}

