import { useState } from 'react';
import { Link, useSearchParams } from 'react-router';
import { AlertCircle, CheckCircle2, MessageSquareQuote } from 'lucide-react';
import { useI18n } from '@/i18n';
import { api, errorMessage } from '@/lib/api';
import { refreshAll } from '@/lib/bus';
import { useQuery } from '@/lib/useQuery';
import { fmtDate } from '@/lib/format';
import { useToast } from '@/components/ui/toast';
import { PageHeader } from '@/components/ui/PageHeader';
import { Badge, Button, Card, EmptyState, ErrorState, Field, Modal, Skeleton, Tabs, Textarea } from '@/components/ui';
import type { HeldResponse, KpiKey, StaffOverview, Ticket } from './types';
import { ALL_KPIS } from './types';
import { ActionsList } from './components';

type Tab = 'overview' | 'held' | 'help';

function ActionDialog({ target, onClose }: { target: { course_code?: string; instructor_slug?: string; label: string; kpi: KpiKey }; onClose: () => void }) {
  const { t } = useI18n();
  const toast = useToast();
  const [en, setEn] = useState('');
  const [ar, setAr] = useState('');
  const [busy, setBusy] = useState(false);
  const post = async () => {
    setBusy(true);
    try {
      await api('/feedback/staff/actions', { method: 'POST', body: { course_code: target.course_code, instructor_slug: target.instructor_slug, kpi: target.kpi, body_en: en.trim(), body_ar: ar.trim() || undefined } });
      toast.success(t('fb.staff.actionPosted'));
      refreshAll('feedback', 'notifications');
      onClose();
    } catch (e) { toast.error(errorMessage(e)); } finally { setBusy(false); }
  };
  return (
    <Modal open onClose={onClose} title={t('fb.staff.addAction')} description={`${target.label} · ${t(`fb.kpi.${target.kpi}`)}`} footer={<><Button variant="ghost" onClick={onClose}>{t('common.cancel')}</Button><Button loading={busy} disabled={en.trim().length < 10} onClick={() => void post()}>{t('fb.staff.addAction')}</Button></>}>
      <div className="space-y-3">
        <Field label={t('fb.staff.actionText')} required><Textarea rows={3} maxLength={400} value={en} onChange={(e) => setEn(e.target.value)} /></Field>
        <Field label={t('fb.staff.actionTextAr')}><Textarea rows={3} maxLength={400} dir="rtl" value={ar} onChange={(e) => setAr(e.target.value)} /></Field>
      </div>
    </Modal>
  );
}

function Overview() {
  const { t, l } = useI18n();
  const q = useQuery(() => api<StaffOverview>('/feedback/staff/overview'), [], { refreshOn: ['feedback'] });
  const [action, setAction] = useState<{ course_code?: string; instructor_slug?: string; label: string; kpi: KpiKey } | null>(null);
  const d = q.data;
  if (q.loading && !d) return <Skeleton className="h-64" />;
  if (q.error) return <ErrorState error={q.error} onRetry={() => void q.refetch()} />;
  if (!d) return null;
  const alerts = [
    ...d.alerts.map((a) => ({ key: `${a.slug}-${a.kpi}`, label: l(a.name_en, a.name_ar), to: `/feedback/instructors/${a.slug}`, kpi: a.kpi, mean: a.mean, bench: a.college_mean, n: a.n, has: a.has_action, target: { instructor_slug: a.slug, label: l(a.name_en, a.name_ar), kpi: a.kpi } })),
    ...d.course_alerts.map((a) => ({ key: `${a.code}-${a.kpi}`, label: `${a.code} · ${l(a.title_en, a.title_ar)}`, to: `/feedback/courses/${encodeURIComponent(a.code)}`, kpi: a.kpi, mean: a.mean, bench: null as number | null, n: a.n, has: a.has_action, target: { course_code: a.code, label: a.code, kpi: a.kpi } }))
  ];
  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1fr)_340px]">
      <section aria-labelledby="alerts-h" className="min-w-0">
        <h2 id="alerts-h" className="font-semibold">{t('fb.staff.alerts')}</h2>
        <p className="mb-3 text-sm text-muted">{t('fb.staff.alertsBody')}</p>
        {alerts.length === 0 && <EmptyState icon={<CheckCircle2 className="h-6 w-6" />} title={t('fb.staff.noAlerts')} />}
        <ul className="card divide-y divide-line">
          {alerts.map((a) => (
            <li key={a.key} className="flex flex-wrap items-center gap-3 p-4">
              <AlertCircle className="h-5 w-5 shrink-0 text-gold-600" aria-hidden />
              <div className="min-w-0 flex-1">
                <Link to={a.to} className="font-medium hover:underline">{a.label}</Link>
                <div className="text-xs text-muted">{t(`fb.kpi.${a.kpi}`)} · <span className="num">{a.mean.toFixed(1)}</span>{a.bench !== null ? ` · ${t('fb.benchmark', { n: a.bench.toFixed(1) })}` : ''} · {t('fb.responses', { n: a.n })}</div>
              </div>
              {a.has ? <Badge tone="success"><CheckCircle2 className="h-3 w-3" aria-hidden />{t('fb.staff.hasAction')}</Badge> : <Button size="sm" variant="outline" icon={<MessageSquareQuote className="h-4 w-4" aria-hidden />} onClick={() => setAction(a.target)}>{t('fb.staff.addAction')}</Button>}
            </li>
          ))}
        </ul>
        <h2 className="mb-1 mt-8 font-semibold">{t('fb.staff.pulse')}</h2>
        <p className="mb-3 text-sm text-muted">{t('fb.staff.pulseBody')}</p>
        {d.pulse.length === 0 ? <p className="text-sm text-muted">{t('fb.staff.noPulse')}</p> : (
          <ul className="card divide-y divide-line">
            {d.pulse.map((p) => <li key={`${p.code}-${p.instructor.slug}`} className="flex flex-wrap items-center gap-3 p-4 text-sm"><span className="num font-semibold">{p.code}</span><span className="min-w-0 flex-1 truncate">{l(p.instructor.name_en, p.instructor.name_ar)}</span><span className="text-xs text-muted">{t('fb.responses', { n: p.n })}</span><span className="num font-bold">{p.enough ? p.index : '–'}</span></li>)}
          </ul>
        )}
      </section>
      <aside className="min-w-0 space-y-4">
        <Card>
          <h2 className="mb-3 font-semibold">{t('fb.staff.byCollege')}</h2>
          <ul className="space-y-3">
            {d.by_college.map((c) => (
              <li key={c.key}>
                <div className="flex items-baseline justify-between gap-2 text-sm"><span className="min-w-0 truncate">{l(c.en, c.ar)}</span><span className="num font-semibold">{c.index ?? '–'}</span></div>
                <div className="text-xs text-muted">{t('fb.responses', { n: c.responses })}{c.response_rate !== null ? ` · ${t('fb.responseRate', { n: c.response_rate })}` : ''}</div>
              </li>
            ))}
          </ul>
        </Card>
        <ActionsList actions={d.actions.slice(0, 4)} />
      </aside>
      {action && <ActionDialog target={action} onClose={() => setAction(null)} />}
    </div>
  );
}

function Held() {
  const { t, l, locale } = useI18n();
  const toast = useToast();
  const q = useQuery(() => api<HeldResponse[]>('/feedback/staff/held'), [], { refreshOn: ['feedback'] });
  const [busy, setBusy] = useState<string | null>(null);
  const decide = async (id: string, decision: 'publish' | 'reject') => {
    setBusy(id);
    try { await api(`/feedback/staff/held/${id}`, { method: 'POST', body: { decision } }); toast.success(t(decision === 'publish' ? 'fb.staff.published' : 'fb.staff.rejected')); refreshAll('feedback'); }
    catch (e) { toast.error(errorMessage(e)); } finally { setBusy(null); }
  };
  return (
    <section aria-labelledby="held-h">
      <h2 id="held-h" className="sr-only">{t('fb.staff.tab.held')}</h2>
      <p className="mb-3 text-sm text-muted">{t('fb.staff.heldBody')}</p>
      {q.loading && !q.data && <Skeleton className="h-40" />}
      {q.error ? <ErrorState error={q.error} onRetry={() => void q.refetch()} /> : null}
      {q.data && q.data.length === 0 && <EmptyState icon={<CheckCircle2 className="h-6 w-6" />} title={t('fb.staff.noHeld')} />}
      <ul className="space-y-3">
        {q.data?.map((r) => (
          <li key={r.id} className="card p-4">
            <div className="flex flex-wrap items-center gap-2 text-sm"><span className="num font-semibold">{r.course_code}</span><span className="min-w-0 truncate">{l(r.title_en, r.title_ar)}</span><span className="text-xs text-muted">· {l(r.instructor.name_en, r.instructor.name_ar)}</span>{r.flags.map((f) => <Badge key={f} tone="warn">{t(`fb.staff.flag.${f}`)}</Badge>)}<span className="num ms-auto text-xs text-muted">{fmtDate(r.updated_at, locale)}</span></div>
            <blockquote dir="auto" className="mt-2 border-s-2 border-line ps-3 text-sm">{r.comment}</blockquote>
            <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-xs text-muted">{ALL_KPIS.map((k) => <span key={k}>{t(`fb.kpi.${k}`)} <span className="num font-semibold text-fg">{r.ratings[k]}</span></span>)}</div>
            <div className="mt-3 flex gap-2"><Button size="sm" loading={busy === r.id} onClick={() => void decide(r.id, 'publish')}>{t('fb.staff.publish')}</Button><Button size="sm" variant="outline" loading={busy === r.id} onClick={() => void decide(r.id, 'reject')}>{t('fb.staff.reject')}</Button></div>
          </li>
        ))}
      </ul>
    </section>
  );
}

function TicketRow({ tk }: { tk: Ticket }) {
  const { t, l, locale } = useI18n();
  const toast = useToast();
  const [reply, setReply] = useState('');
  const [busy, setBusy] = useState(false);
  const send = async (close: boolean) => {
    setBusy(true);
    try { await api(`/feedback/staff/tickets/${tk.id}/reply`, { method: 'POST', body: { reply: reply.trim(), close } }); toast.success(t('fb.staff.replied')); setReply(''); refreshAll('feedback'); }
    catch (e) { toast.error(errorMessage(e)); } finally { setBusy(false); }
  };
  return (
    <li className="card p-4">
      <div className="flex flex-wrap items-center gap-2"><span className="num text-xs text-muted">{tk.public_id}</span><Badge tone="neutral">{t(`fb.help.cat.${tk.category}`)}</Badge><Badge tone={tk.status === 'answered' ? 'success' : tk.status === 'open' ? 'warn' : 'neutral'} dot>{t(`fb.help.status.${tk.status}`)}</Badge><span className="num ms-auto text-xs text-muted">{fmtDate(tk.created_at, locale)}</span></div>
      <div className="mt-2 font-medium" dir="auto">{tk.subject}</div>
      {tk.requester && <div className="text-xs text-muted">{t('fb.staff.from', { name: l(tk.requester.name_en, tk.requester.name_ar) })}{tk.page ? ` · ${tk.page}` : ''}</div>}
      <p className="mt-1 text-sm" dir="auto">{tk.body}</p>
      {tk.reply && <div className="mt-3 rounded-xl bg-surface-2 p-3 text-sm"><div className="mb-1 text-xs font-semibold text-muted">{t('fb.help.reply')}</div><p dir="auto">{tk.reply}</p></div>}
      {tk.status === 'open' && (
        <div className="mt-3 space-y-2">
          <label className="sr-only" htmlFor={`reply-${tk.id}`}>{t('fb.staff.replyPlaceholder')}</label>
          <Textarea id={`reply-${tk.id}`} rows={2} value={reply} onChange={(e) => setReply(e.target.value)} placeholder={t('fb.staff.replyPlaceholder')} />
          <div className="flex flex-wrap gap-2"><Button size="sm" loading={busy} disabled={reply.trim().length < 5} onClick={() => void send(false)}>{t('fb.staff.sendReply')}</Button><Button size="sm" variant="outline" loading={busy} disabled={reply.trim().length < 5} onClick={() => void send(true)}>{t('fb.staff.closeTicket')}</Button></div>
        </div>
      )}
    </li>
  );
}

function Help() {
  const { t } = useI18n();
  const q = useQuery(() => api<Ticket[]>('/feedback/staff/tickets'), [], { refreshOn: ['feedback'] });
  return (
    <section aria-labelledby="tickets-h">
      <h2 id="tickets-h" className="sr-only">{t('fb.staff.tab.help')}</h2>
      {q.loading && !q.data && <Skeleton className="h-40" />}
      {q.error ? <ErrorState error={q.error} onRetry={() => void q.refetch()} /> : null}
      {q.data && q.data.length === 0 && <EmptyState title={t('fb.staff.noTickets')} />}
      <ul className="space-y-3">{q.data?.map((tk) => <TicketRow key={tk.id} tk={tk} />)}</ul>
    </section>
  );
}

export function QualityDesk() {
  const { t } = useI18n();
  const [params, setParams] = useSearchParams();
  const tab = (params.get('tab') as Tab | null) ?? 'overview';
  const setTab = (v: Tab) => setParams((p) => { p.set('tab', v); return p; }, { replace: true });
  const ov = useQuery(() => api<StaffOverview>('/feedback/staff/overview'), [], { refreshOn: ['feedback'] });
  return (
    <div>
      <PageHeader crumbs={[{ to: '/staff', label: t('nav.staff') }]} title={t('fb.staff.title')} subtitle={t('fb.staff.subtitle')} />
      <Tabs className="mb-5" label={t('fb.staff.title')} value={tab} onChange={setTab} items={[
        { value: 'overview', label: t('fb.staff.tab.overview'), count: ov.data ? ov.data.alerts.length + ov.data.course_alerts.length : undefined },
        { value: 'held', label: t('fb.staff.tab.held'), count: ov.data?.held },
        { value: 'help', label: t('fb.staff.tab.help'), count: ov.data?.tickets_open }
      ]} />
      {tab === 'overview' && <Overview />}
      {tab === 'held' && <Held />}
      {tab === 'help' && <Help />}
    </div>
  );
}
