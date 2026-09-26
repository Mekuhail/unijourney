import { useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router';
import { PackageSearch, CheckCircle2, ShieldCheck, XCircle, Search, Paperclip, Mail, Plus, Link2 } from 'lucide-react';
import clsx from 'clsx';
import { useI18n } from '@/i18n';
import { useQuery } from '@/lib/useQuery';
import { api, errorMessage } from '@/lib/api';
import { refreshAll } from '@/lib/bus';
import { useToast } from '@/components/ui/toast';
import { PageHeader } from '@/components/ui/PageHeader';
import { Badge, Button, Callout, Card, ConfirmDialog, EmptyState, ErrorState, Field, Input, KeyValue, Modal, SectionTitle, Select, Skeleton, StatusPill, Tabs, Textarea } from '@/components/ui';
import { fmtDate, fmtDateTime } from '@/lib/format';
import type { FoundItem, LfLocations, LostFoundRequest, MatchSuggestion } from '../types';

type DateFilter = 'today' | 'yesterday' | 'all';

function MarkFoundModal({ r, open, onClose, points }: { r: LostFoundRequest; open: boolean; onClose: () => void; points: LfLocations['collection_points'] }) {
  const { t, l } = useI18n();
  const toast = useToast();
  const [loc, setLoc] = useState(r.campus_id === 'khobar' ? 'khb_security' : 'ryd_security');
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const submit = async () => {
    setBusy(true); setError(null);
    try { await api(`/campus/security/lost-found/${r.id}/found`, { body: { collection_location_id: loc, note: note || undefined } }); toast.success(t('campus.staff.lf.foundDone')); refreshAll('campus'); onClose(); }
    catch (e) { setError(errorMessage(e)); } finally { setBusy(false); }
  };
  return (
    <Modal open={open} onClose={onClose} title={t('campus.staff.lf.modalTitle')} size="sm" description={`${r.item} · ${r.public_id}`} footer={<><Button variant="ghost" onClick={onClose}>{t('common.cancel')}</Button><Button variant="success" loading={busy} disabled={!loc} icon={<CheckCircle2 className="h-4 w-4" />} onClick={() => void submit()}>{t('campus.staff.lf.markFound')}</Button></>}>
      <div className="space-y-3">
        <Field label={t('campus.staff.lf.collectionLocation')} required hint={t('campus.staff.lf.collectionLocationHint')}>
          <Select value={loc} onChange={(e) => setLoc(e.target.value)}>{points.filter((p) => p.campus_id === r.campus_id).map((p) => <option key={p.id} value={p.id}>{l(p.name_en, p.name_ar)}</option>)}</Select>
        </Field>
        <Field label={t('campus.staff.lf.note')}><Textarea value={note} onChange={(e) => setNote(e.target.value)} className="min-h-[64px]" /></Field>
        {error && <Callout tone="danger">{error}</Callout>}
      </div>
    </Modal>
  );
}

function HandoverModal({ r, open, onClose }: { r: LostFoundRequest; open: boolean; onClose: () => void }) {
  const { t, l } = useI18n();
  const toast = useToast();
  const [verifiedBy, setVerifiedBy] = useState<'student_id_card' | 'request_id_and_id'>('student_id_card');
  const [confirmed, setConfirmed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const submit = async () => {
    setBusy(true); setError(null);
    try { await api(`/campus/security/lost-found/${r.id}/handover`, { body: { verified_by: verifiedBy, receiver_name_confirmed: confirmed } }); toast.success(t('campus.staff.lf.handoverDone')); refreshAll('campus'); onClose(); }
    catch (e) { setError(errorMessage(e)); } finally { setBusy(false); }
  };
  return (
    <Modal open={open} onClose={onClose} title={t('campus.staff.lf.verifyHandover')} size="sm" description={r.owner ? `${l(r.owner.name_en, r.owner.name_ar)} · ${r.public_id}` : r.public_id} footer={<><Button variant="ghost" onClick={onClose}>{t('common.cancel')}</Button><Button loading={busy} disabled={!confirmed} icon={<ShieldCheck className="h-4 w-4" />} onClick={() => void submit()}>{t('campus.staff.lf.verifyHandover')}</Button></>}>
      <div className="space-y-3">
        <Field label={t('campus.staff.lf.handoverVerifiedBy')}><Select value={verifiedBy} onChange={(e) => setVerifiedBy(e.target.value as never)}><option value="student_id_card">{t('campus.staff.lf.idCard')}</option><option value="request_id_and_id">{t('campus.staff.lf.requestIdAndId')}</option></Select></Field>
        <label className="flex items-start gap-2 text-sm"><input type="checkbox" checked={confirmed} onChange={(e) => setConfirmed(e.target.checked)} className="mt-1 h-4 w-4 accent-brand-500" /><span>{t('campus.staff.lf.receiverConfirmed')}</span></label>
        {error && <Callout tone="danger">{error}</Callout>}
      </div>
    </Modal>
  );
}

function RequestControl({ r, points }: { r: LostFoundRequest; points: LfLocations['collection_points'] }) {
  const { t, l, locale } = useI18n();
  const toast = useToast();
  const nav = useNavigate();
  const [foundOpen, setFoundOpen] = useState(false);
  const [handoverOpen, setHandoverOpen] = useState(false);
  const [closeOpen, setCloseOpen] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const act = async (path: string, body: unknown, done: string) => {
    setBusy(path);
    try { await api(`/campus/security/lost-found/${r.id}/${path}`, { body }); toast.success(done); refreshAll('campus'); setCloseOpen(false); }
    catch (e) { toast.error(errorMessage(e)); } finally { setBusy(null); }
  };
  const open = !['collected', 'closed'].includes(r.status);
  const isImage = r.document?.mime.startsWith('image/');
  return (
    <Card className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2"><div className="font-mono text-sm font-bold tracking-wider text-gold-700 dark:text-gold-300">{r.public_id}</div><StatusPill status={r.status} /></div>
      <KeyValue items={[
        { k: t('campus.lf.name'), v: r.owner ? `${l(r.owner.name_en, r.owner.name_ar)} · #${r.owner.student_no ?? ''}` : '—' },
        { k: t('campus.lf.email'), v: r.contact_email },
        { k: t('campus.lf.item'), v: <span>{r.item} <Badge tone="neutral">{t(`campus.lf.categories.${r.category}`)}</Badge></span> },
        { k: t('campus.lf.description'), v: r.description || '—' },
        { k: t('common.location'), v: r.last_location ? l(r.last_location.name_en, r.last_location.name_ar) : r.last_location_text },
        { k: t('campus.lf.dateLost'), v: fmtDate(r.lost_date, locale) },
        { k: t('campus.lf.dateReported'), v: fmtDateTime(r.created_at, locale) },
        ...(r.collection_location ? [{ k: t('campus.staff.lf.collectionLocation'), v: l(r.collection_location.name_en, r.collection_location.name_ar) }] : []),
        ...(r.handover ? [{ k: t('campus.staff.lf.handoverVerifiedBy'), v: String((r.handover as { verified_by?: string }).verified_by ?? '').replace(/_/g, ' ') }] : [])
      ]} />
      <div>
        <div className="mb-1 text-xs font-semibold uppercase tracking-wider text-muted">{t('campus.staff.lf.file')}</div>
        {r.document ? (
          <div className="space-y-2">
            {isImage && <img src={r.document.url} alt={r.document.filename} className="max-h-40 rounded-xl border border-line" />}
            <a href={r.document.url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-sm text-brand-600 hover:underline min-h-11"><Paperclip className="h-4 w-4" />{r.document.filename} · {Math.round(r.document.size / 1024)} KB</a>
          </div>
        ) : <div className="text-sm text-muted">{t('common.none')}</div>}
      </div>
      {r.matched_found_items.length > 0 && <Callout tone="info">{t('campus.lf.matchLogged')} {r.matched_found_items.map((f) => f.item).join(', ')}</Callout>}
      <div className="flex flex-wrap gap-2 border-t border-line pt-3">
        {r.status === 'reported' && <Button variant="secondary" size="sm" loading={busy === 'status'} icon={<Search className="h-4 w-4" />} onClick={() => void act('status', { status: 'searching' }, t('common.save'))}>{t('campus.staff.lf.markSearching')}</Button>}
        {open && (r.status === 'reported' || r.status === 'searching' || r.status === 'found') && <Button variant="success" size="sm" icon={<CheckCircle2 className="h-4 w-4" />} onClick={() => setFoundOpen(true)}>{t('campus.staff.lf.markFound')}</Button>}
        {(r.status === 'found' || r.status === 'ready_for_collection') && <Button size="sm" icon={<ShieldCheck className="h-4 w-4" />} onClick={() => setHandoverOpen(true)}>{t('campus.staff.lf.verifyHandover')}</Button>}
        {r.status !== 'closed' && <Button variant="outline" size="sm" icon={<XCircle className="h-4 w-4" />} onClick={() => setCloseOpen(true)}>{t('campus.staff.lf.closeRequest')}</Button>}
        {r.email_id && <Button variant="ghost" size="sm" icon={<Mail className="h-4 w-4" />} onClick={() => nav('/notifications')}>{t('campus.staff.lf.openEmail')}</Button>}
      </div>
      <ol className="space-y-1 border-s-2 border-line ps-3 text-xs">{r.timeline.map((ti, i) => <li key={i}><span className="num text-muted">{fmtDateTime(ti.at, locale)}</span> · <StatusPill status={ti.status} />{ti.note && <span className="ms-1 text-muted">{ti.note}</span>}</li>)}</ol>
      <MarkFoundModal key={`f-${r.id}`} r={r} open={foundOpen} onClose={() => setFoundOpen(false)} points={points} />
      <HandoverModal key={`h-${r.id}`} r={r} open={handoverOpen} onClose={() => setHandoverOpen(false)} />
      <ConfirmDialog open={closeOpen} onClose={() => setCloseOpen(false)} onConfirm={() => act('close', {}, t('campus.staff.lf.closedDone'))} title={t('campus.staff.lf.closeRequest')} body={r.public_id} loading={busy === 'close'} danger />
    </Card>
  );
}

function FoundItemsLog({ locations }: { locations: LfLocations }) {
  const { t, l, locale } = useI18n();
  const toast = useToast();
  const items = useQuery(() => api<FoundItem[]>('/campus/security/found-items'), [], { refreshOn: ['campus'] });
  const [openId, setOpenId] = useState<string | null>(null);
  const matches = useQuery(() => api<{ matches: MatchSuggestion[] }>(`/campus/security/found-items/${openId}/matches`), [openId], { enabled: !!openId, refreshOn: ['campus'] });
  const [logOpen, setLogOpen] = useState(false);
  const [form, setForm] = useState({ item: '', category: 'other', description: '', found_location_id: '', found_date: '2026-09-27', campus_id: 'riyadh' });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const logItem = async () => {
    setBusy(true); setError(null);
    try { await api('/campus/security/found-items', { body: { ...form, found_location_id: form.found_location_id || null } }); toast.success(t('campus.staff.lf.foundItemLogged')); refreshAll('campus'); setLogOpen(false); setForm({ item: '', category: 'other', description: '', found_location_id: '', found_date: '2026-09-27', campus_id: 'riyadh' }); }
    catch (e) { setError(errorMessage(e)); } finally { setBusy(false); }
  };
  const link = async (fiId: string, requestId: string) => {
    try { await api(`/campus/security/found-items/${fiId}/link`, { body: { requestId } }); toast.success(t('campus.staff.lf.linked')); refreshAll('campus'); }
    catch (e) { toast.error(errorMessage(e)); }
  };
  return (
    <section className="mt-8">
      <SectionTitle action={<Button size="sm" icon={<Plus className="h-4 w-4" />} onClick={() => setLogOpen(true)}>{t('campus.staff.lf.logFound')}</Button>}>{t('campus.staff.lf.foundItems')}</SectionTitle>
      {items.loading && <Skeleton className="h-24" />}
      {items.error ? <ErrorState error={items.error} onRetry={() => void items.refetch()} /> : null}
      {items.data && items.data.length === 0 && <EmptyState title={t('common.empty')} />}
      <ul className="grid grid-cols-1 gap-3 md:grid-cols-2">
        {items.data?.map((fi) => (
          <li key={fi.id} className="card p-4">
            <div className="flex flex-wrap items-center gap-2"><PackageSearch className="h-4 w-4 text-gold-500" /><span className="font-semibold">{fi.item}</span><Badge tone="neutral">{t(`campus.lf.categories.${fi.category}`)}</Badge><StatusPill status={fi.status} /></div>
            <div className="mt-1 text-xs text-muted">{t('campus.staff.lf.foundWhere')}: {fi.found_location ? l(fi.found_location.name_en, fi.found_location.name_ar) : '—'} · {t('campus.staff.lf.foundDate')}: {fmtDate(fi.found_date, locale)} · {t('campus.staff.lf.heldAt')}: {fi.held_at ? l(fi.held_at.name_en, fi.held_at.name_ar) : '—'}</div>
            {fi.description && <p className="mt-1 text-sm text-muted">{fi.description}</p>}
            {fi.matched_request && <div className="mt-2 text-xs"><Link2 className="me-1 inline h-3.5 w-3.5" />{fi.matched_request.public_id} · {fi.matched_request.item} · <StatusPill status={fi.matched_request.status} /></div>}
            {fi.status === 'held' && (
              <div className="mt-3">
                <Button size="sm" variant={openId === fi.id ? 'secondary' : 'outline'} onClick={() => setOpenId(openId === fi.id ? null : fi.id)}>{t('campus.staff.lf.suggestedMatches')} {fi.suggested_count > 0 && <Badge tone="warn">{fi.suggested_count}</Badge>}</Button>
                {openId === fi.id && (
                  <div className="mt-2 space-y-2">
                    {matches.loading && <Skeleton className="h-12" />}
                    {matches.data && matches.data.matches.length === 0 && <div className="text-xs text-muted">{t('campus.staff.lf.noMatches')}</div>}
                    {matches.data?.matches.map((m) => (
                      <div key={m.request_id} className="rounded-xl border border-line bg-surface-2 p-2.5 text-sm">
                        <div className="flex flex-wrap items-center gap-2"><span className="font-mono text-xs text-gold-700 dark:text-gold-300">{m.public_id}</span><span className="font-medium">{m.item}</span><Badge tone="warn">{t('campus.staff.lf.matchScore')} {m.score}</Badge><StatusPill status={m.status} /></div>
                        <div className="text-xs text-muted">{m.owner ? l(m.owner.name_en, m.owner.name_ar) : ''} · {m.last_location} · {fmtDate(m.lost_date, locale)} · {m.reasons.join(', ')}</div>
                        <Button size="sm" variant="outline" className="mt-2" icon={<Link2 className="h-3.5 w-3.5" />} onClick={() => void link(fi.id, m.request_id)}>{t('campus.staff.lf.link')}</Button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </li>
        ))}
      </ul>
      <Modal open={logOpen} onClose={() => setLogOpen(false)} title={t('campus.staff.lf.logFound')} size="sm" footer={<><Button variant="ghost" onClick={() => setLogOpen(false)}>{t('common.cancel')}</Button><Button loading={busy} disabled={form.item.length < 2} onClick={() => void logItem()}>{t('common.save')}</Button></>}>
        <div className="space-y-3">
          <Field label={t('campus.lf.item')} required><Input value={form.item} onChange={(e) => setForm({ ...form, item: e.target.value })} /></Field>
          <div className="grid grid-cols-2 gap-2">
            <Field label={t('campus.lf.category')}><Select value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })}>{locations.categories.map((c) => <option key={c} value={c}>{t(`campus.lf.categories.${c}`)}</option>)}</Select></Field>
            <Field label={t('shell.campus')}><Select value={form.campus_id} onChange={(e) => setForm({ ...form, campus_id: e.target.value, found_location_id: '' })}><option value="riyadh">{t('shell.riyadh')}</option><option value="khobar">{t('shell.khobar')}</option></Select></Field>
          </div>
          <Field label={t('campus.staff.lf.foundWhere')}><Select value={form.found_location_id} onChange={(e) => setForm({ ...form, found_location_id: e.target.value })}><option value="">—</option>{locations.locations.filter((x) => x.campus_id === form.campus_id).map((x) => <option key={x.id} value={x.id}>{l(x.name_en, x.name_ar)}</option>)}</Select></Field>
          <Field label={t('campus.staff.lf.foundDate')}><Input type="date" value={form.found_date} onChange={(e) => setForm({ ...form, found_date: e.target.value })} /></Field>
          <Field label={t('campus.lf.description')}><Textarea value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} className="min-h-[64px]" /></Field>
          {error && <Callout tone="danger">{error}</Callout>}
        </div>
      </Modal>
    </section>
  );
}

export function LostFoundDesk() {
  const { t, l, locale } = useI18n();
  const [params, setParams] = useSearchParams();
  const date = (params.get('date') as DateFilter) || 'today';
  const status = params.get('status') ?? '';
  const selectedId = params.get('request');
  const list = useQuery(() => api<{ items: LostFoundRequest[]; counts: { today: number; yesterday: number; all: number; open: number } }>('/campus/security/lost-found', { query: { date, status } }), [date, status], { refreshOn: ['campus'] });
  const locations = useQuery(() => api<LfLocations>('/campus/lost-found/locations'), []);
  const selected = useQuery(() => api<LostFoundRequest>(`/campus/security/lost-found/${selectedId}`), [selectedId], { enabled: !!selectedId, refreshOn: ['campus'] });
  const setQ = (patch: Record<string, string | null>) => { const p = new URLSearchParams(params); for (const [k, v] of Object.entries(patch)) { if (v) p.set(k, v); else p.delete(k); } setParams(p, { replace: true }); };
  return (
    <div>
      <PageHeader eyebrow={`${t('nav.staff')} · YU Claimed`} title={t('campus.staff.lf.title')} subtitle={t('campus.staff.lf.subtitle')} />
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[1fr_420px]">
        <section>
          <SectionTitle>{t('campus.staff.lf.recent')}</SectionTitle>
          <div className="mb-3 flex flex-col gap-2 sm:flex-row sm:items-center">
            <Tabs value={date} onChange={(v) => setQ({ date: v })} items={[{ value: 'today', label: t('campus.staff.lf.today'), count: list.data?.counts.today }, { value: 'yesterday', label: t('campus.staff.lf.yesterday'), count: list.data?.counts.yesterday }, { value: 'all', label: t('campus.staff.lf.all'), count: list.data?.counts.all }]} />
            <Select value={status} onChange={(e) => setQ({ status: e.target.value || null })} className="sm:w-56" aria-label={t('common.status')}><option value="">{t('common.status')}: {t('common.all')}</option>{['reported', 'searching', 'found', 'ready_for_collection', 'collected', 'closed'].map((s) => <option key={s} value={s}>{t(`status.${s}`)}</option>)}</Select>
          </div>
          {list.loading && <Skeleton className="h-40" />}
          {list.error ? <ErrorState error={list.error} onRetry={() => void list.refetch()} /> : null}
          {list.data && list.data.items.length === 0 && <EmptyState title={t('campus.staff.lf.noRequests')} />}
          <ul className="space-y-2">
            {list.data?.items.map((r) => (
              <li key={r.id}>
                <button type="button" onClick={() => setQ({ request: r.id })} className={clsx('card flex w-full flex-wrap items-center gap-3 p-3 text-start transition hover:border-gold-500', selectedId === r.id && 'border-gold-500 ring-2 ring-gold-500/30')}>
                  <span className="min-w-0 flex-1"><span className="block font-semibold">{r.item}</span><span className="block text-xs text-muted">{r.owner ? l(r.owner.name_en, r.owner.name_ar) : ''} · {r.last_location ? l(r.last_location.name_en, r.last_location.name_ar) : r.last_location_text} · {fmtDateTime(r.created_at, locale)}</span></span>
                  <span className="font-mono text-xs text-gold-700 dark:text-gold-300">{r.public_id}</span>
                  <StatusPill status={r.status} />
                </button>
              </li>
            ))}
          </ul>
          {locations.data && <FoundItemsLog locations={locations.data} />}
        </section>
        <aside>
          <SectionTitle>{t('campus.staff.lf.control')}</SectionTitle>
          {!selectedId && <EmptyState icon={<PackageSearch className="h-6 w-6" />} title={t('campus.staff.lf.selectRequest')} />}
          {selectedId && selected.loading && <Skeleton className="h-64" />}
          {selected.error ? <ErrorState error={selected.error} onRetry={() => void selected.refetch()} /> : null}
          {selected.data && locations.data && <RequestControl r={selected.data} points={locations.data.collection_points} />}
        </aside>
      </div>
    </div>
  );
}
