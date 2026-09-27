import { useMemo, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router';
import clsx from 'clsx';
import { ImagePlus, X, PenLine, ArrowRight } from 'lucide-react';
import { useI18n } from '@/i18n';
import { api, apiUpload, errorMessage } from '@/lib/api';
import { refreshAll } from '@/lib/bus';
import { useQuery } from '@/lib/useQuery';
import { useSession } from '@/lib/session';
import { useToast } from '@/components/ui/toast';
import { Avatar, Button, EmptyState, ErrorState, Field, Input, Select, Skeleton, Textarea } from '@/components/ui';
import type { DocumentMeta } from '@shared/types';
import type { Club, EventItem, FeedPost, HomeFeed, PersonListItem } from '../types';
import { PostCard } from '../community';
import { CommunityShell, PersonLink, Ticket, isWorkshop, ticketFromEvent, usePoll } from './shared';

/** All campus events; `is_past` comes from the server's (demo) clock, so the client never guesses today's date. */
export function useUpcomingEvents() {
  return useQuery(() => api<EventItem[]>('/campus/events'), [], { refreshOn: ['calendar', 'campus'] });
}

/** Composer for a university-wide student post: text, optional image with alt text, linked event, club tag, audience. */
function SocialComposer({ onPosted }: { onPosted: (p: FeedPost) => void }) {
  const { t, l } = useI18n();
  const toast = useToast();
  const { user } = useSession();
  const [open, setOpen] = useState(false);
  const [body, setBody] = useState('');
  const [media, setMedia] = useState<{ id: string; preview: string } | null>(null);
  const [alt, setAlt] = useState('');
  const [eventId, setEventId] = useState('');
  const [clubId, setClubId] = useState('');
  const [audience, setAudience] = useState<'all' | 'campus'>('all');
  const [busy, setBusy] = useState(false);
  const [uploading, setUploading] = useState(false);
  const file = useRef<HTMLInputElement>(null);
  const events = useUpcomingEvents();
  const clubs = useQuery(() => api<Club[]>('/campus/clubs'), [], { refreshOn: ['campus'] });
  const myClubs = (clubs.data ?? []).filter((c) => c.my_membership?.status === 'active');
  const shareable = (events.data ?? []).filter((e) => !e.is_past && e.kind !== 'personal');

  const pick = async (f: File | undefined) => {
    if (!f) return;
    setUploading(true);
    try {
      const doc = await apiUpload<DocumentMeta>('/documents', f, { kind: 'post_media', label: 'Community post image' });
      setMedia({ id: doc.id, preview: URL.createObjectURL(f) });
    } catch (e) { toast.error(errorMessage(e)); } finally { setUploading(false); if (file.current) file.current.value = ''; }
  };
  const submit = async () => {
    setBusy(true);
    try {
      const p = await api<FeedPost>('/campus/community/posts', { method: 'POST', body: { body: body.trim(), media_document_id: media?.id ?? null, media_alt: media ? alt.trim() : undefined, event_id: eventId || null, club_id: clubId || null, audience } });
      setBody(''); setMedia(null); setAlt(''); setEventId(''); setClubId(''); setAudience('all'); setOpen(false);
      toast.success(t('social.compose.posted'));
      onPosted(p);
      refreshAll('community');
    } catch (e) { toast.error(errorMessage(e)); } finally { setBusy(false); }
  };

  if (!open) {
    return (
      <button type="button" onClick={() => setOpen(true)} className="card flex min-h-16 w-full items-center gap-3 px-4 text-start transition hover:border-brand-400">
        {user && <Avatar name={user.name_en} color={user.avatar_color} size={36} />}
        <span className="flex-1 text-sm text-muted">{t('social.compose.placeholder')}</span>
        <PenLine className="h-5 w-5 text-brand-600" aria-hidden />
      </button>
    );
  }
  return (
    <section aria-labelledby="compose-social" className="card p-4">
      <h2 id="compose-social" className="sr-only">{t('social.compose.label')}</h2>
      <label htmlFor="social-body" className="sr-only">{t('social.compose.placeholder')}</label>
      <Textarea id="social-body" autoFocus rows={3} maxLength={1500} value={body} onChange={(e) => setBody(e.target.value)} placeholder={t('social.compose.placeholder')} />
      {media && (
        <div className="mt-3 flex flex-wrap items-start gap-3">
          <img src={media.preview} alt="" className="h-24 w-32 rounded-xl object-cover" />
          <Field label={t('social.compose.alt')} className="min-w-0 flex-1"><Input value={alt} maxLength={200} onChange={(e) => setAlt(e.target.value)} /></Field>
          <button type="button" onClick={() => { setMedia(null); setAlt(''); }} aria-label={t('social.compose.removeImage')} className="grid h-11 w-11 place-items-center rounded-xl text-muted hover:bg-line/60"><X className="h-4 w-4" aria-hidden /></button>
        </div>
      )}
      <div className="mt-3 grid gap-3 sm:grid-cols-3">
        <Field label={t('social.compose.event')}>
          <Select value={eventId} onChange={(e) => setEventId(e.target.value)}>
            <option value="">{t('social.compose.noEvent')}</option>
            {shareable.map((e) => <option key={e.id} value={e.id}>{l(e.title_en, e.title_ar || e.title_en)}</option>)}
          </Select>
        </Field>
        <Field label={t('social.compose.club')}>
          <Select value={clubId} onChange={(e) => setClubId(e.target.value)} disabled={!myClubs.length}>
            <option value="">{t('social.compose.noClub')}</option>
            {myClubs.map((c) => <option key={c.id} value={c.id}>{l(c.name_en, c.name_ar)}</option>)}
          </Select>
        </Field>
        <Field label={t('social.compose.audience')}>
          <Select value={audience} onChange={(e) => setAudience(e.target.value as 'all' | 'campus')}>
            <option value="all">{t('social.audience.all')}</option>
            <option value="campus">{t('social.audience.campus')}</option>
          </Select>
        </Field>
      </div>
      <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <input ref={file} type="file" accept="image/png,image/jpeg" className="sr-only" id="social-image" onChange={(e) => void pick(e.target.files?.[0])} />
          <Button variant="outline" size="sm" loading={uploading} icon={<ImagePlus className="h-4 w-4" aria-hidden />} onClick={() => file.current?.click()} disabled={!!media}>{uploading ? t('social.compose.uploading') : t('social.compose.addImage')}</Button>
          <span className="hidden text-xs text-muted sm:inline">{t('social.compose.imageHint')}</span>
        </div>
        <div className="flex gap-2">
          <Button variant="ghost" onClick={() => setOpen(false)}>{t('common.cancel')}</Button>
          <Button loading={busy} disabled={body.trim().length < 2 || uploading} onClick={() => void submit()}>{t('social.compose.post')}</Button>
        </div>
      </div>
      <p className="mt-2 text-xs text-muted">{t('community.guidelines')}</p>
    </section>
  );
}

type Scope = 'all' | 'students' | 'clubs';

export function CommunityHome() {
  const { t, l } = useI18n();
  const { user } = useSession();
  const [params, setParams] = useSearchParams();
  const scope = (params.get('scope') as Scope | null) ?? 'all';
  const campus = (params.get('campus') as 'all' | 'mine' | null) ?? 'all';
  const setParam = (k: string, v: string, dflt: string) => setParams((p) => { if (v === dflt) p.delete(k); else p.set(k, v); return p; }, { replace: true });
  const feed = useQuery(() => api<HomeFeed>('/campus/community/home', { query: { scope, campus } }), [scope, campus, user?.id], { refreshOn: ['community'] });
  usePoll(() => void feed.refetch(), 45000);
  const events = useUpcomingEvents();
  const people = useQuery(() => api<{ items: PersonListItem[] }>('/campus/community/people'), [user?.id], { refreshOn: ['community'] });
  const clubs = useQuery(() => api<Club[]>('/campus/clubs'), [], { refreshOn: ['campus'] });
  const upcoming = useMemo(() => (events.data ?? []).filter((e) => !e.is_past && (e.kind === 'club' || e.kind === 'university')).sort((a, b) => Number(isWorkshop(b)) - Number(isWorkshop(a)) || a.start_at.localeCompare(b.start_at)).slice(0, 3).sort((a, b) => a.start_at.localeCompare(b.start_at)), [events.data]);
  const toKnow = (people.data?.items ?? []).filter((p) => !p.is_me).slice(0, 4);
  const myClubs = (clubs.data ?? []).filter((c) => c.my_membership?.status === 'active');

  // Phones get the tickets as a swipeable row so the feed starts within the first screen; the desktop rail stacks them.
  const workshops = (row: boolean) => (
    <section aria-labelledby={row ? 'rail-workshops-row' : 'rail-workshops'}>
      <div className="mb-3 flex items-center justify-between gap-2"><h2 id={row ? 'rail-workshops-row' : 'rail-workshops'} className="font-display text-lg">{t('social.rail.workshops')}</h2><Link to="/campus/community/events" className="inline-flex min-h-11 items-center gap-1 text-sm font-medium text-brand-600 hover:underline sm:min-h-8">{t('social.rail.allEvents')}<ArrowRight className="h-4 w-4 rtl:rotate-180" aria-hidden /></Link></div>
      {events.loading && !events.data && <Skeleton className="h-28" />}
      <div className={row ? 'scroll-row -mx-4 flex snap-x gap-3 overflow-x-auto px-4 pb-1' : 'space-y-3'}>{upcoming.map((e) => <div key={e.id} className={row ? 'w-[82%] max-w-sm shrink-0 snap-start' : ''}><Ticket e={ticketFromEvent(e)} compact /></div>)}</div>
    </section>
  );

  return (
    <CommunityShell doc={t('social.title')}>
      <div className="grid grid-cols-1 gap-8 lg:grid-cols-[minmax(0,1fr)_340px]">
        <div className="min-w-0 space-y-4">
          <div className="lg:hidden">{workshops(true)}</div>
          {feed.data?.can_post ? <SocialComposer onPosted={() => void feed.refetch()} /> : feed.data && <p className="text-sm text-muted">{t('social.feed.readOnly')}</p>}
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div role="group" aria-label={t('social.filter.label')} className="scroll-row -mx-1 flex min-w-0 max-w-full gap-2 overflow-x-auto px-1 py-0.5">
              {(['all', 'students', 'clubs'] as Scope[]).map((s) => (
                <button key={s} type="button" aria-pressed={scope === s} onClick={() => setParam('scope', s, 'all')} className={clsx('inline-flex min-h-11 shrink-0 items-center rounded-full border px-4 text-sm font-medium transition sm:min-h-9', scope === s ? 'border-brand-500 bg-brand-500 text-ink-950' : 'border-line bg-surface hover:border-brand-400')}>{t(`social.filter.${s}`)}</button>
              ))}
            </div>
            <label className="flex items-center gap-2 text-sm"><span className="text-muted">{t('social.filter.campus')}</span>
              <Select value={campus} onChange={(e) => setParam('campus', e.target.value, 'all')} className="w-auto"><option value="all">{t('social.campus.all')}</option><option value="mine">{t('social.campus.mine')}</option></Select>
            </label>
          </div>
          {feed.loading && !feed.data && <div className="space-y-3">{[1, 2, 3].map((i) => <Skeleton key={i} className="h-40" />)}</div>}
          {feed.error ? <ErrorState error={feed.error} onRetry={() => void feed.refetch()} /> : null}
          {feed.data && feed.data.items.length === 0 && <EmptyState title={t('social.feed.empty')} body={t('social.feed.emptyBody')} />}
          <h2 className="sr-only">{t('social.nav.feed')}</h2>
          <div className="space-y-4">{feed.data?.items.map((p) => <PostCard key={`${p.type}-${p.id}`} post={p} showClub onRemoved={() => void feed.refetch()} />)}</div>
        </div>
        <aside className="hidden min-w-0 space-y-8 lg:block">
          {workshops(false)}
          <section aria-labelledby="rail-people">
            <div className="mb-2 flex items-center justify-between gap-2"><h2 id="rail-people" className="font-display text-lg">{t('social.rail.people')}</h2><Link to="/campus/community/people" className="text-sm font-medium text-brand-600 hover:underline">{t('social.rail.allPeople')}</Link></div>
            <ul className="divide-y divide-line">{toKnow.map((p) => <li key={p.id}><PersonLink p={p} size={36} meta={p.shared_clubs ? t('social.people.sharedClub') : p.bio || undefined} /></li>)}</ul>
          </section>
          {myClubs.length > 0 && (
            <section aria-labelledby="rail-clubs">
              <div className="mb-2 flex items-center justify-between gap-2"><h2 id="rail-clubs" className="font-display text-lg">{t('social.rail.clubs')}</h2><Link to="/campus/clubs" className="text-sm font-medium text-brand-600 hover:underline">{t('social.rail.allClubs')}</Link></div>
              <ul className="space-y-1">{myClubs.map((c) => <li key={c.id}><Link to={`/campus/clubs/${c.id}`} className="flex min-h-11 items-center gap-2.5 rounded-xl px-2 text-sm hover:bg-line/40"><span aria-hidden className="h-2.5 w-2.5 rounded-full" style={{ background: c.color }} /><span className="truncate">{l(c.name_en, c.name_ar)}</span></Link></li>)}</ul>
            </section>
          )}
        </aside>
      </div>
    </CommunityShell>
  );
}
