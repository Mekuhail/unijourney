import { useMemo, useState } from 'react';
import clsx from 'clsx';
import { Megaphone, CalendarDays } from 'lucide-react';
import { useI18n } from '@/i18n';
import { api, errorMessage } from '@/lib/api';
import { refreshAll } from '@/lib/bus';
import { useQuery } from '@/lib/useQuery';
import { useToast } from '@/components/ui/toast';
import { Button, EmptyState, ErrorState, Field, Modal, Skeleton, Textarea, Toggle } from '@/components/ui';
import type { Club, EventItem } from '../types';
import { CommunityShell, Ticket, isWorkshop, ticketFromEvent } from './shared';
import { useUpcomingEvents } from './HomePage';

type Filter = 'all' | 'workshops' | 'week' | 'going';

/** Officers announce an event through the existing club post workflow (role-checked by the server). */
function AnnounceDialog({ event, club, onClose }: { event: EventItem; club: Club; onClose: () => void }) {
  const { t, l } = useI18n();
  const toast = useToast();
  const title = l(event.title_en, event.title_ar || event.title_en);
  const [body, setBody] = useState(t('social.events.announceDefault', { title }));
  const [pin, setPin] = useState(true);
  const [busy, setBusy] = useState(false);
  const send = async () => {
    setBusy(true);
    try {
      await api(`/campus/clubs/${club.id}/posts`, { method: 'POST', body: { kind: 'announcement', body: body.trim(), event_id: event.id, pin, notify: true } });
      toast.success(t('social.events.announced'));
      refreshAll('community', 'notifications');
      onClose();
    } catch (e) { toast.error(errorMessage(e)); } finally { setBusy(false); }
  };
  return (
    <Modal open onClose={onClose} title={t('social.events.announceTitle', { title })} description={t('social.events.announceBody', { club: l(club.name_en, club.name_ar) })} footer={<><Button variant="ghost" onClick={onClose}>{t('common.cancel')}</Button><Button loading={busy} disabled={body.trim().length < 2} onClick={() => void send()}>{t('community.post')}</Button></>}>
      <div className="space-y-3">
        <Field label={t('social.events.announceText')}><Textarea rows={4} maxLength={1500} value={body} onChange={(e) => setBody(e.target.value)} /></Field>
        <Toggle checked={pin} onChange={setPin} label={t('community.pinPost')} />
      </div>
    </Modal>
  );
}

export function CommunityEvents() {
  const { t } = useI18n();
  const [filter, setFilter] = useState<Filter>('all');
  const [announce, setAnnounce] = useState<{ event: EventItem; club: Club } | null>(null);
  const events = useUpcomingEvents();
  const clubs = useQuery(() => api<Club[]>('/campus/clubs'), [], { refreshOn: ['campus'] });
  const moderated = useMemo(() => new Map((clubs.data ?? []).filter((c) => c.can_moderate).map((c) => [c.id, c])), [clubs.data]);
  const upcoming = (events.data ?? []).filter((e) => !e.is_past && (e.kind === 'club' || e.kind === 'university'));
  const weekEnd = upcoming.length ? new Date(new Date(upcoming[0].start_at).getTime() + 7 * 864e5).toISOString() : '';
  const list = upcoming.filter((e) => filter === 'all' || (filter === 'workshops' && isWorkshop(e)) || (filter === 'week' && new Date(e.start_at).toISOString() <= weekEnd) || (filter === 'going' && (e.my_rsvp?.status === 'going' || e.my_rsvp?.status === 'waitlisted')));
  return (
    <CommunityShell doc={t('social.events.title')}>
      <h2 className="font-display text-2xl">{t('social.events.title')}</h2>
      <p className="mb-4 max-w-2xl text-sm text-muted">{t('social.events.body')}</p>
      <div role="group" aria-label={t('social.events.filter')} className="mb-5 flex flex-wrap gap-2">
        {(['all', 'workshops', 'week', 'going'] as Filter[]).map((f) => (
          <button key={f} type="button" aria-pressed={filter === f} onClick={() => setFilter(f)} className={clsx('inline-flex min-h-11 items-center rounded-full border px-4 text-sm font-medium transition sm:min-h-9', filter === f ? 'border-brand-500 bg-brand-500 text-ink-950' : 'border-line bg-surface hover:border-brand-400')}>{t(`social.events.${f}`)}</button>
        ))}
      </div>
      {events.loading && !events.data && <div className="grid gap-3 md:grid-cols-2">{[1, 2, 3, 4].map((i) => <Skeleton key={i} className="h-36" />)}</div>}
      {events.error ? <ErrorState error={events.error} onRetry={() => void events.refetch()} /> : null}
      {events.data && list.length === 0 && <EmptyState icon={<CalendarDays className="h-6 w-6" />} title={t('social.events.empty')} />}
      <div className="grid gap-3 md:grid-cols-2">
        {list.map((e) => {
          const club = e.club_id ? moderated.get(e.club_id) : undefined;
          return <Ticket key={e.id} e={ticketFromEvent(e)} action={club ? <Button size="sm" variant="outline" icon={<Megaphone className="h-4 w-4" aria-hidden />} onClick={() => setAnnounce({ event: e, club })}>{t('social.events.announce')}</Button> : undefined} />;
        })}
      </div>
      {announce && <AnnounceDialog event={announce.event} club={announce.club} onClose={() => setAnnounce(null)} />}
    </CommunityShell>
  );
}
