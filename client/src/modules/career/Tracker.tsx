import { useMemo, useState } from 'react';
import { Link } from 'react-router';
import { motion } from 'motion/react';
import { Plus, CalendarClock, Mail, ChevronRight, KanbanSquare } from 'lucide-react';
import clsx from 'clsx';
import { Badge, Button, EmptyState, ErrorState, Field, Input, Modal, Select, Skeleton, StatusPill } from '@/components/ui';
import { useToast } from '@/components/ui/toast';
import { useI18n } from '@/i18n';
import { api, errorMessage } from '@/lib/api';
import { refreshAll } from '@/lib/bus';
import { useQuery } from '@/lib/useQuery';
import { fmtDate, fmtDateTime } from '@/lib/format';
import { StatusDialog } from './StatusDialog';
import { APP_STATUSES, TYPE_LABEL, type AppStatus, type Application } from './types';

const COLUMNS: Array<{ key: string; statuses: AppStatus[] }> = [
  { key: 'saved', statuses: ['saved'] }, { key: 'preparing', statuses: ['preparing'] }, { key: 'applied', statuses: ['applied'] }, { key: 'assessment', statuses: ['assessment'] }, { key: 'interview', statuses: ['interview'] }, { key: 'offer', statuses: ['offer'] }, { key: 'closed', statuses: ['rejected', 'withdrawn'] }
];

export function Tracker() {
  const { t, locale } = useI18n();
  const q = useQuery(() => api<{ items: Application[] }>('/career/applications'), [], { refreshOn: ['career', 'calendar'] });
  const [statusFor, setStatusFor] = useState<Application | null>(null);
  const [newOpen, setNewOpen] = useState(false);
  const byCol = useMemo(() => COLUMNS.map((c) => ({ ...c, items: (q.data?.items ?? []).filter((a) => c.statuses.includes(a.status)) })), [q.data]);
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="text-sm text-muted">{t('career.trackerHint')}</div>
        <Button size="sm" icon={<Plus className="h-4 w-4" />} onClick={() => setNewOpen(true)}>{t('career.newApplication')}</Button>
      </div>
      {!!q.error && <ErrorState error={q.error} onRetry={() => void q.refetch()} />}
      {q.loading && !q.data && <div className="grid grid-cols-1 gap-3 md:grid-cols-4">{[1, 2, 3, 4].map((i) => <Skeleton key={i} className="h-40" />)}</div>}
      {q.data && q.data.items.length === 0 && <EmptyState icon={<KanbanSquare className="h-6 w-6" />} title={t('career.noApplications')} body={t('career.noApplicationsBody')} action={<Button onClick={() => setNewOpen(true)}>{t('career.newApplication')}</Button>} />}
      {q.data && q.data.items.length > 0 && (
        <div className="scroll-thin -mx-1 flex snap-x gap-3 overflow-x-auto px-1 pb-3">
          {byCol.map((col) => (
            <section key={col.key} className="card-2 flex w-[82vw] shrink-0 snap-start flex-col p-2 sm:w-60" aria-label={t(`career.col.${col.key}`)}>
              <header className="mb-2 flex items-center justify-between px-1 text-xs font-semibold uppercase tracking-wide text-muted"><span>{t(`career.col.${col.key}`)}</span><span className="rounded-full bg-line px-1.5 text-xs">{col.items.length}</span></header>
              <div className="flex flex-col gap-2">
                {col.items.map((a) => (
                  <motion.article key={a.id} layout className="card p-3 text-sm">
                    <Link to={`/career/applications/${a.id}`} className="block">
                      <div className="flex items-start justify-between gap-2"><span className="line-clamp-2 font-semibold leading-snug">{a.title}</span><ChevronRight className="h-4 w-4 shrink-0 text-muted rtl:rotate-180" /></div>
                      <div className="text-xs text-muted">{a.company}</div>
                    </Link>
                    <div className="mt-2 flex flex-wrap items-center gap-1.5">
                      <StatusPill status={a.status} />
                      <Badge tone="neutral">{TYPE_LABEL[a.type] ?? a.type}</Badge>
                      {a.emails_count > 0 && <span className="inline-flex items-center gap-1 text-xs text-muted"><Mail className="h-3 w-3" />{a.emails_count}</span>}
                    </div>
                    {a.next_interview && <div className="mt-2 flex items-center gap-1 text-xs text-info"><CalendarClock className="h-3.5 w-3.5" />{fmtDateTime(a.next_interview.start_at, locale)}</div>}
                    {a.deadline && !a.next_interview && <div className="mt-2 text-xs text-muted">{t('career.deadline')}: {fmtDate(a.deadline, locale)}</div>}
                    <div className="mt-2 flex items-center justify-between">
                      <span className="text-xs text-muted">{a.last_event ? fmtDate(a.last_event.created_at, locale) : ''}</span>
                      <Button size="sm" variant="outline" onClick={() => setStatusFor(a)}>{t('career.changeStatus')}</Button>
                    </div>
                  </motion.article>
                ))}
                {col.items.length === 0 && <div className="rounded-xl border border-dashed border-line p-3 text-center text-xs text-muted">{t('common.empty')}</div>}
              </div>
            </section>
          ))}
        </div>
      )}
      <StatusDialog app={statusFor} onClose={() => setStatusFor(null)} />
      <NewApplicationDialog open={newOpen} onClose={() => setNewOpen(false)} />
    </div>
  );
}

function NewApplicationDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { t } = useI18n();
  const toast = useToast();
  const [form, setForm] = useState({ company: '', title: '', url: '', type: 'internship' });
  const [err, setErr] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const submit = async () => {
    setErr(null); setLoading(true);
    try {
      const r = await api<Application>('/career/applications', { body: { company: form.company, title: form.title, url: form.url || undefined, type: form.type } });
      if (r.duplicate) toast.info(t('career.alreadyTracked'), `${r.company} – ${r.title}`);
      else toast.success(t('career.trackedToast'));
      refreshAll('career');
      setForm({ company: '', title: '', url: '', type: 'internship' });
      onClose();
    } catch (e) { setErr(errorMessage(e)); } finally { setLoading(false); }
  };
  return (
    <Modal open={open} onClose={onClose} title={t('career.newApplication')} description={t('career.newApplicationBody')} size="sm" footer={<><Button variant="ghost" onClick={onClose}>{t('common.cancel')}</Button><Button loading={loading} disabled={!form.company.trim() || !form.title.trim()} onClick={() => void submit()}>{t('career.create')}</Button></>}>
      <form className="space-y-3" onSubmit={(e) => { e.preventDefault(); void submit(); }}>
        <Field label={t('career.company')} required><Input value={form.company} onChange={(e) => setForm({ ...form, company: e.target.value })} autoFocus /></Field>
        <Field label={t('career.titleField')} required><Input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} /></Field>
        <Field label={t('career.type')}><Select value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value })}>{Object.entries(TYPE_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</Select></Field>
        <Field label="URL" hint={t('career.urlDedupeHint')} error={err}><Input value={form.url} onChange={(e) => setForm({ ...form, url: e.target.value })} placeholder="https://…" /></Field>
        <div className={clsx('text-xs text-muted')}>{t('career.statusVocabulary')}: {APP_STATUSES.map((s) => t(`status.${s}`)).join(' → ')}</div>
      </form>
    </Modal>
  );
}
