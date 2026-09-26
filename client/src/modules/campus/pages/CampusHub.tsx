import { Link, useNavigate } from 'react-router';
import { Users, BookOpen, Map, Search, IdCard, ArrowRight, CalendarDays } from 'lucide-react';
import { useI18n } from '@/i18n';
import { useQuery } from '@/lib/useQuery';
import { api } from '@/lib/api';
import { PageHeader } from '@/components/ui/PageHeader';
import { Badge, Button, Card, EmptyState, ErrorState, SectionTitle, Skeleton, StatusPill, SectionLink } from '@/components/ui';
import SpotlightCard from '@/components/reactbits/SpotlightCard';
import type { Club, EventItem } from '../types';
import { EventCard } from '../lib';

const TILES = [
  { to: '/campus/clubs', key: 'clubs', icon: Users, color: 'rgba(240, 118, 43, 0.28)' as const },
  { to: '/campus/resources', key: 'resources', icon: BookOpen, color: 'rgba(47, 111, 219, 0.28)' as const },
  { to: '/campus/map', key: 'map', icon: Map, color: 'rgba(46, 158, 107, 0.28)' as const },
  { to: '/campus/lost-found', key: 'lostFound', icon: Search, color: 'rgba(200, 151, 91, 0.35)' as const }
];

export function CampusHub() {
  const { t, l } = useI18n();
  const nav = useNavigate();
  const events = useQuery(() => api<EventItem[]>('/campus/events', { query: { from: '2026-09-27' } }), [], { refreshOn: ['calendar', 'campus'] });
  const clubs = useQuery(() => api<Club[]>('/campus/clubs'), [], { refreshOn: ['campus'] });
  const upcoming = (events.data ?? []).filter((e) => !e.is_past).slice(0, 4);
  const myClubs = (clubs.data ?? []).filter((c) => c.my_membership && c.my_membership.status !== 'left');
  const stats = { clubs: clubs.data?.length ?? 0, events: (events.data ?? []).filter((e) => !e.is_past && e.kind !== 'personal').length, going: (events.data ?? []).filter((e) => e.my_rsvp?.status === 'going').length };

  return (
    <div>
      <PageHeader eyebrow={t('campus.hub.eyebrow')} title={t('campus.hub.title')} subtitle={t('campus.hub.subtitle')} actions={<Button variant="gold" icon={<IdCard className="h-4 w-4" />} onClick={() => nav('/campus/card')}>{t('campus.hub.card')}</Button>} />

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {TILES.map((tile) => (
          <Link key={tile.to} to={tile.to} className="block focus-visible:outline-none">
            <SpotlightCard className="!border-line !bg-surface !p-5 h-full transition hover:!border-brand-400" spotlightColor={tile.color}>
              <tile.icon className="h-6 w-6 text-brand-500" />
              <div className="mt-3 font-semibold">{t(`campus.hub.${tile.key}`)}</div>
              <div className="mt-1 text-sm text-muted">{t(`campus.hub.${tile.key}Body`)}</div>
              <div className="mt-3 inline-flex items-center gap-1 text-xs font-semibold text-brand-600">{t('common.open')} <ArrowRight className="h-3.5 w-3.5 rtl:rotate-180" /></div>
            </SpotlightCard>
          </Link>
        ))}
      </div>

      <div className="mt-6 grid gap-3 sm:grid-cols-3">
        {[{ k: 'clubs', v: stats.clubs, label: t('campus.clubs.title') }, { k: 'events', v: stats.events, label: t('campus.hub.upcoming') }, { k: 'going', v: stats.going, label: t('status.going') }].map((s) => (
          <Card key={s.k} className="flex items-center justify-between">
            <span className="text-sm text-muted">{s.label}</span>
            <span className="num text-2xl font-bold text-brand-600">{s.v}</span>
          </Card>
        ))}
      </div>

      <div className="mt-8 grid gap-6 lg:grid-cols-[1fr_360px]">
        <section>
          <SectionTitle action={<SectionLink to="/campus/events">{t('campus.hub.allEvents')}</SectionLink>}>{t('campus.hub.upcoming')}</SectionTitle>
          {events.loading && <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">{[1, 2, 3, 4].map((i) => <Skeleton key={i} className="h-32" />)}</div>}
          {events.error ? <ErrorState error={events.error} onRetry={() => void events.refetch()} /> : null}
          {events.data && upcoming.length === 0 && <EmptyState icon={<CalendarDays className="h-6 w-6" />} title={t('common.empty')} />}
          {upcoming.length > 0 && <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">{upcoming.map((e) => <EventCard key={e.id} e={e} />)}</div>}
        </section>
        <section>
          <SectionTitle action={<SectionLink to="/campus/clubs">{t('campus.hub.browseClubs')}</SectionLink>}>{t('campus.hub.myClubs')}</SectionTitle>
          {clubs.loading && <Skeleton className="h-40" />}
          {clubs.data && myClubs.length === 0 && <EmptyState title={t('campus.hub.noClubs')} action={<Button size="sm" onClick={() => nav('/campus/clubs')}>{t('campus.hub.browseClubs')}</Button>} />}
          <ul className="space-y-2">
            {myClubs.map((c) => (
              <li key={c.id}>
                <Link to={`/campus/clubs/${c.id}`} className="card flex items-center gap-3 p-3 transition hover:border-brand-400">
                  <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl text-white" style={{ background: c.color }}><Users className="h-5 w-5" /></span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-semibold">{l(c.name_en, c.name_ar)}</span>
                    <span className="block text-xs text-muted">{c.member_count} {t('campus.clubs.members')} · {c.upcoming_events} {t('campus.clubs.upcoming')}</span>
                  </span>
                  <StatusPill status={c.my_membership!.status} />
                  {c.my_membership!.role === 'lead' && <Badge tone="gold">{t('campus.clubs.lead')}</Badge>}
                </Link>
              </li>
            ))}
          </ul>
          <Card className="mt-4 text-sm">
            <div className="mb-2 font-semibold">{t('campus.hub.map')}</div>
            <div className="flex flex-wrap gap-2">
              <Button size="sm" variant="outline" onClick={() => nav('/campus/map')}>{t('campus.hub.openMap')}</Button>
              <Button size="sm" variant="secondary" onClick={() => nav('/campus/map?nextClass=1')}>{t('campus.hub.nextClassRoute')}</Button>
            </div>
          </Card>
        </section>
      </div>
    </div>
  );
}
