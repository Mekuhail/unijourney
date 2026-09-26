import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router';
import { ArrowLeft, CalendarPlus, ExternalLink, FileText, Mail, Trash2, Wand2, Copy, CheckCircle2, AlertTriangle } from 'lucide-react';
import clsx from 'clsx';
import { PageHeader } from '@/components/ui/PageHeader';
import { Badge, Button, Callout, Card, ConfirmDialog, ErrorState, Field, Input, KeyValue, Modal, SectionTitle, Select, Skeleton, StatusPill, Textarea, Toggle } from '@/components/ui';
import { useToast } from '@/components/ui/toast';
import { useI18n } from '@/i18n';
import { api, errorMessage } from '@/lib/api';
import { refreshAll } from '@/lib/bus';
import { useQuery } from '@/lib/useQuery';
import { fmtDate, fmtDateTime, fmtTime } from '@/lib/format';
import { StatusDialog } from './StatusDialog';
import { STATUS_RANK, TYPE_LABEL, type ApplicationDetail, type Conflict, type Interview, type PrepareDraft } from './types';

export function ApplicationPage() {
  const { id } = useParams();
  const { t, locale } = useI18n();
  const toast = useToast();
  const nav = useNavigate();
  const q = useQuery(() => api<ApplicationDetail>(`/career/applications/${id}`), [id], { refreshOn: ['career', 'calendar'] });
  const a = q.data;
  const [statusOpen, setStatusOpen] = useState(false);
  const [interviewOpen, setInterviewOpen] = useState(false);
  const [prepareOpen, setPrepareOpen] = useState(false);
  const [notes, setNotes] = useState('');
  const [cv, setCv] = useState('');
  const [deadline, setDeadline] = useState('');
  const [saving, setSaving] = useState(false);
  const [conflicts, setConflicts] = useState<Conflict[] | null>(null);
  const [delInterview, setDelInterview] = useState<Interview | null>(null);
  useEffect(() => { if (a) { setNotes(a.notes); setCv(a.cv_version ?? ''); setDeadline(a.deadline ?? ''); } }, [a?.id, a?.updated_at]); // eslint-disable-line react-hooks/exhaustive-deps

  if (q.error) return <div><ErrorState error={q.error} onRetry={() => void q.refetch()} /><Button variant="ghost" className="mt-3" onClick={() => nav('/career?tab=tracker')}>{t('common.back')}</Button></div>;
  if (!a) return <div className="space-y-3"><Skeleton className="h-16" /><Skeleton className="h-64" /></div>;

  const saveMeta = async () => {
    setSaving(true);
    try {
      await api(`/career/applications/${a.id}`, { method: 'PUT', body: { notes, cv_version: cv || null, deadline: deadline || null } });
      toast.success(t('common.save'));
      refreshAll('career');
    } catch (e) { toast.error(errorMessage(e)); } finally { setSaving(false); }
  };
  const removeInterview = async () => {
    if (!delInterview) return;
    try { await api(`/career/interviews/${delInterview.id}`, { method: 'DELETE' }); toast.success(t('career.interviewRemoved')); refreshAll('career', 'calendar'); } catch (e) { toast.error(errorMessage(e)); } finally { setDelInterview(null); }
  };

  return (
    <div>
      <Link to="/career?tab=tracker" className="mb-3 inline-flex items-center gap-1 text-sm text-muted hover:text-fg min-h-11"><ArrowLeft className="h-4 w-4 rtl:rotate-180" />{t('career.backToTracker')}</Link>
      <PageHeader eyebrow={`${t('nav.career')} · ${TYPE_LABEL[a.type] ?? a.type}`} title={a.title} subtitle={<span className="flex flex-wrap items-center gap-2">{a.company}<StatusPill status={a.status} />{a.applied_at && <Badge tone="brand">{t('career.appliedOn')} {fmtDate(a.applied_at, locale)} · {t('career.attestedBy')} {a.attested_by}</Badge>}</span>}
        actions={<><Button variant="outline" icon={<Wand2 className="h-4 w-4" />} onClick={() => setPrepareOpen(true)}>{t('career.prepare')}</Button><Button variant="outline" icon={<CalendarPlus className="h-4 w-4" />} onClick={() => setInterviewOpen(true)}>{t('career.addInterview')}</Button><Button onClick={() => setStatusOpen(true)}>{t('career.changeStatus')}</Button></>} />

      {conflicts && conflicts.length > 0 && (
        <Callout tone="warn" title={t('career.conflictTitle')} icon={<AlertTriangle className="h-4 w-4 text-warn" />}>
          <ul className="list-disc ps-5">{conflicts.map((c) => <li key={c.entry.id}>{c.entry.title} · {fmtDateTime(c.entry.start_at, locale)}–{fmtTime(c.entry.end_at, locale)} ({c.overlapMinutes} {t('common.minutes')})</li>)}</ul>
          <div className="mt-1 text-xs">{t('career.conflictBody')} <Link className="underline" to="/calendar">{t('nav.calendar')}</Link></div>
        </Callout>
      )}
      {conflicts && conflicts.length === 0 && <Callout tone="success" title={t('common.noConflict')}>{t('career.interviewAdded')}</Callout>}

      <div className="mt-4 grid gap-6 lg:grid-cols-[1fr_360px]">
        <div className="space-y-6">
          <Card>
            <SectionTitle>{t('career.timeline')}</SectionTitle>
            <ol className="relative ms-3 border-s border-line ps-5">
              {a.events.map((e, i) => (
                <li key={e.id} className="mb-4 last:mb-0">
                  <span className={clsx('absolute -start-[7px] mt-1 h-3.5 w-3.5 rounded-full border-2 border-surface', i === a.events.length - 1 ? 'bg-brand-500' : 'bg-line')} />
                  <div className="flex flex-wrap items-center gap-2 text-sm"><StatusPill status={e.to_status} />{e.from_status && e.from_status !== e.to_status && <span className="text-xs text-muted">{t('career.from')} {t(`status.${e.from_status}`)}</span>}<Badge tone={e.source === 'correction' ? 'warn' : e.source === 'email' ? 'info' : 'neutral'}>{t(`career.source.${e.source}`)}</Badge></div>
                  {e.note && <div className="mt-0.5 text-sm text-fg/85">{e.note}</div>}
                  <div className="text-xs text-muted">{fmtDateTime(e.created_at, locale)}</div>
                </li>
              ))}
            </ol>
          </Card>

          <Card>
            <SectionTitle>{t('career.interviews')}</SectionTitle>
            {a.interviews.length === 0 && <div className="text-sm text-muted">{t('career.noInterviews')}</div>}
            <ul className="space-y-2">
              {a.interviews.map((iv) => (
                <li key={iv.id} className="card-2 flex flex-wrap items-center gap-3 p-3 text-sm">
                  <div className="min-w-0 flex-1">
                    <div className="font-semibold">{fmtDateTime(iv.start_at, locale)} – {fmtTime(iv.end_at, locale)} <Badge tone="info" className="ms-1">{iv.kind}</Badge></div>
                    <div className="text-xs text-muted">{iv.location ?? t('career.online')} · Asia/Riyadh{iv.link && <> · <a href={iv.link} target="_blank" rel="noreferrer" className="text-brand-600 hover:underline">{t('career.joinLink')}</a></>}</div>
                    {iv.notes && <div className="mt-1 text-xs">{iv.notes}</div>}
                  </div>
                  <Link to="/calendar" className="inline-flex items-center gap-1 text-xs text-success min-h-11"><CheckCircle2 className="h-4 w-4" />{t('career.onCalendar')}</Link>
                  <Button size="sm" variant="ghost" icon={<Trash2 className="h-4 w-4" />} onClick={() => setDelInterview(iv)} aria-label={t('common.remove')} />
                </li>
              ))}
            </ul>
          </Card>

          <Card>
            <SectionTitle>{t('career.linkedEmails')}</SectionTitle>
            {a.emails.length === 0 && <div className="text-sm text-muted">{t('career.noEmails')}</div>}
            <ul className="space-y-2">
              {a.emails.map((e) => (
                <li key={e.id} className="card-2 p-3 text-sm">
                  <div className="flex flex-wrap items-center gap-2"><Mail className="h-4 w-4 text-muted" /><span className="font-medium">{e.subject}</span>{e.category && <Badge tone="info">{t(`career.cat.${e.category}`)}</Badge>}<StatusPill status={e.review_status} /></div>
                  <div className="text-xs text-muted">{e.from_address} · {fmtDateTime(e.received_at, locale)}</div>
                </li>
              ))}
            </ul>
            <Link to="/career?tab=inbox" className="inline-flex min-h-11 items-center mt-2 text-xs text-brand-600 hover:underline">{t('career.openInbox')}</Link>
          </Card>
        </div>

        <div className="space-y-6">
          <Card>
            <SectionTitle>{t('common.details')}</SectionTitle>
            <KeyValue items={[
              { k: t('career.company'), v: a.company },
              { k: t('career.type'), v: TYPE_LABEL[a.type] ?? a.type },
              { k: t('career.source'), v: a.opportunity ? <Badge tone="gold">{a.opportunity.source}</Badge> : t('career.manualEntry') },
              { k: 'URL', v: a.url ? <a className="inline-flex items-center gap-1 text-brand-600 hover:underline touch:min-h-11" href={a.url} target="_blank" rel="noreferrer">{t('career.sourceLink')}<ExternalLink className="h-3.5 w-3.5" /></a> : '—' },
              { k: t('career.created'), v: fmtDate(a.created_at, locale) }
            ]} />
            {a.opportunity?.match && <div className="mt-3 text-xs text-muted">{t('career.matchScore')}: <span className="font-semibold text-fg">{a.opportunity.match.score}</span> · {a.opportunity.match.missing.length ? `${t('career.missingSkills')}: ${a.opportunity.match.missing.join(', ')}` : t('career.noMissing')}</div>}
          </Card>
          <Card>
            <SectionTitle>{t('career.notesCv')}</SectionTitle>
            <form className="space-y-3" onSubmit={(e) => { e.preventDefault(); void saveMeta(); }}>
              <Field label={t('career.cvVersion')}><Select value={cv} onChange={(e) => setCv(e.target.value)}><option value="">{t('common.none')}</option>{a.profile.cv_versions.map((v) => <option key={v.id} value={v.id}>{v.label}</option>)}</Select></Field>
              <Field label={t('career.deadline')}><Input type="date" value={deadline} onChange={(e) => setDeadline(e.target.value)} /></Field>
              <Field label={t('career.notes')}><Textarea value={notes} onChange={(e) => setNotes(e.target.value)} placeholder={t('career.notesPlaceholder')} /></Field>
              <Button type="submit" loading={saving} variant="secondary" icon={<FileText className="h-4 w-4" />}>{t('common.save')}</Button>
            </form>
          </Card>
        </div>
      </div>

      <StatusDialog app={statusOpen ? a : null} onClose={() => setStatusOpen(false)} />
      <InterviewDialog open={interviewOpen} app={a} onClose={() => setInterviewOpen(false)} onCreated={(c) => { setConflicts(c); }} />
      <PrepareDialog open={prepareOpen} appId={a.id} onClose={() => setPrepareOpen(false)} />
      <ConfirmDialog open={!!delInterview} onClose={() => setDelInterview(null)} onConfirm={removeInterview} title={t('career.removeInterview')} body={t('career.removeInterviewBody')} danger confirmLabel={t('common.remove')} />
    </div>
  );
}

function InterviewDialog({ open, app, onClose, onCreated }: { open: boolean; app: ApplicationDetail; onClose: () => void; onCreated: (c: Conflict[]) => void }) {
  const { t } = useI18n();
  const toast = useToast();
  const [form, setForm] = useState({ date: '2026-10-05', start: '10:00', end: '11:00', location: '', link: '', kind: 'interview', notes: '' });
  const [advance, setAdvance] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const canAdvance = !app.terminal && STATUS_RANK[app.status] < STATUS_RANK.interview;
  const submit = async () => {
    setErr(null); setLoading(true);
    try {
      const r = await api<{ conflicts: Conflict[]; statusChanged: boolean }>(`/career/applications/${app.id}/interviews`, { body: { start_at: `${form.date}T${form.start}:00+03:00`, end_at: `${form.date}T${form.end}:00+03:00`, location: form.location || null, link: form.link || null, kind: form.kind, notes: form.notes || null, advance: canAdvance && advance } });
      toast.success(t('career.interviewAdded'), r.conflicts.length ? t('career.conflictTitle') : t('common.noConflict'));
      onCreated(r.conflicts);
      refreshAll('career', 'calendar');
      onClose();
    } catch (e) { setErr(errorMessage(e)); } finally { setLoading(false); }
  };
  return (
    <Modal open={open} onClose={onClose} title={t('career.addInterview')} description={t('career.addInterviewBody')} size="sm" footer={<><Button variant="ghost" onClick={onClose}>{t('common.cancel')}</Button><Button loading={loading} onClick={() => void submit()}>{t('common.addToCalendar')}</Button></>}>
      <form className="space-y-3" onSubmit={(e) => { e.preventDefault(); void submit(); }}>
        <Field label={t('common.date')} required><Input type="date" value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} /></Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label={t('career.start')} required><Input type="time" value={form.start} onChange={(e) => setForm({ ...form, start: e.target.value })} /></Field>
          <Field label={t('career.end')} required error={err}><Input type="time" value={form.end} onChange={(e) => setForm({ ...form, end: e.target.value })} /></Field>
        </div>
        <Field label={t('career.kind')}><Select value={form.kind} onChange={(e) => setForm({ ...form, kind: e.target.value })}>{['interview', 'technical', 'hr', 'panel', 'assessment'].map((k) => <option key={k} value={k}>{t(`career.kind.${k}`)}</option>)}</Select></Field>
        <Field label={t('common.location')} hint={t('career.locationHint')}><Input value={form.location} onChange={(e) => setForm({ ...form, location: e.target.value })} /></Field>
        <Field label={t('career.joinLink')}><Input value={form.link} onChange={(e) => setForm({ ...form, link: e.target.value })} placeholder="https://meet.…" /></Field>
        <Field label={t('career.notes')}><Textarea value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} className="min-h-[64px]" /></Field>
        {canAdvance && <Toggle checked={advance} onChange={setAdvance} label={t('career.advanceToInterview')} description={t('career.advanceBody')} />}
        <p className="text-xs text-muted">{t('career.tzNote')}</p>
      </form>
    </Modal>
  );
}

function PrepareDialog({ open, appId, onClose }: { open: boolean; appId: string; onClose: () => void }) {
  const { t } = useI18n();
  const toast = useToast();
  const q = useQuery(() => api<PrepareDraft>(`/career/applications/${appId}/prepare`, { method: 'POST', body: {} }), [appId, open], { enabled: open });
  const copy = (s: string) => { void navigator.clipboard?.writeText(s); toast.success(t('common.copied')); };
  return (
    <Modal open={open} onClose={onClose} title={t('career.prepare')} description={t('career.prepareBody')} size="lg" footer={<Button variant="ghost" onClick={onClose}>{t('common.close')}</Button>}>
      {!!q.error && <ErrorState error={q.error} onRetry={() => void q.refetch()} />}
      {!q.data && !q.error && <div className="space-y-2"><Skeleton className="h-8" /><Skeleton className="h-40" /></div>}
      {q.data && (
        <div className="space-y-4">
          <Callout tone="gold" title={q.data.label}>{t('career.prepareLabelBody')} · {t('career.provider')}: {q.data.provider === 'anthropic' ? 'AI-polished (Anthropic)' : t('career.templateProvider')}</Callout>
          <div>
            <SectionTitle action={<Button size="sm" variant="ghost" icon={<Copy className="h-4 w-4" />} onClick={() => copy(Object.entries(q.data!.fields).map(([k, v]) => `${k}: ${v}`).join('\n'))}>{t('common.copy')}</Button>}>{t('career.autofillFields')}</SectionTitle>
            <dl className="grid grid-cols-1 gap-x-4 gap-y-1 text-sm sm:grid-cols-2">{Object.entries(q.data.fields).map(([k, v]) => <div key={k} className="flex gap-2 border-b border-line/60 py-1"><dt className="w-36 shrink-0 text-muted">{k.replace(/_/g, ' ')}</dt><dd className="min-w-0 break-words font-medium">{String(v) || <span className="text-muted">—</span>}</dd></div>)}</dl>
          </div>
          <div>
            <SectionTitle action={<Button size="sm" variant="ghost" icon={<Copy className="h-4 w-4" />} onClick={() => copy(q.data!.cover_note)}>{t('common.copy')}</Button>}>{t('career.coverNote')}</SectionTitle>
            <pre className="whitespace-pre-wrap rounded-xl border border-line bg-surface-2 p-3 font-sans text-sm leading-relaxed">{q.data.cover_note}</pre>
          </div>
          {q.data.missing_skills.length > 0 && <Callout tone="warn" title={t('career.missingSkills')}>{t('career.prepareMissing', { skills: q.data.missing_skills.join(', ') })}</Callout>}
        </div>
      )}
    </Modal>
  );
}
