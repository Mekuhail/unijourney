import { createPortal } from 'react-dom';
import { AnimatePresence, motion } from 'motion/react';
import { Link } from 'react-router';
import { Bell, X } from 'lucide-react';
import { useI18n } from '@/i18n';
import { useQuery } from '@/lib/useQuery';
import { api } from '@/lib/api';
import type { Notification } from '@shared/types';
import { Button, EmptyState } from '@/components/ui';
import { fmtRelative } from '@/lib/format';
import { refreshAll } from '@/lib/bus';
import { useDemoStatus } from './DemoClock';
import clsx from 'clsx';

export function NotificationsPanel({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { t, locale } = useI18n();
  const { data, refetch } = useQuery(() => api<{ items: Notification[]; unread: number }>('/notifications'), [open], { enabled: open });
  const { data: status } = useDemoStatus();
  const markRead = async (id: string) => {
    await api(`/notifications/${id}/read`, { method: 'POST' });
    await refetch();
    refreshAll();
  };
  return createPortal(
    <AnimatePresence>
      {open && (
        <motion.div className="fixed inset-0 z-[90] bg-ink-950/40 backdrop-blur-[2px]" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
          <motion.aside role="dialog" aria-label={t('nav.notifications')} className="absolute inset-y-0 end-0 flex w-[min(100vw,400px)] flex-col bg-surface shadow-2xl" initial={{ x: locale === 'ar' ? -40 : 40, opacity: 0 }} animate={{ x: 0, opacity: 1 }} exit={{ x: locale === 'ar' ? -40 : 40, opacity: 0 }} transition={{ type: 'spring', stiffness: 380, damping: 34 }}>
            <div className="flex items-center justify-between border-b border-line px-4 py-3">
              <h2 className="flex items-center gap-2 font-semibold"><Bell className="h-4 w-4 text-brand-500" />{t('nav.notifications')}</h2>
              <div className="flex items-center gap-1">
                {!!data?.unread && <Button size="sm" variant="ghost" onClick={() => void markRead('all')}>{t('shell.markAllRead')}</Button>}
                <button onClick={onClose} className="rounded-lg p-1.5 text-muted hover:bg-line/60" aria-label={t('common.close')}><X className="h-5 w-5" /></button>
              </div>
            </div>
            <div className="scroll-thin flex-1 overflow-y-auto p-3">
              {data && data.items.length === 0 && <EmptyState title={t('shell.noNotifications')} icon={<Bell className="h-6 w-6" />} />}
              <ul className="space-y-2">
                {data?.items.map((n, i) => (
                  <li key={n.id}>
                    <Link to={n.link ?? '/notifications'} onClick={() => { if (!n.read_at) void markRead(n.id); onClose(); }} className={clsx('block rounded-2xl border p-3 transition hover:border-brand-400', n.read_at ? 'border-line bg-surface' : 'border-brand-200 bg-brand-50/70 dark:border-brand-800 dark:bg-brand-900/20')}>
                      <div className="flex items-start justify-between gap-2">
                        <div className="text-sm font-semibold">{n.title}</div>
                        {!n.read_at && <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-brand-500" aria-label="unread" />}
                      </div>
                      {n.body && <div className="mt-0.5 text-xs text-muted">{n.body}</div>}
                      <div className="mt-1.5 text-[11px] text-muted">{n.module} · {status ? fmtRelative(n.created_at, status.clock, locale) : ''}</div>
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          </motion.aside>
        </motion.div>
      )}
    </AnimatePresence>,
    document.body
  );
}
