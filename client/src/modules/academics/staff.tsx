import { useState } from 'react';
import { Link, Route, Routes, useNavigate, useParams, useSearchParams } from 'react-router';
import clsx from 'clsx';
import { ShieldAlert, CheckCircle2, XCircle, MessageCircleQuestion, ExternalLink } from 'lucide-react';
import { useI18n } from '@/i18n';
import { useSession } from '@/lib/session';
import { api, errorMessage } from '@/lib/api';
import { useQuery } from '@/lib/useQuery';
import { refreshAll } from '@/lib/bus';
import { useToast } from '@/components/ui/toast';
import { fmtDate, fmtDateTime, fmtDateRange } from '@/lib/format';
import { PageHeader } from '@/components/ui/PageHeader';
import { Card, SectionTitle, Skeleton, ErrorState, EmptyState, StatusPill, Badge, Button, Textarea, Tabs, KeyValue, Callout } from '@/components/ui';
import { ChecksList } from './components';
import type { Excuse } from './api';

const FILTERS = ['open', 'submitted', 'under_review', 'needs_information', 'accepted', 'rejected'] as const;

function Forbidden() {
  const { t } = useI18n();
  return <EmptyState icon={<ShieldAlert className="h-6 w-6" />} title={t('academics.staff.forbidden')} body={t('academics.staff.forbiddenBody')} />;
}

function Queue() {
  const { t, l, locale } = useI18n();
  const { hasRole } = useSession();
  const [params, setParams] = useSearchParams();
  const filter = (params.get('status') ?? 'open') as typeof FILTERS[number];
  const q = useQuery(() => api<Excuse[]>('/academics/review/excuses', { query: { status: filter === 'open' ? undefined : filter } }), [filter], { refreshOn: ['academics', 'persona'], enabled: hasRole('reviewer') });
  if (!hasRole('reviewer')) return <Forbidden />;
  const items = (q.data ?? []).filter((e) => filter !== 'open' || ['submitted', 'under_review', 'needs_information'].includes(e.status));
  return (
    <div>
      <PageHeader crumbs={[{ to: '/staff', label: t('nav.staff') }]} title={t('academics.staff.title')} subtitle={t('academics.staff.subtitle')} />
      <Tabs value={filter} onChange={(v) => setParams({ status: v })} items={FILTERS.map((f) => ({ value: f, label: f === 'open' ? t('academics.staff.open') : t(`status.${f}`) }))} className="mb-4" />
      {q.error ? <ErrorState error={q.error} onRetry={q.refetch} /> : null}
      {!q.data && !q.error && <Skeleton className="h-40" />}
      {q.data && items.length === 0 && <EmptyState title={t('academics.staff.empty')} />}
      <ul className="grid grid-cols-1 gap-3 md:grid-cols-2">
        {items.map((e) => (
          <li key={e.id}>
            <Link to={`/staff/academics/excuses/${e.id}`} className="card block p-4 transition hover:border-brand-400">
              <div className="flex items-start justify-between gap-2"><div className="font-semibold">{l(e.student_name_en ?? '', e.student_name_ar)}</div><StatusPill status={e.status} /></div>
              <div className="mt-1 text-sm">{e.sessions.map((s) => `${s.course_code} · ${fmtDate(s.session_date, locale)} ${s.start_time}`).join(' + ')}</div>
              <div className="mt-1 text-xs text-muted">{t(`academics.excuses.type.${e.type}`)} · {fmtDateRange(e.from_date, e.to_date, locale)} · {e.portal_request_id} · {t('academics.staff.files', { n: e.documents.length })}</div>
              <div className="mt-2 flex flex-wrap gap-1">{e.checks.filter((c) => c.status !== 'pass').map((c) => <Badge key={c.id} tone={c.status === 'fail' ? 'danger' : 'warn'}>{c.label}</Badge>)}</div>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}

function Detail() {
  const { id } = useParams();
  const { t, l, locale } = useI18n();
  const { hasRole } = useSession();
  const toast = useToast();
  const nav = useNavigate();
  const q = useQuery(() => api<Excuse>(`/academics/review/excuses/${id}`), [id], { refreshOn: ['academics'], enabled: hasRole('reviewer') });
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState<string | null>(null);
  if (!hasRole('reviewer')) return <Forbidden />;
  if (q.error) return <ErrorState error={q.error} onRetry={q.refetch} />;
  if (!q.data) return <Skeleton className="h-64" />;
  const e = q.data;
  const decide = async (decision: 'accepted' | 'rejected' | 'needs_information') => {
    if (!note.trim()) { toast.error(t('academics.staff.noteRequired')); return; }
    setBusy(decision);
    try { await api(`/academics/review/excuses/${id}/decision`, { body: { decision, note } }); toast.success(t(`status.${decision}`)); refreshAll('academics'); nav('/staff/academics/excuses'); } catch (err) { toast.error(t('common.error'), errorMessage(err)); } finally { setBusy(null); }
  };
  const decidable = ['submitted', 'under_review', 'needs_information'].includes(e.status);
  const doc = e.documents[0];
  return (
    <div>
      <PageHeader crumbs={[{ to: '/staff', label: t('nav.staff') }, { to: '/staff/academics/excuses', label: t('academics.staff.title') }]} title={`${l(e.student_name_en ?? '', e.student_name_ar)} · ${e.sessions.map((s) => s.course_code).join(', ')}`} subtitle={`${e.portal_request_id ?? ''} · ${t('academics.excuses.reviewedBy')} ${e.review_department}`} actions={<StatusPill status={e.status} />} />
      <div className="grid grid-cols-1 gap-5 lg:grid-cols-3">
        <div className="space-y-4 lg:col-span-2">
          <Card>
            <SectionTitle>{t('academics.staff.request')}</SectionTitle>
            <KeyValue items={[{ k: t('academics.excuses.sessions'), v: <ul className="space-y-0.5">{e.sessions.map((s) => <li key={s.id}>{s.course_code} · {fmtDate(s.session_date, locale)} {s.start_time}–{s.end_time} <StatusPill status={s.status} /> <span className="font-mono text-xs text-muted">{s.id}</span></li>)}</ul> }, { k: t('academics.excuses.typeLabel'), v: t(`academics.excuses.type.${e.type}`) }, { k: t('academics.excuses.reason'), v: e.reason }, { k: t('academics.excuses.dates'), v: `${e.from_date} → ${e.to_date}` }, { k: t('academics.excuses.reference'), v: e.reference ?? '—' }, { k: t('academics.register.revision'), v: e.revision }]} />
            <div className="mt-3 text-xs text-muted">{t('academics.staff.readOnly')}</div>
          </Card>
          <Card>
            <SectionTitle>{t('academics.excuses.step.evidence')}</SectionTitle>
            {!doc ? <div className="text-sm text-muted">{t('academics.staff.noEvidence')}</div> : (
              <>
                <div className="mb-2 flex flex-wrap items-center gap-2 text-sm"><span className="font-semibold">{doc.filename}</span><Badge tone="neutral">{doc.kind}</Badge><span className="text-xs text-muted">{Math.round(doc.size / 1024)} KB</span><a href={`/api/documents/${doc.id}/file`} target="_blank" rel="noreferrer" className="inline-flex min-h-11 items-center text-sm gap-1 font-semibold text-brand-600 hover:underline"><ExternalLink className="h-3 w-3" />{t('common.open')}</a></div>
                {doc.mime.startsWith('image/') ? <img src={`/api/documents/${doc.id}/file`} alt={doc.filename} className="max-h-[480px] rounded-xl border border-line" /> : <iframe title={doc.filename} src={`/api/documents/${doc.id}/file`} className="h-[480px] w-full rounded-xl border border-line bg-white" />}
                {e.extracted && <div className="mt-2 text-xs text-muted">{t('academics.staff.extracted')}: {e.extracted.fromDate?.value ?? '—'} – {e.extracted.toDate?.value ?? '—'} · {e.extracted.reference?.value ?? '—'} · {e.extracted.patientName?.value ?? '—'} · {t('academics.staff.extractionNote')}</div>}
              </>
            )}
          </Card>
        </div>
        <div className="space-y-4">
          <Card><SectionTitle>{t('academics.register.checks')}</SectionTitle><ChecksList checks={e.checks} compact /></Card>
          <Card className={clsx(decidable && 'border-brand-500/50')}>
            <SectionTitle>{t('academics.staff.decision')}</SectionTitle>
            {!decidable && <Callout tone="info">{t('academics.staff.decided', { status: t(`status.${e.status}`) })}{e.reviewer_note && <div className="mt-1 text-xs">{e.reviewer_note}</div>}</Callout>}
            {decidable && (
              <>
                <Textarea value={note} onChange={(ev) => setNote(ev.target.value)} placeholder={t('academics.staff.notePlaceholder')} />
                <div className="mt-3 grid gap-2">
                  <Button variant="success" icon={<CheckCircle2 className="h-4 w-4" />} onClick={() => decide('accepted')} loading={busy === 'accepted'} disabled={!!busy}>{t('academics.staff.accept')}</Button>
                  <Button variant="secondary" icon={<MessageCircleQuestion className="h-4 w-4" />} onClick={() => decide('needs_information')} loading={busy === 'needs_information'} disabled={!!busy}>{t('academics.staff.needsInfo')}</Button>
                  <Button variant="danger" icon={<XCircle className="h-4 w-4" />} onClick={() => decide('rejected')} loading={busy === 'rejected'} disabled={!!busy}>{t('academics.staff.reject')}</Button>
                </div>
                <div className="mt-2 text-xs text-muted">{t('academics.staff.treatmentNote')}</div>
              </>
            )}
          </Card>
          <Card>
            <SectionTitle>{t('academics.excuses.history')}</SectionTitle>
            <ol className="space-y-1 text-xs">{e.history.slice().reverse().map((h, i) => <li key={i}><span className="num text-muted">{fmtDateTime(h.at, locale)}</span> · <span className="font-semibold">{h.action}</span>{h.note && <div className="text-muted">{h.note}</div>}</li>)}</ol>
          </Card>
        </div>
      </div>
    </div>
  );
}

/** Staff routes for the academics module, mounted at /staff/academics/*. */
export function AcademicsStaffRoutes() {
  return (
    <Routes>
      <Route index element={<Queue />} />
      <Route path="excuses" element={<Queue />} />
      <Route path="excuses/:id" element={<Detail />} />
      <Route path="*" element={<Queue />} />
    </Routes>
  );
}
