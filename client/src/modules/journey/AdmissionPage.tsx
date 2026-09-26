import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router';
import { AnimatePresence, motion } from 'motion/react';
import { ExternalLink, MapPin, Upload, Trash2, CheckCircle2, AlertTriangle, FileText, PartyPopper, Info } from 'lucide-react';
import clsx from 'clsx';
import { PageHeader } from '@/components/ui/PageHeader';
import { Badge, Button, Callout, Card, CopyId, EmptyState, ErrorState, Field, Input, KeyValue, Modal, SectionTitle, Select, Skeleton, StatusPill } from '@/components/ui';
import { useToast } from '@/components/ui/toast';
import { useI18n } from '@/i18n';
import { ApiError, api, apiUpload, errorMessage } from '@/lib/api';
import { refreshAll } from '@/lib/bus';
import { useQuery } from '@/lib/useQuery';
import { fmtDateTime } from '@/lib/format';
import { StepHeader } from './Stepper';
import type { AdmApp, Personal, Program } from './types';
import type { DocumentMeta } from '@shared/types';

export function AdmissionPage() {
  const { t } = useI18n();
  const mine = useQuery(() => api<{ items: AdmApp[]; active: AdmApp | null }>('/admission/applications/mine'), [], { refreshOn: ['journey', 'persona'] });
  return (
    <div>
      <PageHeader eyebrow={t('nav.journey')} title={t('journey.admission')} subtitle={t('journey.admissionSubtitle')} actions={<Badge tone="gold">{t('journey.illustrative')}</Badge>} />
      {!!mine.error && <ErrorState error={mine.error} onRetry={() => void mine.refetch()} />}
      {mine.loading && !mine.data && <Skeleton className="h-72" />}
      {mine.data && !mine.data.active && <ProgramExplorer />}
      {mine.data?.active && <ApplicationFlow app={mine.data.active} />}
    </div>
  );
}

function campusName(id: string, t: (k: string) => string) { return id === 'khobar' ? t('shell.khobar') : t('shell.riyadh'); }

function ProgramExplorer() {
  const { t, l } = useI18n();
  const toast = useToast();
  const [campus, setCampus] = useState('');
  const q = useQuery(() => api<{ items: Program[]; note: string }>('/admission/programs', { query: { campus } }), [campus]);
  const [apply, setApply] = useState<Program | null>(null);
  const [applyCampus, setApplyCampus] = useState('riyadh');
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState<string | null>(null);
  const groups = useMemo(() => { const m = new Map<string, Program[]>(); for (const p of q.data?.items ?? []) { const k = p.college_en; if (!m.has(k)) m.set(k, []); m.get(k)!.push(p); } return [...m.entries()]; }, [q.data]);
  const start = async () => {
    if (!apply) return;
    setLoading(true);
    try { await api('/admission/applications', { body: { programId: apply.id, campusId: applyCampus } }); toast.success(t('journey.draftCreated')); refreshAll('journey'); setApply(null); } catch (e) { toast.error(errorMessage(e)); } finally { setLoading(false); }
  };
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <Field label={t('shell.campus')}><Select value={campus} onChange={(e) => setCampus(e.target.value)}><option value="">{t('common.all')}</option><option value="riyadh">{t('shell.riyadh')}</option><option value="khobar">{t('shell.khobar')}</option></Select></Field>
        <p className="max-w-xl text-xs text-muted">{q.data?.note}</p>
      </div>
      {!!q.error && <ErrorState error={q.error} onRetry={() => void q.refetch()} />}
      {q.loading && !q.data && <Skeleton className="h-64" />}
      {groups.map(([college, items]) => (
        <section key={college}>
          <SectionTitle>{l(college, items[0].college_ar)}</SectionTitle>
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
            {items.map((p) => (
              <motion.article key={p.id} layout className="card flex flex-col p-4">
                <div className="flex items-start justify-between gap-2"><div><div className="font-semibold">{l(p.name_en, p.name_ar)}</div><div className="text-xs text-muted">{p.degree} · {p.code}</div></div><Badge tone="neutral">{p.total_credits} {t('common.credits')}</Badge></div>
                <p className="mt-2 line-clamp-3 text-sm text-muted">{l(p.description_en, p.description_ar)}</p>
                <div className="mt-2 flex flex-wrap items-center gap-1.5">{p.campus_ids.map((c) => <Badge key={c} tone="brand"><MapPin className="h-3 w-3" />{campusName(c, t)}</Badge>)}<span className="text-[11px] text-muted">{p.duration_years} {t('journey.years')}</span></div>
                <button type="button" className="mt-2 text-start text-xs text-brand-600 hover:underline" onClick={() => setOpen(open === p.id ? null : p.id)}>{open === p.id ? t('common.less') : t('journey.criteria')}</button>
                <AnimatePresence initial={false}>{open === p.id && <motion.ul initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} className="overflow-hidden text-xs text-muted">{p.criteria.map((c) => <li key={c.key} className="flex gap-1.5 py-0.5"><Info className="mt-0.5 h-3 w-3 shrink-0" /><span>{l(c.label_en, c.label_ar)} <span className="opacity-70">– {c.note}</span></span></li>)}</motion.ul>}</AnimatePresence>
                <div className="mt-auto flex items-center justify-between pt-3">
                  {p.source_url && <a href={p.source_url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-xs text-muted hover:text-fg"><ExternalLink className="h-3.5 w-3.5" />{t('journey.officialPage')}</a>}
                  <Button size="sm" onClick={() => { setApply(p); setApplyCampus(p.campus_ids[0] ?? 'riyadh'); }}>{t('journey.apply')}</Button>
                </div>
              </motion.article>
            ))}
          </div>
        </section>
      ))}
      <Modal open={!!apply} onClose={() => setApply(null)} title={t('journey.startApplication')} description={apply ? l(apply.name_en, apply.name_ar) : ''} size="sm" footer={<><Button variant="ghost" onClick={() => setApply(null)}>{t('common.cancel')}</Button><Button loading={loading} onClick={() => void start()}>{t('journey.createDraft')}</Button></>}>
        <Field label={t('shell.campus')}><Select value={applyCampus} onChange={(e) => setApplyCampus(e.target.value)}>{apply?.campus_ids.map((c) => <option key={c} value={c}>{campusName(c, t)}</option>)}</Select></Field>
        <p className="mt-3 text-xs text-muted">{t('journey.oneActive')}</p>
      </Modal>
    </div>
  );
}

const STEP_KEYS = ['program', 'personal', 'documents', 'review', 'submit'] as const;

function ApplicationFlow({ app }: { app: AdmApp }) {
  const { t, l, locale } = useI18n();
  const toast = useToast();
  const editable = app.status === 'draft' || app.status === 'needs_information';
  const [step, setStep] = useState(app.status === 'needs_information' ? 3 : 0);
  const [editing, setEditing] = useState(app.status === 'draft');
  const steps = STEP_KEYS.map((k) => ({ key: k, label: t(`journey.step.${k}`) }));
  const reached = app.completeness.complete ? 4 : Math.max(step, app.completeness.missing.some((m) => m.kind === 'field') ? 1 : 3);

  if (!editable || !editing) return <StatusView app={app} onEdit={editable ? () => { setEditing(true); setStep(1); } : undefined} />;

  return (
    <div className="space-y-4">
      <Card>
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3"><div className="text-sm"><span className="font-semibold">{app.program ? l(app.program.name_en, app.program.name_ar) : app.program_id}</span> · {campusName(app.campus_id, t)} · <StatusPill status={app.status} /></div>{app.status === 'needs_information' && app.reviewer_note && <Callout tone="warn" title={t('journey.officerNote')}>{app.reviewer_note}</Callout>}</div>
        <StepHeader steps={steps} current={step} reached={Math.max(reached, step)} onSelect={setStep} />
        <AnimatePresence initial={false} mode="popLayout">
          <motion.div key={step} initial={{ opacity: 0, x: 12 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -12 }} transition={{ duration: 0.2 }} className="mt-4">
            {step === 0 && <ProgramStep app={app} onNext={() => setStep(1)} />}
            {step === 1 && <PersonalStep app={app} onNext={() => setStep(2)} onBack={() => setStep(0)} />}
            {step === 2 && <DocumentsStep app={app} onNext={() => setStep(3)} onBack={() => setStep(1)} />}
            {step === 3 && <ReviewStep app={app} onNext={() => setStep(4)} onBack={() => setStep(2)} goto={setStep} />}
            {step === 4 && <SubmitStep app={app} onBack={() => setStep(3)} onSubmitted={() => { setEditing(false); toast.success(t('journey.submitted')); }} />}
          </motion.div>
        </AnimatePresence>
      </Card>
      <p className="text-xs text-muted">{t('journey.timelineLast')}: {app.timeline.length ? `${app.timeline[app.timeline.length - 1].note} · ${fmtDateTime(app.timeline[app.timeline.length - 1].at, locale)}` : '—'}</p>
    </div>
  );
}

function StepNav({ onBack, onNext, nextLabel, loading, disabled }: { onBack?: () => void; onNext?: () => void; nextLabel?: string; loading?: boolean; disabled?: boolean }) {
  const { t } = useI18n();
  return <div className="mt-5 flex items-center justify-between border-t border-line pt-4">{onBack ? <Button variant="ghost" onClick={onBack}>{t('common.back')}</Button> : <span />}{onNext && <Button loading={loading} disabled={disabled} onClick={onNext}>{nextLabel ?? t('common.continue')}</Button>}</div>;
}

function ProgramStep({ app, onNext }: { app: AdmApp; onNext: () => void }) {
  const { t, l } = useI18n();
  return (
    <div>
      <KeyValue items={[{ k: t('journey.program'), v: app.program ? l(app.program.name_en, app.program.name_ar) : app.program_id }, { k: t('journey.college'), v: app.program ? l(app.program.college_en, app.program.college_ar) : '—' }, { k: t('shell.campus'), v: campusName(app.campus_id, t) }, { k: t('journey.officialPage'), v: app.program?.source_url ? <a className="text-brand-600 hover:underline" href={app.program.source_url} target="_blank" rel="noreferrer">{app.program.source_url}</a> : '—' }]} />
      <p className="mt-3 text-xs text-muted">{t('journey.programStepNote')}</p>
      <StepNav onNext={onNext} />
    </div>
  );
}

function PersonalStep({ app, onNext, onBack }: { app: AdmApp; onNext: () => void; onBack: () => void }) {
  const { t } = useI18n();
  const toast = useToast();
  const [form, setForm] = useState({ full_name: app.personal.full_name ?? '', national_id_last4: app.personal.national_id_last4 ?? '', date_of_birth: app.personal.date_of_birth ?? '', phone: app.personal.phone ?? '', email: app.personal.email ?? '', high_school_gpa: app.personal.high_school_gpa?.toString() ?? '', english_score: app.personal.english_score?.toString() ?? '', nationality: app.personal.nationality ?? '', city: app.personal.city ?? '' });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(false);
  const save = async (thenNext: boolean) => {
    setErrors({}); setLoading(true);
    const body: Personal = { full_name: form.full_name, email: form.email, nationality: form.nationality || undefined, city: form.city || undefined };
    if (form.national_id_last4) body.national_id_last4 = form.national_id_last4;
    if (form.date_of_birth) body.date_of_birth = form.date_of_birth;
    if (form.phone) body.phone = form.phone;
    if (form.high_school_gpa) body.high_school_gpa = Number(form.high_school_gpa);
    if (form.english_score) body.english_score = Number(form.english_score);
    try { await api(`/admission/applications/${app.id}`, { method: 'PUT', body }); refreshAll('journey'); toast.success(t('common.save')); if (thenNext) onNext(); }
    catch (e) { if (e instanceof ApiError && Array.isArray(e.details)) { const m: Record<string, string> = {}; for (const d of e.details as Array<{ path: string; message: string }>) m[d.path] = d.message; setErrors(m); } else toast.error(errorMessage(e)); }
    finally { setLoading(false); }
  };
  const F = (k: keyof typeof form, label: string, extra: Record<string, unknown> = {}, hint?: string) => <Field label={label} hint={hint} error={errors[k]} required={!['nationality', 'city', 'english_score'].includes(k)}><Input value={form[k]} onChange={(e) => setForm({ ...form, [k]: e.target.value })} {...extra} /></Field>;
  return (
    <form onSubmit={(e) => { e.preventDefault(); void save(true); }}>
      <Callout tone="info">{t('journey.privacyNote')}</Callout>
      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        {F('full_name', t('journey.f.fullName'))}
        {F('national_id_last4', t('journey.f.nationalIdLast4'), { inputMode: 'numeric', maxLength: 4, placeholder: '••••' }, t('journey.f.nationalIdHint'))}
        {F('date_of_birth', t('journey.f.dob'), { type: 'date' })}
        {F('phone', t('journey.f.phone'), { placeholder: '05xxxxxxxx', inputMode: 'tel' })}
        {F('email', 'Email', { type: 'email' })}
        {F('high_school_gpa', t('journey.f.gpa'), { type: 'number', min: 0, max: 100, step: '0.1' }, t('journey.f.gpaHint'))}
        {F('english_score', t('journey.f.english'), { type: 'number', min: 0, max: 120 }, t('common.optional'))}
        {F('nationality', t('journey.f.nationality'))}
        {F('city', t('journey.f.city'))}
      </div>
      <StepNav onBack={onBack} onNext={() => void save(true)} loading={loading} nextLabel={t('journey.saveContinue')} />
    </form>
  );
}

function DocumentsStep({ app, onNext, onBack }: { app: AdmApp; onNext: () => void; onBack: () => void }) {
  const { t, l, locale } = useI18n();
  const toast = useToast();
  const [busy, setBusy] = useState<string | null>(null);
  const upload = async (key: string, file: File) => {
    setBusy(key);
    try {
      const doc = await apiUpload<DocumentMeta>('/documents', file, { kind: 'admission', label: key });
      await api(`/admission/applications/${app.id}/documents`, { body: { checklistKey: key, documentId: doc.id } });
      toast.success(t('journey.attached'), doc.filename); refreshAll('journey');
    } catch (e) { toast.error(errorMessage(e)); } finally { setBusy(null); }
  };
  const remove = async (key: string) => { setBusy(key); try { await api(`/admission/applications/${app.id}/documents/${key}`, { method: 'DELETE' }); refreshAll('journey'); } catch (e) { toast.error(errorMessage(e)); } finally { setBusy(null); } };
  const requiredMissing = app.checklist.filter((c) => c.required && c.status !== 'attached').length;
  return (
    <div>
      <Callout tone="info">{t('journey.docsNote')}</Callout>
      <ul className="mt-4 space-y-2">
        {app.checklist.map((c) => {
          const doc = app.documents[c.key];
          return (
            <li key={c.key} className="card-2 flex flex-wrap items-center gap-3 p-3 text-sm">
              {c.status === 'attached' ? <CheckCircle2 className="h-5 w-5 shrink-0 text-success" /> : <FileText className="h-5 w-5 shrink-0 text-muted" />}
              <div className="min-w-0 flex-1"><div className="font-medium">{l(c.label_en, c.label_ar)} {c.required ? <span className="text-danger">*</span> : <span className="text-xs text-muted">({t('common.optional')})</span>}</div>{doc && <div className="text-xs text-muted">{doc.filename} · {Math.round(doc.size / 1024)} KB · {fmtDateTime(doc.created_at, locale)}</div>}</div>
              {doc && <a href={`/api/documents/${doc.id}/file`} target="_blank" rel="noreferrer" className="text-xs text-brand-600 hover:underline">{t('common.view')}</a>}
              {c.status === 'attached' ? <Button size="sm" variant="ghost" loading={busy === c.key} icon={<Trash2 className="h-4 w-4" />} onClick={() => void remove(c.key)}>{t('common.remove')}</Button> : (
                <label className={clsx('inline-flex h-8 cursor-pointer items-center gap-1.5 rounded-xl border border-line bg-surface px-3 text-xs font-medium hover:border-brand-400', busy === c.key && 'opacity-50')}><Upload className="h-4 w-4" />{busy === c.key ? t('common.loading') : t('common.upload')}<input type="file" accept="application/pdf,image/png,image/jpeg,text/plain" className="sr-only" disabled={busy === c.key} onChange={(e) => { const f = e.target.files?.[0]; if (f) void upload(c.key, f); e.target.value = ''; }} /></label>
              )}
            </li>
          );
        })}
      </ul>
      <p className="mt-2 text-xs text-muted">{t('journey.docsAccepted')}</p>
      {requiredMissing > 0 && <p className="mt-1 text-xs text-warn">{t('journey.requiredMissing', { n: requiredMissing })}</p>}
      <StepNav onBack={onBack} onNext={onNext} />
    </div>
  );
}

function ReviewStep({ app, onNext, onBack, goto }: { app: AdmApp; onNext: () => void; onBack: () => void; goto: (i: number) => void }) {
  const { t } = useI18n();
  const c = app.completeness;
  const p = app.personal;
  return (
    <div>
      {c.complete ? <Callout tone="success" title={t('journey.complete')}>{t('journey.completeBody')}</Callout> : (
        <Callout tone="warn" title={t('journey.incomplete', { n: c.missing.length })}>
          <ul className="mt-1 list-disc ps-5">{c.missing.map((m) => <li key={m.key}><button type="button" className="underline" onClick={() => goto(m.kind === 'field' ? 1 : 2)}>{m.label}</button> <span className="text-xs text-muted">({t(`journey.kind.${m.kind}`)})</span></li>)}</ul>
        </Callout>
      )}
      {c.warnings.length > 0 && <ul className="mt-3 space-y-1 text-xs text-muted">{c.warnings.map((w) => <li key={w} className="flex gap-1.5"><AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-warn" />{w}</li>)}</ul>}
      <div className="mt-4">
        <SectionTitle>{t('journey.step.personal')}</SectionTitle>
        <KeyValue items={[{ k: t('journey.f.fullName'), v: p.full_name ?? '—' }, { k: t('journey.f.nationalIdLast4'), v: p.national_id_last4 ? `•••• ${p.national_id_last4}` : '—' }, { k: t('journey.f.dob'), v: p.date_of_birth ?? '—' }, { k: t('journey.f.phone'), v: p.phone ?? '—' }, { k: 'Email', v: p.email ?? '—' }, { k: t('journey.f.gpa'), v: p.high_school_gpa ?? '—' }, { k: t('journey.f.english'), v: p.english_score ?? '—' }]} />
      </div>
      <StepNav onBack={onBack} onNext={onNext} disabled={!c.complete} nextLabel={t('journey.toSubmit')} />
    </div>
  );
}

function SubmitStep({ app, onBack, onSubmitted }: { app: AdmApp; onBack: () => void; onSubmitted: () => void }) {
  const { t } = useI18n();
  const toast = useToast();
  const [loading, setLoading] = useState(false);
  const [blocked, setBlocked] = useState<{ missing: Array<{ key: string; label: string }> } | null>(null);
  const submit = async () => {
    setLoading(true); setBlocked(null);
    try { await api(`/admission/applications/${app.id}/submit`, { body: {} }); refreshAll('journey'); onSubmitted(); }
    catch (e) { if (e instanceof ApiError && e.status === 422) setBlocked(e.details as never); else toast.error(errorMessage(e)); }
    finally { setLoading(false); }
  };
  return (
    <div>
      <Callout tone="gold" title={t('journey.demoSubmission')}>{t('journey.demoSubmissionBody')}</Callout>
      {blocked && <div className="mt-3"><Callout tone="danger" title={t('journey.blocked')}><ul className="list-disc ps-5">{blocked.missing.map((m) => <li key={m.key}>{m.label}</li>)}</ul></Callout></div>}
      <StepNav onBack={onBack} onNext={() => void submit()} loading={loading} nextLabel={t('journey.submitApplication')} />
    </div>
  );
}

function StatusView({ app, onEdit }: { app: AdmApp; onEdit?: () => void }) {
  const { t, l, locale } = useI18n();
  const toast = useToast();
  const [loading, setLoading] = useState(false);
  const [celebrate, setCelebrate] = useState(false);
  useEffect(() => { if (app.status === 'enrolled') setCelebrate(true); }, [app.status]);
  const accept = async () => {
    setLoading(true);
    try { const r = await api<{ student_no: string }>(`/admission/applications/${app.id}/accept-offer`, { body: {} }); toast.success(t('journey.enrolledToast'), r.student_no); refreshAll('journey', 'persona'); }
    catch (e) { toast.error(errorMessage(e)); } finally { setLoading(false); }
  };
  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-[1fr_360px]">
      <div className="space-y-4">
        {app.status === 'draft' && <EmptyState icon={<FileText className="h-6 w-6" />} title={t('journey.draftTitle')} body={t('journey.draftBody')} action={onEdit && <Button onClick={onEdit}>{t('journey.act.continueApplication')}</Button>} />}
        {app.status === 'needs_information' && <Callout tone="warn" title={t('journey.needsInfo')}>{app.reviewer_note}<div className="mt-2">{onEdit && <Button size="sm" onClick={onEdit}>{t('journey.editResubmit')}</Button>}</div></Callout>}
        {app.status === 'admitted' && <Callout tone="success" title={t('journey.admittedTitle')}>{app.reviewer_note}<div className="mt-3"><Button loading={loading} onClick={() => void accept()} icon={<PartyPopper className="h-4 w-4" />}>{t('journey.acceptOffer')}</Button></div><p className="mt-2 text-xs">{t('journey.acceptOfferNote')}</p></Callout>}
        {app.status === 'rejected' && <Callout tone="danger" title={t('journey.rejectedTitle')}>{app.reviewer_note}</Callout>}
        {app.status === 'enrolled' && <Callout tone="success" title={t('journey.enrolledTitle')}>{t('journey.enrolledBody')} <Link className="underline" to="/journey/onboarding">{t('journey.onboarding')}</Link></Callout>}
        {(app.status === 'submitted' || app.status === 'under_review') && <Callout tone="info" title={`${t('common.status')}: ${t(`status.${app.status}`)}`}>{t('journey.awaitingReview')}</Callout>}
        {app.receipt && (
          <Card>
            <SectionTitle>{t('journey.receipt')} <Badge tone="gold" className="ms-2">{app.receipt.label}</Badge></SectionTitle>
            <div className="flex flex-wrap items-center gap-3"><CopyId value={app.receipt.ref} /><span className="text-sm text-muted">{fmtDateTime(app.receipt.submitted_at, locale)}</span></div>
            <p className="mt-2 text-xs text-muted">{t('journey.receiptNote')}</p>
          </Card>
        )}
        <Card>
          <SectionTitle>{t('journey.statusTimeline')}</SectionTitle>
          <ol className="relative ms-3 border-s border-line ps-5">
            {app.timeline.map((e, i) => <li key={i} className="mb-3 last:mb-0"><span className={clsx('absolute -start-[7px] mt-1 h-3.5 w-3.5 rounded-full border-2 border-surface', i === app.timeline.length - 1 ? 'bg-brand-500' : 'bg-line')} /><div className="flex flex-wrap items-center gap-2 text-sm"><StatusPill status={e.status} /><span>{e.note}</span></div><div className="text-xs text-muted">{fmtDateTime(e.at, locale)}</div></li>)}
          </ol>
        </Card>
        {celebrate && <motion.div initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} className="text-center text-sm text-muted">🎓 {t('journey.welcome')}</motion.div>}
      </div>
      <Card>
        <SectionTitle>{t('journey.summary')}</SectionTitle>
        <KeyValue items={[{ k: t('journey.program'), v: app.program ? l(app.program.name_en, app.program.name_ar) : app.program_id }, { k: t('shell.campus'), v: campusName(app.campus_id, t) }, { k: t('common.status'), v: <StatusPill status={app.status} /> }, { k: t('journey.f.fullName'), v: app.personal.full_name ?? '—' }, { k: t('journey.documents'), v: `${app.checklist.filter((c) => c.status === 'attached').length}/${app.checklist.length}` }]} />
        <p className="mt-3 text-xs text-muted">{t('journey.retainedNote')}</p>
      </Card>
    </div>
  );
}
