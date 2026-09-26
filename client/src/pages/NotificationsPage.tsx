import { Link } from 'react-router';
import { Bell, Mail } from 'lucide-react';
import { useI18n } from '@/i18n';
import { useQuery } from '@/lib/useQuery';
import { api } from '@/lib/api';
import type { Notification } from '@shared/types';
import { PageHeader } from '@/components/ui/PageHeader';
import { Card, EmptyState, Button, Badge, Modal } from '@/components/ui';
import { fmtDateTime } from '@/lib/format';
import { refreshAll } from '@/lib/bus';
import { useState } from 'react';
import clsx from 'clsx';

interface EmailRow { id: string; to_address: string; subject: string; status: string; module: string; created_at: string }

export function NotificationsPage() {
  const { t, locale } = useI18n();
  const q = useQuery(() => api<{ items: Notification[]; unread: number }>('/notifications'));
  const emails = useQuery(() => api<EmailRow[]>('/emails'));
  const [emailId, setEmailId] = useState<string | null>(null);
  const email = useQuery(() => api<{ subject: string; html: string; to_address: string; created_at: string; status: string }>(`/emails/${emailId}`), [emailId], { enabled: !!emailId });
  const markAll = async () => { await api('/notifications/all/read', { method: 'POST' }); refreshAll(); };
  return (
    <div>
      <PageHeader title={t('nav.notifications')} subtitle={t('notifications.subtitle')} actions={!!q.data?.unread && <Button variant="outline" onClick={() => void markAll()}>{t('shell.markAllRead')}</Button>} />
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[1fr_380px]">
        <div className="space-y-2">
          {q.data && q.data.items.length === 0 && <EmptyState icon={<Bell className="h-6 w-6" />} title={t('shell.noNotifications')} />}
          {q.data?.items.map((n) => (
            <Link key={n.id} to={n.link ?? '#'} onClick={() => { if (!n.read_at) void api(`/notifications/${n.id}/read`, { method: 'POST' }).then(() => refreshAll()); }} className={clsx('card block p-4 transition hover:border-brand-400', !n.read_at && 'border-brand-300 dark:border-brand-700')}>
              <div className="flex items-start justify-between gap-3">
                <div>
                  <div className="font-semibold">{n.title}</div>
                  <div className="text-sm text-muted">{n.body}</div>
                </div>
                <Badge tone="neutral">{t(`module.${n.module}`)}</Badge>
              </div>
              <div className="mt-2 text-xs text-muted">{fmtDateTime(n.created_at, locale)}</div>
            </Link>
          ))}
        </div>
        <Card>
          <div className="mb-3 flex items-center gap-2 font-semibold"><Mail className="h-4 w-4 text-gold-700" aria-hidden /> {t('notifications.outbox')}</div>
          {emails.data && emails.data.length === 0 && <div className="text-sm text-muted">{t('notifications.noEmails')}</div>}
          <ul className="space-y-2">
            {emails.data?.map((e) => (
              <li key={e.id}>
                <button onClick={() => setEmailId(e.id)} className="w-full rounded-xl border border-line bg-surface-2 p-3 text-start text-sm hover:border-brand-400">
                  <div className="font-medium">{e.subject}</div>
                  <div className="text-xs text-muted">{e.to_address} · {fmtDateTime(e.created_at, locale)}</div>
                </button>
              </li>
            ))}
          </ul>
        </Card>
      </div>
      <Modal open={!!emailId} onClose={() => setEmailId(null)} title={email.data?.subject ?? '…'} size="lg" description={email.data ? `To ${email.data.to_address} · ${t('common.simulated')} (never sent)` : undefined}>
        {email.data && <iframe title="email preview" className="h-[60vh] w-full rounded-xl border border-line bg-white" sandbox="" srcDoc={email.data.html} />}
      </Modal>
    </div>
  );
}
