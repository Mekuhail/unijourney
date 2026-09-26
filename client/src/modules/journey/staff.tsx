import { useState } from 'react';
import { Route, Routes } from 'react-router';
import { FileCheck, GraduationCap, ShieldOff } from 'lucide-react';
import clsx from 'clsx';
import { PageHeader } from '@/components/ui/PageHeader';
import { Badge, Button, Callout, Card, EmptyState, ErrorState, Field, KeyValue, Modal, Progress, SectionTitle, Select, Skeleton, StatusPill, Textarea } from '@/components/ui';
import { useToast } from '@/components/ui/toast';
import { useI18n } from '@/i18n';
import { useSession } from '@/lib/session';
import { api, errorMessage } from '@/lib/api';
import { refreshAll } from '@/lib/bus';
import { useQuery } from '@/lib/useQuery';
import { fmtDateTime } from '@/lib/format';
import type { AdmApp, GradRequest } from './types';

function NoRole({ role }: { role: string }) {
  return <EmptyState icon={<ShieldOff className="h-6 w-6" />} title={`Requires role: ${role}`} body="Switch to the admissions & registration persona from the demo control. The server enforces this role on every request." />;
}

function AdmissionsQueue() {
  const { t, l, locale } = useI18n();
  const { hasRole } = useSession();
  const toast = useToast();
  const [status, setStatus] = useState('');
  const [sel, setSel] = useState<AdmApp | null>(null);
  const [decision, setDecision] = useState<'admitted' | 'rejected' | 'needs_information'>('admitted');
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const q = useQuery(() => api<{ items: AdmApp[] }>('/admission/review/applications', { query: { status } }), [status], { enabled: hasRole('admission_officer'), refreshOn: ['journey'] });
  if (!hasRole('admission_officer')) return <NoRole role="admission_officer" />;
  const act = async (fn: () => Promise<void>) => { setBusy(true); try { await fn(); refreshAll('journey'); } catch (e) { toast.error(errorMessage(e)); } finally { setBusy(false); } };
  const decide = () => act(async () => { if (!sel) return; const r = await api<AdmApp>(`/admission/review/applications/${sel.id}/decision`, { body: { decision, note } }); toast.success(t('journey.decisionRecorded'), t(`status.${r.status}`)); setSel(null); setNote(''); });
  return (
    <div>
      <PageHeader eyebrow={t('nav.staff')} title={t('journey.staff.admissions')} subtitle={t('journey.staff.admissionsSubtitle')} actions={<Select value={status} onChange={(e) => setStatus(e.target.value)}><option value="">{t('common.all')}</option>{['submitted', 'under_review', 'needs_information', 'admitted', 'rejected', 'enrolled'].map((s) => <option key={s} value={s}>{t(`status.${s}`)}</option>)}</Select>} />
      {!!q.error && <ErrorState error={q.error} onRetry={() => void q.refetch()} />}
      {q.loading && !q.data && <Skeleton className="h-48" />}
      {q.data && q.data.items.length === 0 && <EmptyState icon={<FileCheck className="h-6 w-6" />} title={t('journey.staff.emptyQueue')} body={t('journey.staff.emptyQueueBody')} />}
      <div className="space-y-2">
        {q.data?.items.map((a) => (
          <button key={a.id} type="button" onClick={() => { setSel(a); setDecision(a.status === 'admitted' ? 'admitted' : 'admitted'); }} className="card flex w-full flex-wrap items-center gap-3 p-4 text-start transition hover:border-brand-400">
            <div className="min-w-0 flex-1"><div className="font-semibold">{a.applicant ? l(a.applicant.name_en, a.applicant.name_ar) : a.applicant_id}</div><div className="text-xs text-muted">{a.program ? l(a.program.name_en, a.program.name_ar) : a.program_id} · {a.campus_id} · {a.receipt?.ref ?? ''}</div></div>
            <StatusPill status={a.status} /><span className="text-xs text-muted">{fmtDateTime(a.submitted_at, locale)}</span>
          </button>
        ))}
      </div>
      <Modal open={!!sel} onClose={() => setSel(null)} title={sel?.applicant ? l(sel.applicant.name_en, sel.applicant.name_ar) : ''} description={sel ? `${sel.program ? l(sel.program.name_en, sel.program.name_ar) : ''} · ${sel.receipt?.ref ?? ''}` : ''} size="lg" footer={sel && ['submitted', 'under_review', 'needs_information'].includes(sel.status) && <><Button variant="ghost" onClick={() => setSel(null)}>{t('common.cancel')}</Button>{sel.status === 'submitted' && <Button variant="outline" loading={busy} onClick={() => void act(async () => { const r = await api<AdmApp>(`/admission/review/applications/${sel.id}/start-review`, { body: {} }); setSel(r); })}>{t('journey.staff.startReview')}</Button>}<Button loading={busy} disabled={note.trim().length < 3} onClick={() => void decide()}>{t('journey.staff.recordDecision')}</Button></>}>
        {sel && (
          <div className="space-y-4">
            <Callout tone="gold">{t('journey.staff.decisionNote')}</Callout>
            <KeyValue items={[{ k: t('journey.f.fullName'), v: sel.personal.full_name ?? '—' }, { k: t('journey.f.nationalIdLast4'), v: sel.personal.national_id_last4 ? `•••• ${sel.personal.national_id_last4}` : '—' }, { k: t('journey.f.dob'), v: sel.personal.date_of_birth ?? '—' }, { k: t('journey.f.phone'), v: sel.personal.phone ?? '—' }, { k: 'Email', v: sel.personal.email ?? '—' }, { k: t('journey.f.gpa'), v: sel.personal.high_school_gpa ?? '—' }, { k: t('journey.f.english'), v: sel.personal.english_score ?? '—' }, { k: t('common.status'), v: <StatusPill status={sel.status} /> }]} />
            <div>
              <SectionTitle>{t('journey.documents')}</SectionTitle>
              <ul className="space-y-1 text-sm">{sel.checklist.map((c) => { const d = sel.documents[c.key]; return <li key={c.key} className="flex items-center justify-between rounded-lg bg-surface-2 px-3 py-1.5"><span>{l(c.label_en, c.label_ar)} {c.required && <span className="text-danger">*</span>}</span>{d ? <a className="text-brand-600 hover:underline" href={`/api/documents/${d.id}/file`} target="_blank" rel="noreferrer">{d.filename}</a> : <Badge tone={c.required ? 'danger' : 'neutral'}>{t('status.pending')}</Badge>}</li>; })}</ul>
            </div>
            <div>
              <SectionTitle>{t('journey.statusTimeline')}</SectionTitle>
              <ul className="space-y-1 text-xs text-muted">{sel.timeline.map((e, i) => <li key={i}><StatusPill status={e.status} className="me-2" />{e.note} · {fmtDateTime(e.at, locale)}</li>)}</ul>
            </div>
            {['submitted', 'under_review', 'needs_information'].includes(sel.status) && (
              <form className="grid grid-cols-1 gap-3 sm:grid-cols-[200px_1fr]" onSubmit={(e) => { e.preventDefault(); void decide(); }}>
                <Field label={t('journey.staff.decision')}><Select value={decision} onChange={(e) => setDecision(e.target.value as never)}><option value="admitted">{t('status.admitted')}</option><option value="needs_information">{t('status.needs_information')}</option><option value="rejected">{t('status.rejected')}</option></Select></Field>
                <Field label={t('career.note')} required><Textarea value={note} onChange={(e) => setNote(e.target.value)} className="min-h-[72px]" placeholder={t('journey.staff.notePlaceholder')} /></Field>
              </form>
            )}
          </div>
        )}
      </Modal>
    </div>
  );
}

function GraduationQueue() {
  const { t, l, locale } = useI18n();
  const { hasRole } = useSession();
  const toast = useToast();
  const [status, setStatus] = useState('');
  const [selId, setSelId] = useState<string | null>(null);
  const [decision, setDecision] = useState<'approved' | 'rejected'>('approved');
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState<string | null>(null);
  const q = useQuery(() => api<{ items: GradRequest[] }>('/graduation/review/requests', { query: { status } }), [status], { enabled: hasRole('registrar'), refreshOn: ['journey'] });
  const detail = useQuery(() => api<GradRequest & { live_audit: { remaining: number; earned: number; total_required: number } }>(`/graduation/review/requests/${selId}`), [selId], { enabled: !!selId, refreshOn: ['journey'] });
  if (!hasRole('registrar')) return <NoRole role="registrar" />;
  const act = async (key: string, fn: () => Promise<void>) => { setBusy(key); try { await fn(); refreshAll('journey'); } catch (e) { toast.error(errorMessage(e)); } finally { setBusy(null); } };
  const sel = detail.data;
  return (
    <div>
      <PageHeader eyebrow={t('nav.staff')} title={t('journey.staff.graduation')} subtitle={t('journey.staff.graduationSubtitle')} actions={<Select value={status} onChange={(e) => setStatus(e.target.value)}><option value="">{t('common.all')}</option>{['submitted', 'under_review', 'approved', 'rejected'].map((s) => <option key={s} value={s}>{t(`status.${s}`)}</option>)}</Select>} />
      {!!q.error && <ErrorState error={q.error} onRetry={() => void q.refetch()} />}
      {q.loading && !q.data && <Skeleton className="h-48" />}
      {q.data && q.data.items.length === 0 && <EmptyState icon={<GraduationCap className="h-6 w-6" />} title={t('journey.staff.emptyQueue')} body={t('journey.staff.emptyGradBody')} />}
      <div className="space-y-2">
        {q.data?.items.map((r) => (
          <button key={r.id} type="button" onClick={() => { setSelId(r.id); setNote(''); }} className={clsx('card flex w-full flex-wrap items-center gap-3 p-4 text-start transition hover:border-brand-400', selId === r.id && 'border-brand-500')}>
            <div className="min-w-0 flex-1"><div className="font-semibold">{r.student ? l(r.student.name_en, r.student.name_ar) : r.student_id}</div><div className="text-xs text-muted">{r.student?.student_no ?? ''} · {r.student?.program_id?.toUpperCase() ?? ''} · {r.receipt?.ref ?? ''}</div></div>
            {r.audit_snapshot && <span className="num text-xs text-muted">{r.audit_snapshot.earned}/{r.audit_snapshot.total_required} {t('common.credits')}</span>}
            <StatusPill status={r.status} /><span className="text-xs text-muted">{fmtDateTime(r.submitted_at, locale)}</span>
          </button>
        ))}
      </div>
      <Modal open={!!selId} onClose={() => setSelId(null)} title={sel?.student ? l(sel.student.name_en, sel.student.name_ar) : t('common.loading')} description={sel?.receipt?.ref} size="lg" footer={sel && ['submitted', 'under_review'].includes(sel.status) && <><Button variant="ghost" onClick={() => setSelId(null)}>{t('common.cancel')}</Button><Button loading={busy === 'decide'} disabled={note.trim().length < 3} onClick={() => void act('decide', async () => { await api(`/graduation/review/requests/${sel.id}/decision`, { body: { decision, note } }); toast.success(t('journey.decisionRecorded'), t(`status.${decision}`)); setSelId(null); })}>{t('journey.staff.recordDecision')}</Button></>}>
        {!!detail.error && <ErrorState error={detail.error} onRetry={() => void detail.refetch()} />}
        {!sel && !detail.error && <Skeleton className="h-40" />}
        {sel && (
          <div className="space-y-4">
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <Card className="p-4"><div className="text-xs font-semibold uppercase tracking-wide text-muted">{t('journey.staff.snapshot')}</div>{sel.audit_snapshot ? <><div className="num mt-1 text-2xl font-bold">{sel.audit_snapshot.earned}<span className="text-sm text-muted"> / {sel.audit_snapshot.total_required}</span></div><Progress value={sel.audit_snapshot.earned} max={sel.audit_snapshot.total_required} tone={sel.audit_snapshot.remaining === 0 ? 'success' : 'warn'} className="mt-2" /><div className="mt-1 text-xs text-muted">{t('journey.stat.remaining')}: {sel.audit_snapshot.remaining}</div></> : '—'}</Card>
              <Card className="p-4"><div className="text-xs font-semibold uppercase tracking-wide text-muted">{t('journey.staff.liveAudit')}</div><div className="num mt-1 text-2xl font-bold">{sel.live_audit.earned}<span className="text-sm text-muted"> / {sel.live_audit.total_required}</span></div><div className="mt-1 text-xs text-muted">{t('journey.stat.remaining')}: {sel.live_audit.remaining}</div></Card>
            </div>
            {sel.audit_snapshot && <div className="flex flex-wrap gap-1.5">{sel.audit_snapshot.buckets.map((b) => <Badge key={b.id} tone={b.remaining_credits === 0 ? 'success' : 'warn'}>{l(b.label_en, b.label_ar)} {b.earned_credits}/{b.required_credits}</Badge>)}</div>}
            <div>
              <SectionTitle>{t('journey.clearances')}</SectionTitle>
              <ul className="space-y-1 text-sm">{sel.clearances.map((c) => <li key={c.key} className="flex items-center justify-between gap-2 rounded-lg bg-surface-2 px-3 py-1.5"><span>{l(c.label_en, c.label_ar)}</span><span className="flex items-center gap-2"><StatusPill status={c.status} />{c.status !== 'cleared' && <Button size="sm" variant="outline" loading={busy === c.key} onClick={() => void act(c.key, async () => { await api(`/graduation/clearances/${c.key}/clear`, { body: { studentId: sel.student_id, note: 'Cleared by registrar (demo)' } }); void detail.refetch(); })}>{t('journey.staff.clear')}</Button>}</span></li>)}</ul>
            </div>
            {sel.reviewer_note && <Callout tone="info" title={t('journey.registrarNote')}>{sel.reviewer_note}</Callout>}
            {['submitted', 'under_review'].includes(sel.status) && (
              <form className="grid grid-cols-1 gap-3 sm:grid-cols-[200px_1fr]" onSubmit={(e) => e.preventDefault()}>
                <Field label={t('journey.staff.decision')}><Select value={decision} onChange={(e) => setDecision(e.target.value as never)}><option value="approved">{t('common.approve')}</option><option value="rejected">{t('common.reject')}</option></Select></Field>
                <Field label={t('career.note')} required><Textarea value={note} onChange={(e) => setNote(e.target.value)} className="min-h-[72px]" placeholder={t('journey.staff.gradNotePlaceholder')} /></Field>
              </form>
            )}
          </div>
        )}
      </Modal>
    </div>
  );
}

/** Staff routes for the journey module, mounted at /staff/journey/*. */
export function JourneyStaffRoutes() {
  return (
    <Routes>
      <Route path="admissions" element={<AdmissionsQueue />} />
      <Route path="graduation" element={<GraduationQueue />} />
      <Route path="*" element={<AdmissionsQueue />} />
    </Routes>
  );
}
