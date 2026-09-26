import { useState } from 'react';
import { BookOpen, Flag, Check, X, ExternalLink } from 'lucide-react';
import { useI18n } from '@/i18n';
import { useQuery } from '@/lib/useQuery';
import { api, errorMessage } from '@/lib/api';
import { refreshAll } from '@/lib/bus';
import { useToast } from '@/components/ui/toast';
import { PageHeader } from '@/components/ui/PageHeader';
import { Avatar, Badge, Button, Card, EmptyState, ErrorState, Field, Input, SectionTitle, Skeleton, StatusPill, Tabs } from '@/components/ui';
import { fmtDateTime } from '@/lib/format';
import type { ModerationData, Resource } from '../types';
import { PreviewModal, StudyTaskModal } from '../pages/ResourcesPage';

function ModerationRow({ r, onPreview }: { r: Resource; onPreview: (r: Resource) => void }) {
  const { t, l, locale } = useI18n();
  const toast = useToast();
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState<string | null>(null);
  const decide = async (decision: 'published' | 'rejected') => {
    setBusy(decision);
    try { await api(`/campus/moderation/resources/${r.id}`, { body: { decision, note: note || undefined } }); toast.success(t('campus.staff.res.done')); refreshAll('campus'); }
    catch (e) { toast.error(errorMessage(e)); } finally { setBusy(null); }
  };
  return (
    <li className="card p-4">
      <div className="flex flex-wrap items-center gap-1.5"><Badge tone="brand">{r.course_code}</Badge><Badge tone="neutral">{t(`campus.resources.types.${r.type}`)}</Badge><Badge tone="neutral">{locale === 'ar' ? r.term_label_ar : r.term_label}</Badge><StatusPill status={r.status} />{r.open_reports > 0 && <Badge tone="danger"><Flag className="h-3 w-3" />{r.open_reports}</Badge>}{r.rights_confirmed && <Badge tone="success">rights confirmed</Badge>}</div>
      <button type="button" onClick={() => onPreview(r)} className="mt-2 text-start font-semibold hover:text-brand-600">{r.title}</button>
      <p className="text-sm text-muted">{r.description}</p>
      <div className="mt-2 flex items-center gap-2 text-xs text-muted">{r.author && <><Avatar name={r.author.name_en} color={r.author.avatar_color} size={20} />{l(r.author.name_en, r.author.name_ar)}</>}<span>· {fmtDateTime(r.created_at, locale)}</span>{r.document && <a href={`/api/documents/${r.document.id}/file`} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-brand-600 hover:underline touch:min-h-11"><ExternalLink className="h-3 w-3" />{t('campus.staff.res.openFile')}</a>}</div>
      {r.moderation_note && <div className="mt-1 text-xs text-muted">{r.moderation_note}</div>}
      <div className="mt-3 flex flex-col gap-2 sm:flex-row sm:items-end">
        <Field label={t('campus.staff.res.decisionNote')} className="flex-1"><Input value={note} onChange={(e) => setNote(e.target.value)} /></Field>
        <div className="flex gap-2">
          {r.status !== 'published' && <Button variant="success" size="md" loading={busy === 'published'} icon={<Check className="h-4 w-4" />} onClick={() => void decide('published')}>{t('campus.staff.res.publish')}</Button>}
          {r.status !== 'rejected' && <Button variant="outline" loading={busy === 'rejected'} icon={<X className="h-4 w-4" />} onClick={() => void decide('rejected')}>{t('campus.staff.res.reject')}</Button>}
        </div>
      </div>
    </li>
  );
}

export function ResourcesDesk() {
  const { t, locale } = useI18n();
  const toast = useToast();
  const [status, setStatus] = useState<'pending' | 'reported' | 'published' | 'rejected' | 'all'>('pending');
  const q = useQuery(() => api<ModerationData>('/campus/moderation/resources', { query: { status } }), [status], { refreshOn: ['campus'] });
  const [preview, setPreview] = useState<Resource | null>(null);
  const [task, setTask] = useState<Resource | null>(null);
  const resolve = async (id: string, action: 'dismiss' | 'unpublish') => {
    try { await api(`/campus/moderation/reports/${id}/resolve`, { body: { action } }); toast.success(t('campus.staff.res.done')); refreshAll('campus'); }
    catch (e) { toast.error(errorMessage(e)); }
  };
  const c = q.data?.counts;
  const openReports = (q.data?.reports ?? []).filter((r) => r.status === 'open');
  return (
    <div>
      <PageHeader crumbs={[{ to: '/staff', label: t('nav.staff') }]} title={t('campus.staff.res.title')} subtitle={t('campus.staff.res.subtitle')} />
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[1fr_360px]">
        <section>
          <SectionTitle>{t('campus.staff.res.queue')}</SectionTitle>
          <Tabs value={status} onChange={setStatus} className="mb-3 w-fit max-w-full" items={[{ value: 'pending', label: t('status.pending'), count: c?.pending }, { value: 'reported', label: t('status.reported'), count: c?.reported }, { value: 'published', label: t('status.published'), count: c?.published }, { value: 'rejected', label: t('status.rejected'), count: c?.rejected }, { value: 'all', label: t('common.all') }]} />
          {q.loading && <Skeleton className="h-40" />}
          {q.error ? <ErrorState error={q.error} onRetry={() => void q.refetch()} /> : null}
          {q.data && q.data.items.length === 0 && <EmptyState icon={<BookOpen className="h-6 w-6" />} title={t('campus.staff.res.empty')} />}
          <ul className="space-y-3">{q.data?.items.map((r) => <ModerationRow key={r.id} r={r} onPreview={setPreview} />)}</ul>
        </section>
        <aside>
          <SectionTitle action={<Badge tone="danger">{openReports.length}</Badge>}>{t('campus.staff.res.reports')}</SectionTitle>
          {q.data && openReports.length === 0 && <EmptyState icon={<Flag className="h-6 w-6" />} title={t('campus.staff.res.noReports')} />}
          <ul className="space-y-2">
            {openReports.map((rep) => (
              <li key={rep.id}>
                <Card className="p-4">
                  <div className="flex flex-wrap items-center gap-1.5"><Badge tone="brand">{rep.course_code}</Badge><span className="text-sm font-semibold">{rep.resource_title}</span></div>
                  <p className="mt-1 text-sm">{rep.reason}</p>
                  <div className="mt-1 text-xs text-muted">{rep.reporter_name} · {fmtDateTime(rep.created_at, locale)}</div>
                  <div className="mt-2 flex gap-2"><Button size="sm" variant="outline" onClick={() => void resolve(rep.id, 'dismiss')}>{t('campus.staff.res.dismiss')}</Button><Button size="sm" variant="danger" onClick={() => void resolve(rep.id, 'unpublish')}>{t('campus.staff.res.unpublish')}</Button></div>
                </Card>
              </li>
            ))}
          </ul>
        </aside>
      </div>
      <PreviewModal resource={preview} onClose={() => setPreview(null)} onTask={(r) => { setPreview(null); setTask(r); }} />
      <StudyTaskModal resource={task} onClose={() => setTask(null)} />
    </div>
  );
}
