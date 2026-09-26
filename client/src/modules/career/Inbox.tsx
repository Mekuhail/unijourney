import { useState } from 'react';
import { Link } from 'react-router';
import { Inbox as InboxIcon, Mail, ShieldAlert, Sparkles, Wand2 } from 'lucide-react';
import clsx from 'clsx';
import { Badge, Button, Callout, EmptyState, ErrorState, Select, Skeleton, StatusPill, Toggle } from '@/components/ui';
import { useToast } from '@/components/ui/toast';
import { useI18n } from '@/i18n';
import { api, errorMessage } from '@/lib/api';
import { refreshAll } from '@/lib/bus';
import { useQuery } from '@/lib/useQuery';
import { fmtDateTime } from '@/lib/format';
import type { EmailsRes, HiringEmail } from './types';

export function Inbox() {
  const { t, locale } = useI18n();
  const toast = useToast();
  const q = useQuery(() => api<EmailsRes>('/career/emails'), [], { refreshOn: ['career'] });
  const [busy, setBusy] = useState<string | null>(null);
  const [choice, setChoice] = useState<Record<string, string>>({});
  const [expanded, setExpanded] = useState<string | null>(null);
  const run = async (key: string, fn: () => Promise<void>) => { setBusy(key); try { await fn(); refreshAll('career'); } catch (e) { toast.error(errorMessage(e)); } finally { setBusy(null); } };
  const accept = (e: HiringEmail) => run(e.id, async () => {
    const r = await api<{ applied: boolean; note: string }>(`/career/emails/${e.id}/accept`, { body: { applicationId: choice[e.id] ?? e.suggested_application_id ?? undefined } });
    if (r.applied) toast.success(t('career.emailApplied'), r.note); else toast.info(t('career.emailLinked'), r.note);
  });
  const dismiss = (e: HiringEmail) => run(e.id, async () => { await api(`/career/emails/${e.id}/dismiss`, { method: 'POST', body: {} }); toast.info(t('status.dismissed')); });
  const classify = () => run('classify', async () => { const r = await api<{ classified: number; autoApplied: number }>('/career/emails/classify', { body: {} }); toast.success(t('career.classified', { n: r.classified, auto: r.autoApplied })); });
  const simulate = () => run('simulate', async () => { await api('/career/emails/simulate', { body: {} }); toast.success(t('career.simulatedEmail'), t('common.simulated')); });
  const toggleAuto = (v: boolean) => run('auto', async () => { await api('/career/settings', { method: 'PUT', body: { autoApplyEmails: v } }); });
  const items = q.data?.items ?? [];
  const pending = items.filter((e) => e.review_status === 'pending');
  return (
    <div className="space-y-4">
      <Callout tone="gold" title={t('career.inboxNote')} icon={<ShieldAlert className="h-4 w-4 text-gold-700" />}>{q.data?.mailbox.note ?? t('career.inboxNoteBody')} {t('career.inboxUntrusted')}</Callout>
      <div className="card flex flex-wrap items-center gap-3 p-4">
        <Toggle checked={!!q.data?.autoApply} onChange={(v) => void toggleAuto(v)} label={t('career.autoApply')} description={t('career.autoApplyBody')} />
        <div className="ms-auto flex gap-2">
          <Button size="sm" variant="outline" icon={<Wand2 className="h-4 w-4" />} loading={busy === 'classify'} onClick={() => void classify()}>{t('career.classify')}</Button>
          <Button size="sm" variant="secondary" icon={<Sparkles className="h-4 w-4" />} loading={busy === 'simulate'} onClick={() => void simulate()}>{t('career.simulateEmail')}</Button>
        </div>
      </div>
      {!!q.error && <ErrorState error={q.error} onRetry={() => void q.refetch()} />}
      {q.loading && !q.data && <div className="space-y-2">{[1, 2, 3].map((i) => <Skeleton key={i} className="h-24" />)}</div>}
      {q.data && items.length === 0 && <EmptyState icon={<InboxIcon className="h-6 w-6" />} title={t('career.noEmails')} body={t('career.noEmailsBody')} action={<Button onClick={() => void simulate()}>{t('career.simulateEmail')}</Button>} />}
      {pending.length > 0 && <div className="text-xs font-semibold uppercase tracking-wide text-muted">{t('career.pendingReview')} · {pending.length}</div>}
      <ul className="space-y-3">
        {items.map((e) => {
          const conf = Math.round(e.confidence * 100);
          const isPending = e.review_status === 'pending';
          return (
            <li key={e.id} className={clsx('card p-4', isPending && 'border-brand-300 dark:border-brand-700')}>
              <div className="flex flex-wrap items-start gap-3">
                <div className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-surface-2 text-muted"><Mail className="h-5 w-5" /></div>
                <div className="min-w-0 flex-1">
                  <button type="button" className="text-start font-semibold hover:underline" onClick={() => setExpanded(expanded === e.id ? null : e.id)}>{e.subject}</button>
                  <div className="text-xs text-muted">{e.from_address} · {fmtDateTime(e.received_at, locale)}</div>
                  <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                    {e.category && <Badge tone={e.category === 'other' ? 'neutral' : 'info'}>{t(`career.cat.${e.category}`)}</Badge>}
                    <Badge tone={conf >= 80 ? 'success' : conf >= 60 ? 'warn' : 'neutral'}>{t('career.confidence')} {conf}%</Badge>
                    {e.ambiguous && <Badge tone="warn" dot>{t('career.ambiguous')}</Badge>}
                    <StatusPill status={e.review_status} />
                    {e.suggested_status && <span className="text-xs text-muted">→ {t('career.suggests')} <strong className="text-fg">{t(`status.${e.suggested_status}`)}</strong></span>}
                  </div>
                  <p className={clsx('mt-2 text-sm text-fg/85', expanded === e.id ? 'whitespace-pre-wrap' : 'line-clamp-2')}>{expanded === e.id ? e.body : e.snippet}</p>
                  {e.suggested_application && !e.ambiguous && <div className="mt-2 text-sm">{t('career.matchedApplication')}: <Link className="font-medium text-brand-600 hover:underline" to={`/career/applications/${e.suggested_application.id}`}>{e.suggested_application.company} – {e.suggested_application.title}</Link> <StatusPill status={e.suggested_application.status} className="ms-1" /> <span className="text-xs text-muted">({t(`career.method.${e.matched_by.method}`)})</span></div>}
                  {e.ambiguous && isPending && (
                    <div className="mt-2 flex flex-wrap items-center gap-2 text-sm">
                      <span>{t('career.chooseApplication')}:</span>
                      <Select className="!w-auto" value={choice[e.id] ?? ''} onChange={(ev) => setChoice({ ...choice, [e.id]: ev.target.value })}><option value="">{t('career.select')}</option>{e.candidates.map((c) => <option key={c.id} value={c.id}>{c.company} – {c.title} ({t(`status.${c.status}`)})</option>)}</Select>
                    </div>
                  )}
                  {!e.suggested_application && !e.ambiguous && isPending && <div className="mt-2 text-xs text-muted">{t('career.noMatch')}</div>}
                </div>
                {isPending && (
                  <div className="flex shrink-0 gap-2">
                    <Button size="sm" variant="ghost" loading={busy === e.id} onClick={() => void dismiss(e)}>{t('career.dismiss')}</Button>
                    <Button size="sm" loading={busy === e.id} disabled={e.ambiguous ? !choice[e.id] : !e.suggested_application_id} onClick={() => void accept(e)}>{t('career.accept')}</Button>
                  </div>
                )}
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
