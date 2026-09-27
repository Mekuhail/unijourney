import { useState } from 'react';
import { Link, useParams, useSearchParams, useNavigate } from 'react-router';
import { ArrowLeft, ArrowRight, MessageCircle, Search, Flag, EyeOff, CheckCircle2 } from 'lucide-react';
import { useI18n } from '@/i18n';
import { api, errorMessage } from '@/lib/api';
import { refreshAll } from '@/lib/bus';
import { useQuery } from '@/lib/useQuery';
import { fmtDate, fmtRelative } from '@/lib/format';
import { readableOn } from '@/lib/color';
import { useToast } from '@/components/ui/toast';
import { useDemoStatus } from '@/shell/DemoClock';
import { PageHeader } from '@/components/ui/PageHeader';
import { Avatar, Badge, Button, ButtonLink, EmptyState, ErrorState, Skeleton } from '@/components/ui';
import type { CommunityReport, CommunitySummary, FeedPost, SearchResults } from '../types';
import { PostCard } from '../community';
import { CommunityShell, PersonLink, Ticket } from './shared';

// ------------------------------------------------------------------ permalink
export function PostPage() {
  const { id } = useParams();
  const { t } = useI18n();
  const q = useQuery(() => api<FeedPost>(`/campus/community/posts/${id}`), [id], { refreshOn: ['community'] });
  const nav = useNavigate();
  return (
    <CommunityShell doc={t('social.nav.feed')}>
      <Link to="/campus/community" className="mb-4 inline-flex min-h-11 items-center gap-1.5 text-sm font-medium text-brand-600 hover:underline"><ArrowLeft className="h-4 w-4 rtl:rotate-180" aria-hidden />{t('social.post.back')}</Link>
      <div className="max-w-2xl">
        {q.loading && !q.data && <Skeleton className="h-48" />}
        {q.error ? <ErrorState error={q.error} onRetry={() => void q.refetch()} /> : null}
        {q.data && <PostCard post={q.data} showClub highlight onRemoved={() => nav('/campus/community')} />}
      </div>
    </CommunityShell>
  );
}

// ------------------------------------------------------------------ search
export function SearchPage() {
  const { t, l, locale } = useI18n();
  const [params] = useSearchParams();
  const q = params.get('q') ?? '';
  const r = useQuery(() => api<SearchResults>('/campus/community/search', { query: { q } }), [q]);
  const d = r.data;
  const none = d && !d.posts.length && !d.clubs.length && !d.events.length && !d.people.length;
  return (
    <CommunityShell doc={t('social.search.title')}>
      <h2 className="mb-4 font-display text-2xl">{q.length >= 2 ? t('social.search.results', { q }) : t('social.search.title')}</h2>
      {q.length < 2 && <p className="text-sm text-muted">{t('social.search.hint')}</p>}
      {r.loading && q.length >= 2 && !d && <Skeleton className="h-64" />}
      {r.error ? <ErrorState error={r.error} onRetry={() => void r.refetch()} /> : null}
      {none && <EmptyState icon={<Search className="h-6 w-6" />} title={t('social.search.none')} />}
      {d && !none && (
        <div className="grid grid-cols-1 gap-8 lg:grid-cols-[minmax(0,1fr)_340px]">
          <section aria-labelledby="sr-posts" className="min-w-0">
            <h3 id="sr-posts" className="mb-3 font-semibold">{t('social.search.posts')} <span className="num text-muted">{d.posts.length}</span></h3>
            {d.posts.length === 0 ? <p className="text-sm text-muted">{t('social.search.none')}</p> : <div className="space-y-4">{d.posts.map((p) => <PostCard key={`${p.type}-${p.id}`} post={p} showClub />)}</div>}
          </section>
          <div className="min-w-0 space-y-8">
            <section aria-labelledby="sr-events">
              <h3 id="sr-events" className="mb-2 font-semibold">{t('social.search.events')} <span className="num text-muted">{d.events.length}</span></h3>
              <ul className="space-y-1">{d.events.map((e) => <li key={e.id}><Link to={`/campus/events/${e.id}`} className="block min-h-11 rounded-xl px-2 py-2 hover:bg-line/40"><span className="block text-sm font-medium">{l(e.title_en, e.title_ar || e.title_en)}</span><span className="num block text-xs text-muted">{fmtDate(e.start_at, locale, { weekday: 'short' })}</span></Link></li>)}</ul>
            </section>
            <section aria-labelledby="sr-clubs">
              <h3 id="sr-clubs" className="mb-2 font-semibold">{t('social.search.clubs')} <span className="num text-muted">{d.clubs.length}</span></h3>
              <ul className="space-y-1">{d.clubs.map((c) => <li key={c.id}><Link to={`/campus/clubs/${c.id}`} className="flex min-h-11 items-center gap-2.5 rounded-xl px-2 hover:bg-line/40"><span aria-hidden className="grid h-8 w-8 place-items-center rounded-lg text-xs font-bold" style={{ background: c.color, color: readableOn(c.color) }}>{c.name_en.slice(0, 1)}</span><span className="min-w-0 flex-1"><span className="block truncate text-sm font-medium">{l(c.name_en, c.name_ar)}</span><span className="block text-xs text-muted">{t('campus.clubs.memberCount', { n: c.member_count })}</span></span></Link></li>)}</ul>
            </section>
            <section aria-labelledby="sr-people">
              <h3 id="sr-people" className="mb-2 font-semibold">{t('social.search.people')} <span className="num text-muted">{d.people.length}</span></h3>
              <ul className="divide-y divide-line">{d.people.map((p) => <li key={p.id}><PersonLink p={p} size={34} /></li>)}</ul>
            </section>
          </div>
        </div>
      )}
    </CommunityShell>
  );
}

// ------------------------------------------------------------------ Campus Life entry
/**
 * The way into the community from Campus Life: a warm, lamplit board that is always dark (like the digital card),
 * with a real preview of what is happening: who posted, the latest post, the next workshop and unread messages.
 */
export function CommunityEntry() {
  const { t, l, locale } = useI18n();
  const { data: status } = useDemoStatus();
  const q = useQuery(() => api<CommunitySummary>('/campus/community/summary'), [], { refreshOn: ['community', 'messages', 'campus'] });
  const d = q.data;
  const now = status?.clock ?? new Date().toISOString();
  const next = d?.workshops[0];
  return (
    <section aria-labelledby="community-entry-h" className="relative mb-8 overflow-hidden rounded-2xl bg-ink-950 text-ink-50 [color-scheme:dark]">
      <div aria-hidden className="pointer-events-none absolute -top-32 start-[-6rem] h-80 w-[36rem] rounded-full bg-[radial-gradient(closest-side,rgba(240,118,43,0.35),transparent)]" />
      <div className="relative grid gap-6 p-5 sm:p-7 lg:grid-cols-[minmax(0,1.15fr)_minmax(0,1fr)] lg:items-center">
        <div className="min-w-0">
          <h2 id="community-entry-h" className="font-display text-3xl leading-tight sm:text-4xl">{t('social.entry.heading')}</h2>
          <p className="mt-2 max-w-[52ch] text-[0.95rem] leading-relaxed text-ink-100">{t('social.entry.body')}</p>
          <div className="mt-5 flex flex-wrap items-center gap-3">
            <ButtonLink to="/campus/community" size="lg" className="shadow-none">{t('social.entry.cta')}<ArrowRight className="h-5 w-5 rtl:rotate-180" aria-hidden /></ButtonLink>
            <Link to="/campus/community/messages" className="inline-flex min-h-11 items-center gap-2 rounded-xl px-3 text-sm font-medium text-ink-50 ring-1 ring-ink-50/25 hover:bg-ink-50/10">
              <MessageCircle className="h-4 w-4" aria-hidden />{d?.unread_messages ? t('social.entry.unread', { n: d.unread_messages }) : t('social.entry.messages')}
            </Link>
          </div>
          <div className="mt-5 flex items-center gap-3 text-sm text-ink-200">
            <span className="flex -space-x-2 rtl:space-x-reverse" aria-hidden>{(d?.authors ?? []).filter(Boolean).map((a) => <Avatar key={a!.id} name={a!.name_en} color={a!.avatar_color} size={30} className="ring-2 ring-ink-950" />)}</span>
            {d ? <span>{t('social.entry.today', { n: d.posts_today })}</span> : <span className="h-4 w-40 animate-pulse rounded bg-ink-50/10" />}
          </div>
        </div>
        <div className="min-w-0 space-y-3">
          {d?.latest && (
            <Link to={`/campus/community/posts/${d.latest.id}`} className="block rounded-2xl bg-ink-50/[0.07] p-4 ring-1 ring-ink-50/10 transition hover:bg-ink-50/[0.11]">
              <span className="mb-2 flex items-center gap-2 text-xs text-ink-200">
                {d.latest.author && <Avatar name={d.latest.author.name_en} color={d.latest.author.avatar_color} size={24} />}
                <span className="font-semibold text-ink-50">{d.latest.author ? l(d.latest.author.name_en, d.latest.author.name_ar) : ''}</span>
                <span aria-hidden>·</span><time dateTime={d.latest.created_at}>{fmtRelative(d.latest.created_at, now, locale)}</time>
                <span className="sr-only">{t('social.entry.latest')}</span>
              </span>
              <span dir="auto" className="line-clamp-3 block text-sm leading-relaxed text-ink-50">{d.latest.body}</span>
            </Link>
          )}
          {next && (
            <div>
              <p className="mb-1.5 text-xs font-medium text-ink-200">{t('social.entry.next')}</p>
              <div className="text-fg"><Ticket e={{ ...next, organizer: undefined }} compact /></div>
            </div>
          )}
          {q.loading && !d && <div className="h-40 animate-pulse rounded-2xl bg-ink-50/10" />}
        </div>
      </div>
    </section>
  );
}

// ------------------------------------------------------------------ staff: community reports
export function CommunityReportsDesk() {
  const { t, l, locale } = useI18n();
  const toast = useToast();
  const q = useQuery(() => api<CommunityReport[]>('/campus/community/reports'), [], { refreshOn: ['community'] });
  const [busy, setBusy] = useState<string | null>(null);
  const resolve = async (r: CommunityReport, action: 'dismiss' | 'remove') => {
    setBusy(r.id);
    try { await api(`/campus/community/reports/${r.id}/resolve`, { method: 'POST', body: { action, reason: action === 'remove' ? t(`community.reason.${r.reason}`) : undefined } }); toast.success(t(action === 'remove' ? 'social.staff.removed' : 'social.staff.dismissed')); refreshAll('community'); }
    catch (e) { toast.error(errorMessage(e)); } finally { setBusy(null); }
  };
  return (
    <div>
      <PageHeader crumbs={[{ to: '/staff', label: t('nav.staff') }]} title={t('social.staff.title')} subtitle={t('social.staff.body')} />
      {q.loading && !q.data && <Skeleton className="h-48" />}
      {q.error ? <ErrorState error={q.error} onRetry={() => void q.refetch()} /> : null}
      {q.data && q.data.length === 0 && <EmptyState icon={<CheckCircle2 className="h-6 w-6" />} title={t('social.staff.empty')} />}
      <ul className="space-y-3">
        {q.data?.map((r) => (
          <li key={r.id} className="card p-4">
            <div className="flex flex-wrap items-center gap-1.5">
              <Badge tone="warn"><Flag className="h-3 w-3" aria-hidden />{t(`community.reason.${r.reason}`)}</Badge>
              <Badge tone="neutral">{t(`social.staff.type.${r.target_type}`)}</Badge>
              {r.reports > 1 && <Badge tone="neutral">{t('social.staff.reports', { n: r.reports })}</Badge>}
              {r.hidden && <Badge tone="neutral"><EyeOff className="h-3 w-3" aria-hidden />{t('social.staff.hidden')}</Badge>}
              <span className="num ms-auto text-xs text-muted">{fmtDate(r.created_at, locale)}</span>
            </div>
            <blockquote dir="auto" className="mt-2 border-s-2 border-line ps-3 text-sm">{r.body}</blockquote>
            {r.author && <p className="mt-1 text-xs text-muted">{l(r.author.name_en, r.author.name_ar)}</p>}
            {r.note && <p dir="auto" className="mt-1 text-sm text-muted">“{r.note}”</p>}
            <div className="mt-3 flex flex-wrap gap-2">
              {r.link && <ButtonLink size="sm" variant="ghost" to={r.link}>{t('social.staff.open')}</ButtonLink>}
              <Button size="sm" variant="outline" loading={busy === r.id} onClick={() => void resolve(r, 'dismiss')}>{t('social.staff.dismiss')}</Button>
              <Button size="sm" variant="danger" loading={busy === r.id} onClick={() => void resolve(r, 'remove')}>{t('social.staff.remove')}</Button>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
