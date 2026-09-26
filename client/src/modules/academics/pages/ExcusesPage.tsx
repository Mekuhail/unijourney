import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useParams } from 'react-router';
import clsx from 'clsx';
import { Upload, FileText, ShieldCheck, Send, RefreshCw, Paperclip, Wand2, ExternalLink, History } from 'lucide-react';
import type { DocumentMeta } from '@shared/types';
import { useI18n } from '@/i18n';
import { api, apiUpload, errorMessage } from '@/lib/api';
import { useQuery } from '@/lib/useQuery';
import { refreshAll } from '@/lib/bus';
import { useToast } from '@/components/ui/toast';
import { fmtDate, fmtDateTime, fmtDateRange } from '@/lib/format';
import { PageHeader } from '@/components/ui/PageHeader';
import { Card, SectionTitle, Skeleton, ErrorState, EmptyState, StatusPill, Badge, Button, Field, Input, Textarea, Select, Callout, KeyValue, CopyId, ButtonLink } from '@/components/ui';
import { AcademicsNav, ChecksList, FlowSteps, type FlowStep } from '../components';
import type { Excuse, ExtractedField, StoredExtraction } from '../api';

const TIMELINE = ['draft', 'ready', 'submitted', 'under_review', 'decided'];

export function ExcusesListPage() {
  const { t, locale } = useI18n();
  const q = useQuery(() => api<Excuse[]>('/academics/excuses'), [], { refreshOn: ['academics', 'persona'] });
  if (q.error) return <div><AcademicsNav /><ErrorState error={q.error} onRetry={q.refetch} /></div>;
  return (
    <div>
      <PageHeader crumbs={[{ to: '/academics', label: t('nav.academics') }]} title={t('academics.excuses.title')} subtitle={t('academics.excuses.subtitle')} actions={<ButtonLink to="/academics/attendance" size="sm" icon={<FileText className="h-4 w-4" />}>{t('academics.excuses.new')}</ButtonLink>} />
      <AcademicsNav />
      {!q.data ? <Skeleton className="h-40" /> : q.data.length === 0 ? <EmptyState title={t('academics.excuses.none')} body={t('academics.excuses.noneBody')} action={<ButtonLink to="/academics/attendance" size="sm" variant="outline">{t('academics.nav.attendance')}</ButtonLink>} /> : (
        <ul className="grid grid-cols-1 gap-3 md:grid-cols-2">
          {q.data.map((e) => (
            <li key={e.id}>
              <Link to={`/academics/excuses/${e.id}`} className="card block p-4 transition hover:border-brand-400">
                <div className="flex items-start justify-between gap-2"><div className="font-semibold">{e.sessions.map((s) => `${s.course_code} · ${fmtDate(s.session_date, locale)} ${s.start_time}`).join(' + ')}</div><StatusPill status={e.status} /></div>
                <div className="mt-1 text-xs text-muted">{t(`academics.excuses.type.${e.type}`)} · {fmtDateRange(e.from_date, e.to_date, locale)}{e.portal_request_id ? ` · ${e.portal_request_id}` : ''}</div>
                <div className="mt-2 flex flex-wrap gap-1">{e.checks.filter((c) => c.status !== 'pass').slice(0, 3).map((c) => <Badge key={c.id} tone={c.status === 'fail' ? 'danger' : 'warn'}>{c.label}</Badge>)}</div>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function Conf({ f }: { f?: ExtractedField }) {
  if (!f) return <span className="text-xs text-muted">—</span>;
  const pct = Math.round(f.confidence * 100);
  return <span className="inline-flex items-center gap-1.5 text-xs"><span className="font-mono">{f.value}</span><span className={clsx('rounded-full px-1.5 text-xs font-semibold', pct >= 85 ? 'bg-success/15 text-success' : pct >= 60 ? 'bg-warn/15 text-warn' : 'bg-danger/15 text-danger')}>{pct}%</span></span>;
}

export function ExcuseDetailPage() {
  const { id } = useParams();
  const { t, l, locale } = useI18n();
  const toast = useToast();
  const q = useQuery(() => api<Excuse>(`/academics/excuses/${id}`), [id], { refreshOn: ['academics'] });
  const docs = useQuery(() => api<DocumentMeta[]>('/documents'), [], { refreshOn: ['academics', 'documents'] });
  const e = q.data;
  const [busy, setBusy] = useState(false);
  const [form, setForm] = useState({ type: 'medical', reason: '', from_date: '', to_date: '', reference: '' });
  const [dirty, setDirty] = useState(false);
  const [extraction, setExtraction] = useState<StoredExtraction | null>(null);
  const [step, setStep] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  useEffect(() => { if (e && !dirty) { setForm({ type: e.type, reason: e.reason, from_date: e.from_date ?? '', to_date: e.to_date ?? '', reference: e.reference ?? '' }); setExtraction(e.extracted); } }, [e, dirty]);
  const run = async <T,>(fn: () => Promise<T>, okMsg?: string): Promise<T | null> => { setBusy(true); try { const r = await fn(); if (okMsg) toast.success(okMsg); refreshAll('academics'); return r; } catch (err) { toast.error(t('common.error'), errorMessage(err)); return null; } finally { setBusy(false); } };
  const save = async () => { const r = await run(() => api<Excuse>(`/academics/excuses/${id}`, { method: 'PUT', body: { type: form.type, reason: form.reason, from_date: form.from_date || null, to_date: form.to_date || null, reference: form.reference || null } }), t('common.save')); if (r) setDirty(false); };
  const attach = async (documentId: string) => { const r = await run(() => api<{ excuse: Excuse; extraction: StoredExtraction }>(`/academics/excuses/${id}/evidence`, { body: { documentId } }), t('academics.excuses.attached')); if (r) { setExtraction(r.extraction); setDirty(false); } };
  const upload = async (file: File) => { const kind = form.type === 'medical' ? 'medical' : 'event_evidence'; const doc = await run(() => apiUpload<DocumentMeta>('/documents', file, { kind, label: file.name })); if (doc) { refreshAll('documents'); await attach(doc.id); } };
  const useExtracted = () => { if (!extraction) return; setForm((f) => ({ ...f, from_date: extraction.fromDate?.value ?? f.from_date, to_date: extraction.toDate?.value ?? f.to_date, reference: extraction.reference?.value ?? f.reference })); setDirty(true); };
  const approve = () => run(() => api(`/academics/excuses/${id}/approve`, { method: 'POST' }), t('academics.excuses.approved'));
  const submit = () => run(() => api<{ receipt: { portal_request_id: string } }>(`/academics/excuses/${id}/submit`, { body: { approvalId: e!.approval_id } }), t('academics.excuses.submitted'));
  const derived = useMemo(() => {
    if (!e) return 'absences';
    if (['submitted', 'under_review', 'needs_information', 'accepted', 'rejected', 'failed'].includes(e.status)) return 'status';
    if (e.status === 'approved') return 'submit';
    const fail = (k: string) => e.checks.some((c) => c.id === k && c.status === 'fail');
    if (fail('reason') || fail('coverage') || fail('range')) return 'details';
    if (fail('evidence')) return 'evidence';
    return 'review';
  }, [e]);
  const current = step ?? derived;
  if (q.error) return <div><AcademicsNav /><ErrorState error={q.error} onRetry={q.refetch} /></div>;
  if (!e) return <div><AcademicsNav /><Skeleton className="h-64" /></div>;
  const order = ['absences', 'details', 'evidence', 'review', 'submit', 'status'];
  const idx = order.indexOf(derived);
  const steps: FlowStep[] = order.map((k, i) => ({ key: k, label: t(`academics.excuses.step.${k}`), state: i < idx ? 'done' : i === idx ? (k === 'status' && (e.status === 'rejected' || e.status === 'failed') ? 'blocked' : 'current') : 'todo' }));
  const evidenceKind = form.type === 'medical' ? 'medical' : 'event_evidence';
  const myDocs = (docs.data ?? []).filter((d) => ['medical', 'event_evidence', 'other'].includes(d.kind) && !e.document_ids.includes(d.id));
  const timelineIdx = e.status === 'draft' ? 0 : e.status === 'ready' || e.status === 'approved' ? 1 : e.status === 'submitted' ? 2 : e.status === 'under_review' || e.status === 'needs_information' ? 3 : 4;
  return (
    <div>
      <PageHeader crumbs={[{ to: '/academics', label: t('nav.academics') }, { to: '/academics/excuses', label: t('academics.excuses.title') }]} title={e.sessions.map((s) => `${s.course_code} · ${fmtDate(s.session_date, locale)}`).join(' + ')} subtitle={`${t(`academics.excuses.type.${e.type}`)} · ${t('academics.excuses.reviewedBy')} ${e.review_department}${e.portal_request_id ? ` · ${e.portal_request_id}` : ''}`} actions={<StatusPill status={e.status} />} />
      <AcademicsNav />
      <div className="mb-4"><FlowSteps steps={steps} onSelect={(k) => { if (order.indexOf(k) <= idx || k === 'status') setStep(k); }} /></div>
      <div className="grid grid-cols-1 gap-5 lg:grid-cols-3">
        <div className="space-y-4 lg:col-span-2">
          {current === 'absences' && (
            <Card>
              <SectionTitle>{t('academics.excuses.step.absences')}</SectionTitle>
              <p className="mb-2 text-sm text-muted">{t('academics.excuses.absencesHint')}</p>
              <ul className="space-y-2">{e.sessions.map((s) => <li key={s.id} className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-line p-3 text-sm"><span><span className="font-semibold">{s.course_code}</span> · {l(s.title_en, s.title_ar)}<div className="text-xs text-muted">{fmtDate(s.session_date, locale)} · {s.start_time}–{s.end_time}{s.location ? ` · ${l(s.location.name_en, s.location.name_ar)}` : ''}</div></span><span className="flex items-center gap-2"><StatusPill status={s.status} /><span className="font-mono text-xs text-muted">{s.id}</span></span></li>)}</ul>
              {e.event && <div className="mt-3"><Callout tone="gold" title={e.event.title_en}>{e.event.organizer} · {fmtDateTime(e.event.start_at, locale)}</Callout></div>}
              <div className="mt-3"><Button onClick={() => setStep('details')}>{t('common.continue')}</Button></div>
            </Card>
          )}
          {current === 'details' && (
            <Card>
              <SectionTitle>{t('academics.excuses.step.details')}</SectionTitle>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <Field label={t('academics.excuses.typeLabel')} className="sm:col-span-2"><Select value={form.type} onChange={(ev) => { setForm({ ...form, type: ev.target.value }); setDirty(true); }} disabled={!e.editable}>{(['medical', 'event', 'other'] as const).map((k) => <option key={k} value={k}>{t(`academics.excuses.type.${k}`)}</option>)}</Select></Field>
                <Field label={t('academics.excuses.reason')} required className="sm:col-span-2" hint={t('academics.excuses.reasonHint')}><Textarea value={form.reason} onChange={(ev) => { setForm({ ...form, reason: ev.target.value }); setDirty(true); }} disabled={!e.editable} /></Field>
                <Field label={t('academics.excuses.from')} required><Input type="date" value={form.from_date} onChange={(ev) => { setForm({ ...form, from_date: ev.target.value }); setDirty(true); }} disabled={!e.editable} /></Field>
                <Field label={t('academics.excuses.to')} required><Input type="date" value={form.to_date} onChange={(ev) => { setForm({ ...form, to_date: ev.target.value }); setDirty(true); }} disabled={!e.editable} /></Field>
                <Field label={t('academics.excuses.reference')} hint={t('academics.excuses.referenceHint')} className="sm:col-span-2"><Input value={form.reference} onChange={(ev) => { setForm({ ...form, reference: ev.target.value }); setDirty(true); }} disabled={!e.editable} /></Field>
              </div>
              <div className="mt-3 flex flex-wrap gap-2"><Button onClick={save} loading={busy} disabled={!e.editable}>{t('common.save')}</Button><Button variant="outline" onClick={() => setStep('evidence')}>{t('common.continue')}</Button></div>
            </Card>
          )}
          {current === 'evidence' && (
            <Card>
              <SectionTitle>{t('academics.excuses.step.evidence')}</SectionTitle>
              <p className="text-sm text-muted">{form.type === 'medical' ? t('academics.excuses.evidenceMedical') : form.type === 'event' ? t('academics.excuses.evidenceEvent') : t('academics.excuses.evidenceOther')}</p>
              {e.documents.length > 0 && <ul className="mt-3 space-y-1">{e.documents.map((d) => <li key={d.id} className="flex items-center justify-between gap-2 rounded-xl border border-line p-2 text-sm"><span className="flex items-center gap-2"><Paperclip className="h-4 w-4 text-muted" />{d.filename} <span className="text-xs text-muted">({Math.round(d.size / 1024)} KB · {d.kind})</span></span><a href={`/api/documents/${d.id}/file`} target="_blank" rel="noreferrer" className="inline-flex min-h-11 items-center text-sm gap-1 font-semibold text-brand-600 hover:underline"><ExternalLink className="h-3 w-3" />{t('common.open')}</a></li>)}</ul>}
              {e.editable && (
                <div className="mt-3 flex flex-wrap items-center gap-2">
                  <input ref={fileRef} type="file" accept="application/pdf,image/png,image/jpeg" className="hidden" onChange={(ev) => { const f = ev.target.files?.[0]; if (f) void upload(f); ev.target.value = ''; }} />
                  <Button variant="outline" icon={<Upload className="h-4 w-4" />} onClick={() => fileRef.current?.click()} loading={busy}>{t(evidenceKind === 'medical' ? 'academics.excuses.uploadMedical' : 'academics.excuses.uploadEvidence')}</Button>
                  {myDocs.length > 0 && <Select className="!w-auto" value="" onChange={(ev) => { if (ev.target.value) void attach(ev.target.value); }}><option value="">{t('academics.excuses.pickExisting')}</option>{myDocs.map((d) => <option key={d.id} value={d.id}>{d.filename} · {d.kind}</option>)}</Select>}
                  {e.documents.length > 0 && <Button variant="ghost" size="sm" icon={<RefreshCw className="h-4 w-4" />} onClick={() => run(async () => { const r = await api<{ extraction: StoredExtraction | null }>(`/academics/excuses/${id}/extract`, { method: 'POST' }); if (r.extraction) setExtraction(r.extraction); })}>{t('academics.excuses.rerun')}</Button>}
                </div>
              )}
              {extraction && (
                <div className="mt-4 rounded-2xl border border-line bg-surface-2 p-3">
                  <div className="flex items-center justify-between gap-2"><div className="flex items-center gap-2 text-sm font-semibold"><Wand2 className="h-4 w-4 text-brand-600" />{t('academics.excuses.extractionTitle')}</div><Badge tone="gold">{t('common.simulated')} · {extraction.provider}</Badge></div>
                  {extraction.textFound ? (
                    <>
                      <KeyValue className="mt-2" items={[{ k: t('academics.excuses.from'), v: <Conf f={extraction.fromDate} /> }, { k: t('academics.excuses.to'), v: <Conf f={extraction.toDate} /> }, { k: t('academics.excuses.reference'), v: <Conf f={extraction.reference} /> }, { k: t('academics.excuses.patientName'), v: <Conf f={extraction.patientName} /> }, { k: t('academics.excuses.issuer'), v: <Conf f={extraction.issuer} /> }]} />
                      <div className="mt-2 text-xs text-muted">{extraction.note}</div>
                      {e.editable && <div className="mt-2 flex flex-wrap gap-2"><Button size="sm" onClick={useExtracted}>{t('academics.excuses.useExtracted')}</Button><Button size="sm" variant="outline" onClick={() => setStep('details')}>{t('academics.excuses.editManually')}</Button></div>}
                    </>
                  ) : <Callout tone="warn">{extraction.note} <button type="button" className="font-semibold underline" onClick={() => setStep('details')}>{t('academics.excuses.editManually')}</button></Callout>}
                </div>
              )}
              {dirty && <div className="mt-3"><Callout tone="info">{t('academics.excuses.unsaved')} <Button size="sm" className="ms-2" onClick={save} loading={busy}>{t('common.save')}</Button></Callout></div>}
              <div className="mt-3"><Button variant="outline" onClick={() => setStep('review')}>{t('common.continue')}</Button></div>
            </Card>
          )}
          {(current === 'review' || current === 'submit') && (
            <Card className={clsx(e.status === 'approved' && 'border-brand-500/60')}>
              <SectionTitle>{t('academics.excuses.step.review')}</SectionTitle>
              <KeyValue items={[{ k: t('academics.excuses.sessions'), v: e.sessions.map((s) => `${s.course_code} · ${fmtDate(s.session_date, locale)} ${s.start_time}–${s.end_time}`).join('; ') }, { k: t('academics.excuses.typeLabel'), v: t(`academics.excuses.type.${e.type}`) }, { k: t('academics.excuses.reason'), v: e.reason || '—' }, { k: t('academics.excuses.dates'), v: `${e.from_date ?? '—'} → ${e.to_date ?? '—'}` }, { k: t('academics.excuses.reference'), v: e.reference ?? '—' }, { k: t('academics.excuses.files'), v: e.documents.map((d) => d.filename).join(', ') || '—' }, { k: t('academics.excuses.department'), v: e.review_department }]} />
              <div className="mt-3"><Callout tone="info">{t('academics.excuses.noChangeNote')}</Callout></div>
              <div className="mt-3 flex flex-wrap gap-2">
                {e.editable && e.status !== 'approved' && <Button onClick={approve} disabled={!e.can_approve} loading={busy} icon={<ShieldCheck className="h-4 w-4" />}>{t('academics.excuses.approve')}</Button>}
                {e.status === 'approved' && <Button variant="gold" onClick={submit} loading={busy} icon={<Send className="h-4 w-4" />}>{t('academics.excuses.submit')}</Button>}
                {e.status === 'approved' && e.approval && <span className="self-center text-xs text-muted">{t('academics.register.expires')} {fmtDateTime(e.approval.expires_at, locale)}</span>}
              </div>
              {!e.can_approve && e.editable && <div className="mt-2 text-xs text-danger">{t('academics.excuses.completeFirst')}</div>}
            </Card>
          )}
          {current === 'status' && (
            <Card>
              <SectionTitle>{t('academics.excuses.step.status')}</SectionTitle>
              <ol className="flex flex-wrap items-center gap-2">{TIMELINE.map((k, i) => <li key={k} className={clsx('rounded-full border px-3 py-1 text-xs font-semibold', i < timelineIdx && 'border-success/40 bg-success/10 text-success', i === timelineIdx && (e.status === 'rejected' ? 'border-danger bg-danger text-on-strong' : 'border-brand-500 bg-brand-500 text-ink-950'), i > timelineIdx && 'border-line text-muted')}>{k === 'decided' ? (['accepted', 'rejected'].includes(e.status) ? t(`status.${e.status}`) : t('academics.excuses.decision')) : t(`status.${k}`)}</li>)}</ol>
              {e.portal_request_id && <div className="mt-3 flex flex-wrap items-center gap-2"><Badge tone="gold">{t('academics.excuses.demoSubmission')}</Badge><CopyId value={e.portal_request_id} /></div>}
              {e.status === 'needs_information' && <div className="mt-3"><Callout tone="warn" title={t('status.needs_information')}>{e.reviewer_note}<div className="mt-2"><Button size="sm" onClick={() => setStep('details')}>{t('academics.excuses.provideInfo')}</Button></div></Callout></div>}
              {e.status === 'accepted' && <div className="mt-3"><Callout tone="success" title={t('status.accepted')}>{e.reviewer_note} · {t('academics.excuses.acceptedNote')}</Callout></div>}
              {e.status === 'rejected' && <div className="mt-3"><Callout tone="danger" title={t('status.rejected')}>{e.reviewer_note}</Callout></div>}
              {['submitted', 'under_review'].includes(e.status) && <div className="mt-3"><Callout tone="info">{t('academics.excuses.underReviewNote')}</Callout></div>}
              <div className="mt-3"><Link to="/academics/attendance" className="inline-flex min-h-11 items-center text-sm font-semibold text-brand-600 hover:underline">{t('academics.nav.attendance')}</Link></div>
            </Card>
          )}
        </div>
        <div className="space-y-4">
          <Card><SectionTitle>{t('academics.register.checks')}</SectionTitle><ChecksList checks={e.checks} /></Card>
          <Card>
            <SectionTitle><span className="inline-flex items-center gap-1"><History className="h-4 w-4" />{t('academics.excuses.history')}</span></SectionTitle>
            <ol className="space-y-1.5 text-xs">{e.history.slice().reverse().map((h, i) => <li key={i}><span className="num text-muted">{fmtDateTime(h.at, locale)}</span> · <span className="font-semibold">{t(`status.${h.action}`) === `status.${h.action}` ? h.action : t(`status.${h.action}`)}</span>{h.note && <div className="text-muted">{h.note}</div>}</li>)}</ol>
            <div className="mt-2 text-xs text-muted">{t('academics.register.revision')} {e.revision}</div>
          </Card>
        </div>
      </div>
    </div>
  );
}
