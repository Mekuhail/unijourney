import { useEffect, useRef, useState, type FormEvent, type ReactNode } from 'react';
import { Link, NavLink, useNavigate } from 'react-router';
import clsx from 'clsx';
import { Newspaper, CalendarDays, Users, MessageCircle, UserRound, Search, MapPin, Check, Clock3 } from 'lucide-react';
import { useI18n } from '@/i18n';
import { api } from '@/lib/api';
import { useQuery } from '@/lib/useQuery';
import { fmtTime } from '@/lib/format';
import { useSession } from '@/lib/session';
import { useEdgeFade } from '@/components/ui/useEdgeFade';
import { PageHeader } from '@/components/ui/PageHeader';
import { Avatar, Badge, Input } from '@/components/ui';
import type { EventItem, PersonBrief } from '../types';

const TZ = 'Asia/Riyadh';

/** Polls `fn` every `ms` while the tab is visible; the server stays the source of truth. */
export function usePoll(fn: () => void, ms: number) {
  const ref = useRef(fn);
  ref.current = fn;
  useEffect(() => {
    const id = window.setInterval(() => { if (document.visibilityState === 'visible') ref.current(); }, ms);
    const onVis = () => { if (document.visibilityState === 'visible') ref.current(); };
    document.addEventListener('visibilitychange', onVis);
    return () => { window.clearInterval(id); document.removeEventListener('visibilitychange', onVis); };
  }, [ms]);
}

export function useUnreadMessages() {
  const { user } = useSession();
  const q = useQuery(() => api<{ conversations: number }>('/campus/community/messages/unread'), [user?.id], { refreshOn: ['messages'] });
  usePoll(() => void q.refetch(), 20000);
  return q.data?.conversations ?? 0;
}

function SearchBox() {
  const { t } = useI18n();
  const nav = useNavigate();
  const [q, setQ] = useState('');
  const submit = (e: FormEvent) => { e.preventDefault(); if (q.trim().length >= 2) nav(`/campus/community/search?q=${encodeURIComponent(q.trim())}`); };
  return (
    <form role="search" onSubmit={submit} className="relative w-full sm:w-80">
      <Search className="pointer-events-none absolute start-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" aria-hidden />
      <label htmlFor="community-search" className="sr-only">{t('social.search')}</label>
      <Input id="community-search" type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder={t('social.searchPlaceholder')} className="ps-9" />
    </form>
  );
}

/**
 * Frame for every community page: the single h1 (Kufic display voice), the way back to Campus Life, search, and the
 * section navigation. Pages pass their own document title.
 */
export function CommunityShell({ doc, children }: { doc: string; children: ReactNode }) {
  const { t } = useI18n();
  const unread = useUnreadMessages();
  const row = useEdgeFade<HTMLDivElement>(doc);
  const items = [
    { to: '/campus/community', end: true, label: t('social.nav.feed'), icon: Newspaper },
    { to: '/campus/community/events', label: t('social.nav.events'), icon: CalendarDays },
    { to: '/campus/community/people', label: t('social.nav.people'), icon: Users },
    { to: '/campus/community/messages', label: t('social.nav.messages'), icon: MessageCircle, count: unread },
    { to: '/campus/community/me', label: t('social.nav.me'), icon: UserRound }
  ];
  return (
    <div>
      <PageHeader crumbs={[{ to: '/campus', label: t('nav.campus') }]} title={t('social.title')} documentTitle={doc} subtitle={t('social.subtitle')} actions={<SearchBox />} className="[&_h1]:font-display [&_h1]:tracking-normal" />
      <nav aria-label={t('social.nav.label')} className="-mt-2 mb-6 min-w-0 max-w-full rounded-2xl bg-surface-2 p-1">
        <div ref={row} className="scroll-row flex gap-1 overflow-x-auto">
          {items.map((it) => (
            <NavLink key={it.to} to={it.to} end={it.end} className={({ isActive }) => clsx('flex shrink-0 items-center gap-2 rounded-xl px-3.5 py-2 text-sm font-medium transition-colors touch:min-h-11', isActive ? 'bg-surface text-fg shadow-sm' : 'text-muted hover:text-fg')}>
              <it.icon className="h-4 w-4" aria-hidden />
              <span className="whitespace-nowrap">{it.label}</span>
              {!!it.count && <span className="num rounded-full bg-brand-500 px-1.5 text-xs font-semibold text-ink-950" aria-label={t('social.msg.unread', { n: it.count })}>{it.count}</span>}
            </NavLink>
          ))}
        </div>
      </nav>
      {children}
    </div>
  );
}

// ------------------------------------------------------------------ workshop ticket (the community's signature)
function dateParts(iso: string, locale: 'en' | 'ar') {
  const loc = locale === 'ar' ? 'ar-SA-u-ca-gregory-nu-latn' : 'en-GB';
  const f = (o: Intl.DateTimeFormatOptions) => new Intl.DateTimeFormat(loc, { timeZone: TZ, ...o }).format(new Date(iso));
  return { weekday: f({ weekday: 'short' }), day: f({ day: 'numeric' }), month: f({ month: 'short' }) };
}

const WORKSHOP_TAGS = ['workshop', 'lab', 'crit', 'drop-in', 'contest', 'beginner', 'moot'];
export function isWorkshop(e: { tags?: string[]; title_en: string }) {
  return (e.tags ?? []).some((tg) => WORKSHOP_TAGS.includes(tg) || tg.startsWith('track:')) || /workshop|lab|crit|jam/i.test(e.title_en);
}

export interface TicketData { id: string; title_en: string; title_ar: string; start_at: string; end_at: string; club?: { id: string; name_en: string; name_ar: string; color: string } | null; location_name_en?: string | null; location_name_ar?: string | null; my_rsvp?: string | null; going_count: number; organizer?: string; is_past?: boolean }

export function ticketFromEvent(e: EventItem): TicketData {
  return {
    id: e.id, title_en: e.title_en, title_ar: e.title_ar, start_at: e.start_at, end_at: e.end_at, club: e.club ? { id: e.club.id, name_en: e.club.name_en, name_ar: e.club.name_ar, color: e.club.color } : null,
    location_name_en: e.location ? e.location.name_en : e.venue_text, location_name_ar: e.location ? e.location.name_ar : e.venue_text,
    my_rsvp: e.my_rsvp?.status ?? null, going_count: e.going_count, organizer: e.organizer, is_past: e.is_past
  };
}

/**
 * A workshop as a ticket: a gold date stub, a perforation, then the details. The RSVP state printed on it is the
 * real one from the events system; the ticket opens the event page, where RSVP happens.
 */
export function Ticket({ e, compact, action }: { e: TicketData; compact?: boolean; action?: ReactNode }) {
  const { t, l, locale } = useI18n();
  const d = dateParts(e.start_at, locale);
  const status = e.is_past ? 'past' : e.my_rsvp === 'going' ? 'going' : e.my_rsvp === 'waitlisted' ? 'waitlisted' : 'open';
  return (
    <article className="relative flex min-w-0 overflow-hidden rounded-2xl border border-line bg-surface transition hover:border-brand-400 focus-within:border-brand-400">
      <div className="flex w-[4.5rem] shrink-0 flex-col items-center justify-center border-e-2 border-dashed border-gold-500/50 bg-gold-100 px-2 py-3 text-gold-700 dark:bg-gold-700/25 dark:text-gold-300" aria-hidden>
        <span className="text-xs font-semibold">{d.weekday}</span>
        <span className="num font-display text-3xl leading-none">{d.day}</span>
        <span className="text-xs">{d.month}</span>
      </div>
      <div className="min-w-0 flex-1 p-3">
        {e.club && <div className="mb-1 flex items-center gap-1.5 text-xs text-muted"><span aria-hidden className="h-2 w-2 shrink-0 rounded-full" style={{ background: e.club.color }} /><span className="truncate">{l(e.club.name_en, e.club.name_ar)}</span></div>}
        <h3 className={clsx('font-semibold leading-snug', compact ? 'line-clamp-2 text-sm' : 'line-clamp-2')}>
          <Link to={`/campus/events/${e.id}`} className="rounded-sm after:absolute after:inset-0 after:rounded-2xl hover:underline">{l(e.title_en, e.title_ar || e.title_en)}</Link>
        </h3>
        <p className="sr-only">{`${d.weekday} ${d.day} ${d.month}`}</p>
        <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-muted">
          <span className="num inline-flex items-center gap-1"><Clock3 className="h-3.5 w-3.5" aria-hidden />{fmtTime(e.start_at, locale)} – {fmtTime(e.end_at, locale)}</span>
          <span>{t('social.ticket.tz')}</span>
          {!compact && e.location_name_en && <span className="inline-flex min-w-0 items-center gap-1"><MapPin className="h-3.5 w-3.5 shrink-0" aria-hidden /><span className="truncate">{l(e.location_name_en, e.location_name_ar || e.location_name_en)}</span></span>}
        </div>
        {!compact && e.organizer && <div className="mt-0.5 truncate text-xs text-muted">{t('social.ticket.by', { name: e.organizer })}</div>}
        <div className="mt-2 flex flex-wrap items-center gap-2">
          {status === 'going' ? <Badge tone="gold"><Check className="h-3 w-3" aria-hidden />{t('social.ticket.going')}</Badge>
            : status === 'waitlisted' ? <Badge tone="warn">{t('social.ticket.waitlisted')}</Badge>
            : status === 'past' ? <Badge tone="neutral">{t('social.ticket.past')}</Badge>
            : <Badge tone="brand">{t('social.ticket.open')}</Badge>}
          <span className="text-xs text-muted">{t('social.ticket.goingCount', { n: e.going_count })}</span>
          {action && <span className="relative z-10 ms-auto">{action}</span>}
        </div>
      </div>
    </article>
  );
}

// ------------------------------------------------------------------ people
export function PersonLink({ p, size = 40, meta, children }: { p: PersonBrief; size?: number; meta?: ReactNode; children?: ReactNode }) {
  const { t, l } = useI18n();
  return (
    <Link to={`/campus/community/people/${p.id}`} className="flex min-h-11 min-w-0 items-center gap-3 rounded-xl py-1.5 hover:text-brand-600">
      <Avatar name={p.name_en} color={p.avatar_color} size={size} />
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm font-semibold">{l(p.name_en, p.name_ar)}</span>
        <span className="block truncate text-xs text-muted">{meta ?? [p.program_id?.toUpperCase(), p.campus_id ? t(`shell.${p.campus_id}`) : null].filter(Boolean).join(' · ')}</span>
      </span>
      {children}
    </Link>
  );
}
