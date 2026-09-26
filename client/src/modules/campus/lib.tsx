import { Link } from 'react-router';
import { CalendarDays, MapPin, Users, ExternalLink, AlertTriangle } from 'lucide-react';
import clsx from 'clsx';
import { useI18n } from '@/i18n';
import { Badge, StatusPill } from '@/components/ui';
import { fmtDate, fmtTime } from '@/lib/format';
import type { ConflictItem, EventItem } from './types';

export function fmtRange(start: string, end: string, locale: 'en' | 'ar') {
  const sameDay = start.slice(0, 10) === end.slice(0, 10);
  return sameDay ? `${fmtDate(start, locale, { weekday: 'short' })} · ${fmtTime(start, locale)} – ${fmtTime(end, locale)}` : `${fmtDate(start, locale, { weekday: 'short' })} ${fmtTime(start, locale)} → ${fmtDate(end, locale, { weekday: 'short' })} ${fmtTime(end, locale)}`;
}

export const kindTone: Record<string, 'brand' | 'gold' | 'info' | 'neutral' | 'success'> = { club: 'brand', external: 'gold', university: 'info', personal: 'neutral' };

export function KindBadge({ kind }: { kind: string }) {
  const { t } = useI18n();
  return <Badge tone={kindTone[kind] ?? 'neutral'}>{t(`campus.events.${kind}`)}</Badge>;
}

export function EventCard({ e, compact }: { e: EventItem; compact?: boolean }) {
  const { t, l, locale } = useI18n();
  const hasClassConflict = e.conflicts.some((c) => c.isClass);
  return (
    <Link to={`/campus/events/${e.id}`} className={clsx('card block p-4 transition hover:border-brand-400', e.is_past && 'bg-surface-2')}>
      <div className="flex flex-wrap items-center gap-1.5">
        <KindBadge kind={e.kind} />
        {e.club && <Badge tone="neutral"><span className="h-2 w-2 rounded-full" style={{ background: e.club.color }} />{l(e.club.name_en, e.club.name_ar)}</Badge>}
        {e.my_rsvp && (e.my_rsvp.status === 'going' || e.my_rsvp.status === 'waitlisted') && <StatusPill status={e.my_rsvp.status} />}
        {hasClassConflict && <Badge tone="warn"><AlertTriangle className="h-3 w-3" />{t('common.conflict')}</Badge>}
      </div>
      <div className="mt-2 font-semibold leading-snug">{l(e.title_en, e.title_ar)}</div>
      <div className="mt-1.5 space-y-1 text-xs text-muted">
        <div className="flex items-center gap-1.5"><CalendarDays className="h-3.5 w-3.5 shrink-0" /><span className="num">{fmtRange(e.start_at, e.end_at, locale)}</span></div>
        {(e.location || e.venue_text) && <div className="flex items-center gap-1.5"><MapPin className="h-3.5 w-3.5 shrink-0" /><span className="truncate">{e.location ? l(e.location.name_en, e.location.name_ar) : e.venue_text}</span></div>}
        {!compact && e.kind !== 'personal' && <div className="flex items-center gap-1.5"><Users className="h-3.5 w-3.5 shrink-0" /><span>{e.going_count} {t('campus.events.going')}{e.capacity !== null && (e.full ? ` · ${t('campus.events.full')}` : ` · ${t('campus.events.seatsLeft', { n: e.remaining ?? 0 })}`)}</span></div>}
        {!compact && e.source_url && <div className="flex items-center gap-1.5"><ExternalLink className="h-3.5 w-3.5 shrink-0" /><span className="truncate">{e.organizer}</span></div>}
      </div>
    </Link>
  );
}

export function ConflictList({ conflicts }: { conflicts: ConflictItem[] }) {
  const { locale, t } = useI18n();
  if (!conflicts.length) return <div className="text-sm text-success">{t('campus.events.noConflict')}</div>;
  return (
    <ul className="space-y-1.5">
      {conflicts.map((c) => (
        <li key={c.entry.id} className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-warn/30 bg-warn/10 px-3 py-2 text-sm">
          <span className="flex items-center gap-2"><StatusPill status={c.entry.kind === 'class' ? 'enrolled' : c.entry.kind} /><span className="font-medium">{c.entry.title}</span></span>
          <span className="num text-xs text-muted">{fmtTime(c.entry.start_at, locale)} – {fmtTime(c.entry.end_at, locale)} · {c.overlapMinutes} {t('common.minutes')}</span>
        </li>
      ))}
    </ul>
  );
}

export function GeometryBadge({ status }: { status: string }) {
  const { t } = useI18n();
  const key = status === 'osm' ? 'osm' : status === 'approx' ? 'approx' : 'synthetic';
  return <Badge tone={key === 'osm' ? 'success' : key === 'approx' ? 'warn' : 'neutral'}>{t(`campus.map.geometry.${key}`)}</Badge>;
}

export function AccessBadge({ value }: { value: 'yes' | 'no' | 'unknown' }) {
  const { t } = useI18n();
  return <Badge tone={value === 'yes' ? 'success' : value === 'no' ? 'danger' : 'warn'}>{t('campus.map.accessibleLabel')}: {t(`common.${value === 'unknown' ? 'unknown' : value}`)}</Badge>;
}
