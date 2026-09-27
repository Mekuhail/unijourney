import { Link, useNavigate } from 'react-router';
import { Users, IdCard, ArrowRight, CalendarDays } from 'lucide-react';
import { readableOn } from '@/lib/color';
import { useI18n } from '@/i18n';
import { useQuery } from '@/lib/useQuery';
import { api } from '@/lib/api';
import { PageHeader } from '@/components/ui/PageHeader';
import { Badge, Button, EmptyState, ErrorState, SectionTitle, Skeleton, StatusPill, SectionLink } from '@/components/ui';
import type { Club, EventItem } from '../types';
import { EventCard } from '../lib';
import { CommunityEntry } from '../social/MorePages';
import { openStudentCard } from '@/shell/StudentCard';

/** Campus Life: clubs and events. The map, learning resources and lost & found have their own pages in the menu. */
export function CampusHub() {
  const { t, l, locale } = useI18n();
  const nav = useNavigate();
  const events = useQuery(() => api<EventItem[]>('/campus/events', { query: { from: '2026-09-27' } }), [], { refreshOn: ['calendar', 'campus'] });
  const clubs = useQuery(() => api<Club[]>('/campus/clubs'), [], { refreshOn: ['campus'] });
  const upcoming = (events.data ?? []).filter((e) => !e.is_past && e.kind !== 'personal');
  const going = upcoming.filter((e) => e.my_rsvp?.status === 'going');
  const myClubs = (clubs.data ?? []).filter((c) => c.my_membership && c.my_membership.status !== 'left');
  const suggestions = (clubs.data ?? []).filter((c) => c.for_you).sort((a, b) => b.for_you!.score - a.for_you!.score || b.member_count - a.member_count).slice(0, 3);
  const ready = !!events.data && !!clubs.data;

  return (
    <div>
      <PageHeader title={t('campus.hub.title')} subtitle={t('campus.hub.subtitle')} actions={<Button variant="gold" icon={<IdCard className="h-4 w-4" />} onClick={openStudentCard}>{t('campus.hub.card')}</Button>} />

      {ready ? (
        <p className="-mt-2 mb-6 text-sm">{[t('campus.hub.inClubs', { n: myClubs.length }), t('campus.hub.goingTo', { n: going.length }), t('campus.hub.upcomingN', { n: upcoming.length })].join(' · ')}</p>
      ) : <Skeleton className="-mt-2 mb-6 h-5 w-72" />}

      <CommunityEntry />

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1fr)_360px]">
        <section className="min-w-0" aria-labelledby="hub-events">
          <SectionTitle id="hub-events" action={<SectionLink to="/campus/events">{t('campus.hub.allEvents')}</SectionLink>}>{t('campus.hub.upcoming')}</SectionTitle>
          {events.loading && !events.data && <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">{[1, 2, 3, 4].map((i) => <Skeleton key={i} className="h-32" />)}</div>}
          {events.error ? <ErrorState error={events.error} onRetry={() => void events.refetch()} /> : null}
          {events.data && upcoming.length === 0 && <EmptyState icon={<CalendarDays className="h-6 w-6" />} title={t('common.empty')} />}
          {upcoming.length > 0 && <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">{upcoming.slice(0, 4).map((e) => <EventCard key={e.id} e={e} />)}</div>}
        </section>
        <div className="min-w-0 space-y-6">
          <section aria-labelledby="hub-clubs">
            <SectionTitle id="hub-clubs" action={<SectionLink to="/campus/clubs">{t('campus.hub.browseClubs')}</SectionLink>}>{t('campus.hub.myClubs')}</SectionTitle>
            {clubs.loading && !clubs.data && <Skeleton className="h-40" />}
            {clubs.data && myClubs.length === 0 && <EmptyState title={t('campus.hub.noClubs')} action={<Button size="sm" onClick={() => nav('/campus/clubs')}>{t('campus.hub.browseClubs')}</Button>} />}
            <ul className="space-y-2">
              {myClubs.map((c) => (
                <li key={c.id}>
                  <Link to={`/campus/clubs/${c.id}`} className="card flex items-center gap-3 p-3 transition hover:border-brand-400">
                    <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl" style={{ background: c.color, color: readableOn(c.color) }}><Users className="h-5 w-5" aria-hidden /></span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-semibold">{l(c.name_en, c.name_ar)}</span>
                      <span className="block text-xs text-muted">{t('campus.clubs.memberCount', { n: c.member_count })} · {t('campus.clubs.upcomingCount', { n: c.upcoming_events })}</span>
                    </span>
                    <StatusPill status={c.my_membership!.status} />
                    {c.my_membership!.role === 'lead' && <Badge tone="gold">{t('campus.clubs.lead')}</Badge>}
                  </Link>
                </li>
              ))}
            </ul>
          </section>
          {suggestions.length > 0 && (
            <section aria-labelledby="hub-discover">
              <SectionTitle id="hub-discover">{t('campus.hub.discover')}</SectionTitle>
              <ul className="space-y-2">
                {suggestions.map((c) => (
                  <li key={c.id}>
                    <Link to={`/campus/clubs/${c.id}`} className="flex min-h-11 items-center gap-3 rounded-2xl border border-line p-3 transition hover:border-brand-400">
                      <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl" style={{ background: c.color, color: readableOn(c.color) }}><Users className="h-4 w-4" aria-hidden /></span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-semibold">{l(c.name_en, c.name_ar)}</span>
                        <span className="block truncate text-xs text-muted">{c.for_you?.reasons[0] ? t(c.for_you.reasons[0].key, { ...c.for_you.reasons[0].params, list: String(locale === 'ar' ? c.for_you.reasons[0].params.list_ar ?? '' : c.for_you.reasons[0].params.list_en ?? '') }) : `${t(`campus.clubs.categories.${c.category}`)} · ${t('campus.clubs.upcomingCount', { n: c.upcoming_events })}`}</span>
                      </span>
                      <ArrowRight className="h-4 w-4 shrink-0 text-muted rtl:rotate-180" aria-hidden />
                    </Link>
                  </li>
                ))}
              </ul>
            </section>
          )}
        </div>
      </div>
    </div>
  );
}
