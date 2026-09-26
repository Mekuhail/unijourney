import { fmtDate, fmtTime } from '@/lib/format';
import { readableOn } from '@/lib/color';
import { useCallback, useMemo, useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router';
import clsx from 'clsx';
import { Users, MapPin, ShieldCheck, Search, Bell, BellOff, CalendarDays, Sparkles, Lock, Clock } from 'lucide-react';
import { useI18n } from '@/i18n';
import { useQuery } from '@/lib/useQuery';
import { api, errorMessage } from '@/lib/api';
import { refreshAll } from '@/lib/bus';
import { useToast } from '@/components/ui/toast';
import { useSession } from '@/lib/session';
import { useEdgeFade } from '@/components/ui/useEdgeFade';
import { PageHeader } from '@/components/ui/PageHeader';
import { Avatar, Badge, Button, Card, ConfirmDialog, EmptyState, ErrorState, Field, Input, KeyValue, Modal, SectionTitle, Skeleton, StatusPill, Tabs, Textarea } from '@/components/ui';
import type { Club, ClubDetail, ClubMember } from '../types';
import { EventCard } from '../lib';
import { ClubPosts, ModerationQueue, RoleChip } from '../community';

export function ClubMark({ club, size = 'md' }: { club: Pick<Club, 'color'>; size?: 'sm' | 'md' }) {
  return <span aria-hidden className={clsx('grid shrink-0 place-items-center', size === 'sm' ? 'h-9 w-9 rounded-xl' : 'h-11 w-11 rounded-2xl')} style={{ background: club.color, color: readableOn(club.color) }}><Users className={size === 'sm' ? 'h-4 w-4' : 'h-5 w-5'} /></span>;
}

function FollowButton({ club, onDone }: { club: Club; onDone?: () => void }) {
  const { t } = useI18n();
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  if (club.my_membership?.status === 'active') return null;
  const toggle = async () => {
    setBusy(true);
    try {
      await api(`/campus/clubs/${club.id}/follow`, club.following ? { method: 'DELETE' } : { method: 'POST', body: {} });
      toast.info(t(club.following ? 'campus.clubs.unfollowed' : 'campus.clubs.followed'));
      refreshAll('campus', 'community'); onDone?.();
    } catch (e) { toast.error(errorMessage(e)); } finally { setBusy(false); }
  };
  return <Button size="sm" variant={club.following ? 'secondary' : 'outline'} aria-pressed={club.following} title={t('campus.clubs.followHint')} loading={busy} icon={club.following ? <BellOff className="h-4 w-4" aria-hidden /> : <Bell className="h-4 w-4" aria-hidden />} onClick={() => void toggle()}>{t(club.following ? 'campus.clubs.following' : 'campus.clubs.follow')}</Button>;
}

function JoinLeaveButton({ club, onDone }: { club: Club; onDone?: () => void }) {
  const { t, l } = useI18n();
  const toast = useToast();
  const { hasRole } = useSession();
  const [busy, setBusy] = useState(false);
  const [confirm, setConfirm] = useState(false);
  const [asking, setAsking] = useState(false);
  const [answer, setAnswer] = useState('');
  const m = club.my_membership;
  if (!hasRole('student', 'club_lead')) return null;
  if (m?.role === 'lead') return <Badge tone="gold"><ShieldCheck className="h-3 w-3" />{t('campus.clubs.lead')}</Badge>;
  const open = club.profile.join_policy === 'open';
  const question = club.profile.join_question_en ? l(club.profile.join_question_en, club.profile.join_question_ar ?? club.profile.join_question_en) : null;
  const join = async () => {
    setBusy(true);
    try {
      await api(`/campus/clubs/${club.id}/join`, { method: 'POST', body: answer.trim() ? { answer: answer.trim() } : {} });
      toast.success(t(open ? 'campus.clubs.joined' : 'campus.clubs.requestSent'));
      setAsking(false); setAnswer('');
      refreshAll('campus', 'community'); onDone?.();
    } catch (e) { toast.error(errorMessage(e)); } finally { setBusy(false); }
  };
  const leave = async () => {
    setBusy(true);
    try { await api(`/campus/clubs/${club.id}/leave`, { method: 'POST', body: {} }); toast.info(t('campus.clubs.left')); refreshAll('campus', 'community'); onDone?.(); setConfirm(false); }
    catch (e) { toast.error(errorMessage(e)); } finally { setBusy(false); }
  };
  if (m?.status === 'active') return <><Button size="sm" variant="outline" loading={busy} onClick={() => setConfirm(true)}>{t('campus.clubs.leave')}</Button><ConfirmDialog open={confirm} onClose={() => setConfirm(false)} onConfirm={leave} title={t('campus.clubs.leave')} body={t('campus.clubs.leaveConfirm')} loading={busy} /></>;
  if (m?.status === 'pending') return <Badge tone="warn" dot>{t('campus.clubs.pending')}</Badge>;
  return (
    <>
      <Button size="sm" loading={busy} onClick={() => (open && !question ? void join() : setAsking(true))}>{t(open ? 'campus.clubs.joinOpen' : 'campus.clubs.join')}</Button>
      <Modal open={asking} onClose={() => setAsking(false)} title={t('campus.clubs.joinTitle', { club: l(club.name_en, club.name_ar) })} description={t(open ? 'campus.clubs.joinOpenNote' : 'campus.clubs.joinApprovalNote')} footer={<><Button variant="ghost" onClick={() => setAsking(false)}>{t('common.cancel')}</Button><Button loading={busy} onClick={() => void join()}>{t(open ? 'campus.clubs.joinOpen' : 'campus.clubs.sendRequest')}</Button></>}>
        {question ? <Field label={question} hint={t('campus.clubs.joinAnswer')}><Textarea rows={3} maxLength={500} value={answer} onChange={(e) => setAnswer(e.target.value)} /></Field> : null}
      </Modal>
    </>
  );
}

function ForYouReasons({ club }: { club: Club }) {
  const { t, locale } = useI18n();
  if (!club.for_you?.reasons.length) return null;
  return (
    <ul className="mt-2 space-y-1 text-xs text-muted">
      {club.for_you.reasons.slice(0, 2).map((r) => (
        <li key={r.key} className="flex items-start gap-1.5"><Sparkles className="mt-0.5 h-3.5 w-3.5 shrink-0 text-brand-600" aria-hidden /><span>{t(r.key, { ...r.params, list: String(locale === 'ar' ? r.params.list_ar ?? '' : r.params.list_en ?? '') })}</span></li>
      ))}
    </ul>
  );
}

function ClubCard({ c }: { c: Club }) {
  const { t, l, locale } = useI18n();
  const officers = c.officers.slice(0, 3);
  return (
    <article className="card flex h-full min-w-0 flex-col p-5">
      <div className="flex items-start justify-between gap-3">
        <Link to={`/campus/clubs/${c.id}`} className="flex min-w-0 items-center gap-3">
          <ClubMark club={c} />
          <span className="min-w-0"><span className="line-clamp-2 font-semibold leading-snug hover:text-brand-600">{l(c.name_en, c.name_ar)}</span><span className="block text-xs text-muted">{t(`campus.clubs.categories.${c.category}`)} · <MapPin className="inline h-3 w-3" aria-hidden /> {t(`shell.${c.campus_id}`)}</span></span>
        </Link>
        {c.my_membership && c.my_membership.status !== 'left' ? <StatusPill status={c.my_membership.status} /> : c.following ? <Badge tone="info"><Bell className="h-3 w-3" aria-hidden />{t('campus.clubs.following')}</Badge> : null}
      </div>
      <p className="mt-3 line-clamp-2 text-sm font-medium">{l(c.profile.tagline_en || c.description_en, c.profile.tagline_ar || c.description_ar)}</p>
      <p className="mt-1 line-clamp-2 flex-1 text-sm text-muted">{l(c.description_en, c.description_ar)}</p>
      {c.profile.tags.length > 0 && <div className="mt-3 flex flex-wrap gap-1">{c.profile.tags.slice(0, 4).map((tg) => <Badge key={tg.key} tone="neutral">{l(tg.en, tg.ar)}</Badge>)}</div>}
      {c.next_event && <p className="mt-3 flex min-w-0 items-center gap-1.5 text-xs"><CalendarDays className="h-3.5 w-3.5 shrink-0 text-brand-600" aria-hidden /><span className="min-w-0 truncate">{t('campus.clubs.nextEvent', { title: l(c.next_event.title_en, c.next_event.title_ar || c.next_event.title_en) })}</span><span className="num shrink-0 text-muted">· {fmtDate(c.next_event.start_at, locale, { weekday: 'short' })}</span></p>}
      <ForYouReasons club={c} />
      <div className="mt-4 flex flex-wrap items-center justify-between gap-2 border-t border-line pt-3">
        <div className="flex min-w-0 items-center gap-2">
          <span className="flex -space-x-2 rtl:space-x-reverse" aria-hidden>{officers.map((o) => <Avatar key={o.user_id} name={o.name_en} color={o.avatar_color} size={26} className="ring-2 ring-surface" />)}</span>
          <span className="truncate text-xs text-muted">{t('campus.clubs.memberCount', { n: c.member_count })} · {t('campus.clubs.activeWeek', { n: c.posts_this_week })}</span>
        </div>
        <div className="flex items-center gap-2"><FollowButton club={c} /><JoinLeaveButton club={c} /></div>
      </div>
    </article>
  );
}

const CATEGORY_ORDER = ['tech', 'business', 'design', 'arts', 'culture', 'law', 'community'];

export function ClubsPage() {
  const { t } = useI18n();
  const [params, setParams] = useSearchParams();
  const [campus, setCampus] = useState<'all' | 'riyadh' | 'khobar'>('all');
  const [query, setQuery] = useState(params.get('q') ?? '');
  const category = params.get('category') ?? '';
  const setCategory = (c: string) => setParams((p) => { if (c) p.set('category', c); else p.delete('category'); return p; }, { replace: true });
  const chips = useEdgeFade<HTMLDivElement>(category);
  const q = useQuery(() => api<Club[]>('/campus/clubs'), [], { refreshOn: ['campus', 'community'] });
  const clubs = useMemo(() => q.data ?? [], [q.data]);
  const categories = CATEGORY_ORDER.filter((c) => clubs.some((x) => x.category === c));
  const norm = query.trim().toLowerCase();
  const list = clubs.filter((c) => (campus === 'all' || c.campus_id === campus || c.profile.audience === 'all') && (!category || c.category === category) && (!norm || [c.name_en, c.name_ar, c.description_en, c.profile.tagline_en, c.profile.tagline_ar, ...c.profile.tags.flatMap((x) => [x.en, x.ar])].some((s) => s.toLowerCase().includes(norm))));
  const forYou = useMemo(() => clubs.filter((c) => c.for_you && c.for_you.score >= 2).sort((a, b) => b.for_you!.score - a.for_you!.score).slice(0, 3), [clubs]);
  const filtered = !!norm || !!category || campus !== 'all';
  return (
    <div>
      <PageHeader crumbs={[{ to: '/campus', label: t('nav.campus') }]} title={t('campus.clubs.title')} subtitle={t('campus.clubs.subtitle')} actions={<Tabs value={campus} onChange={setCampus} items={[{ value: 'all', label: t('common.all') }, { value: 'riyadh', label: t('shell.riyadh') }, { value: 'khobar', label: t('shell.khobar') }]} />} />

      <div className="mb-6 space-y-3">
        <div className="relative max-w-xl">
          <Search className="pointer-events-none absolute start-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" aria-hidden />
          <label htmlFor="club-search" className="sr-only">{t('campus.clubs.search')}</label>
          <Input id="club-search" type="search" value={query} onChange={(e) => setQuery(e.target.value)} placeholder={t('campus.clubs.searchPlaceholder')} className="ps-9" />
        </div>
        <div ref={chips} role="group" aria-label={t('campus.clubs.categoriesLabel')} className="scroll-row -mx-1 flex gap-2 overflow-x-auto px-1 py-0.5">
          {['', ...categories].map((c) => (
            <button key={c || 'all'} type="button" aria-pressed={category === c} onClick={() => setCategory(c)} className={clsx('inline-flex min-h-11 shrink-0 items-center rounded-full border px-4 text-sm font-medium transition sm:min-h-9', category === c ? 'border-brand-500 bg-brand-500 text-ink-950' : 'border-line bg-surface hover:border-brand-400')}>{c ? t(`campus.clubs.categories.${c}`) : t('common.all')}</button>
          ))}
        </div>
      </div>

      {!filtered && forYou.length > 0 && (
        <section aria-labelledby="for-you-h" className="mb-8">
          <SectionTitle id="for-you-h">{t('campus.clubs.forYou')}</SectionTitle>
          <p className="-mt-2 mb-3 text-sm text-muted">{t('campus.clubs.forYouBody')}</p>
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">{forYou.map((c) => <ClubCard key={c.id} c={c} />)}</div>
        </section>
      )}

      <section aria-labelledby="all-clubs-h">
        <SectionTitle id="all-clubs-h">{t('campus.clubs.allClubs')}</SectionTitle>
        {q.loading && !q.data && <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">{[1, 2, 3, 4, 5, 6].map((i) => <Skeleton key={i} className="h-64" />)}</div>}
        {q.error ? <ErrorState error={q.error} onRetry={() => void q.refetch()} /> : null}
        {q.data && list.length === 0 && <EmptyState icon={<Search className="h-6 w-6" />} title={t('campus.clubs.noMatch')} body={t('campus.clubs.noMatchBody')} action={<Button variant="outline" onClick={() => { setQuery(''); setCategory(''); setCampus('all'); }}>{t('campus.clubs.clearFilters')}</Button>} />}
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">{list.map((c) => <ClubCard key={c.id} c={c} />)}</div>
      </section>
    </div>
  );
}

// ------------------------------------------------------------------ club page
type ClubTab = 'posts' | 'events' | 'members' | 'about' | 'moderation';

function MemberRow({ m, club, onChanged }: { m: ClubMember; club: ClubDetail; onChanged: () => void }) {
  const { t, l, locale } = useI18n();
  const toast = useToast();
  const [edit, setEdit] = useState(false);
  const [title, setTitle] = useState(m.title_en ?? '');
  const [busy, setBusy] = useState(false);
  const setRole = async (role: 'officer' | 'member') => {
    setBusy(true);
    try { await api(`/campus/clubs/${club.id}/members/${m.id}`, { method: 'PATCH', body: { role, title_en: title.trim() || undefined } }); toast.success(t('campus.clubs.roleUpdated')); setEdit(false); onChanged(); }
    catch (e) { toast.error(errorMessage(e)); } finally { setBusy(false); }
  };
  return (
    <li className="flex flex-wrap items-center gap-3 py-2.5">
      <Avatar name={m.name_en} color={m.avatar_color} size={34} />
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2"><span className="truncate text-sm font-medium">{l(m.name_en, m.name_ar)}</span><RoleChip author={{ role: m.role as 'lead' | 'officer' | 'member', title_en: m.title_en ?? null, title_ar: m.title_ar ?? null }} /></div>
        <div className="text-xs text-muted">{m.program_id?.toUpperCase()}{club.is_lead && m.status === 'pending' ? ` · ${fmtDate(m.requested_at, locale)}` : ''}</div>
        {club.is_lead && m.answer && <p dir="auto" className="mt-1 text-xs"><span className="text-muted">{t('campus.clubs.joinAnswerLabel')}:</span> {m.answer}</p>}
      </div>
      {club.is_lead && m.status !== 'active' && <StatusPill status={m.status} />}
      {club.is_lead && m.status === 'active' && m.role !== 'lead' && (
        m.role === 'officer'
          ? <Button size="sm" variant="ghost" loading={busy} onClick={() => void setRole('member')}>{t('campus.clubs.makeMember')}</Button>
          : <Button size="sm" variant="ghost" onClick={() => setEdit(true)}>{t('campus.clubs.makeOfficer')}</Button>
      )}
      <Modal open={edit} onClose={() => setEdit(false)} title={t('campus.clubs.makeOfficer')} description={l(m.name_en, m.name_ar)} footer={<><Button variant="ghost" onClick={() => setEdit(false)}>{t('common.cancel')}</Button><Button loading={busy} onClick={() => void setRole('officer')}>{t('common.save')}</Button></>}>
        <Field label={t('campus.clubs.officerTitle')}><Input value={title} maxLength={60} onChange={(e) => setTitle(e.target.value)} placeholder={t('campus.clubs.officerTitlePlaceholder')} /></Field>
      </Modal>
    </li>
  );
}

export function ClubDetailPage() {
  const { id } = useParams();
  const { t, l, locale } = useI18n();
  const nav = useNavigate();
  const [params, setParams] = useSearchParams();
  const focusPost = params.get('post');
  const tab = (params.get('tab') as ClubTab | null) ?? 'posts';
  const setTab = (v: ClubTab) => setParams((p) => { p.set('tab', v); p.delete('post'); return p; }, { replace: true });
  const [reports, setReports] = useState<number | null>(null);
  const onReports = useCallback((n: number) => setReports(n), []);
  const q = useQuery(() => api<ClubDetail>(`/campus/clubs/${id}`), [id], { refreshOn: ['campus', 'calendar', 'community'] });
  const c = q.data;
  if (q.loading && !c) return <div className="space-y-4"><Skeleton className="h-28" /><Skeleton className="h-12" /><Skeleton className="h-64" /></div>;
  if (q.error) return <ErrorState error={q.error} onRetry={() => void q.refetch()} />;
  if (!c) return null;
  const upcoming = c.events.filter((e) => e.upcoming);
  const past = c.events.filter((e) => !e.upcoming);
  const members = c.members.filter((m) => m.status === 'active');
  const pending = c.members.filter((m) => m.status === 'pending');
  const tabs: Array<{ value: ClubTab; label: string; count?: number }> = [
    { value: 'posts', label: t('campus.clubs.tab.posts') },
    { value: 'events', label: t('campus.clubs.tab.events'), count: upcoming.length },
    { value: 'members', label: t('campus.clubs.tab.members'), count: c.member_count },
    { value: 'about', label: t('campus.clubs.tab.about') },
    ...(c.can_moderate ? [{ value: 'moderation' as ClubTab, label: t('campus.clubs.tab.moderation'), count: reports ?? undefined }] : [])
  ];
  return (
    <div>
      <PageHeader
        crumbs={[{ to: '/campus', label: t('nav.campus') }, { to: '/campus/clubs', label: t('campus.clubs.title') }]}
        meta={<><Badge tone="neutral">{t(`campus.clubs.categories.${c.category}`)}</Badge><Badge tone="neutral"><MapPin className="h-3 w-3" aria-hidden />{t(`campus.clubs.audience.${c.profile.audience}`)}</Badge></>}
        title={l(c.name_en, c.name_ar)}
        subtitle={l(c.profile.tagline_en || c.description_en, c.profile.tagline_ar || c.description_ar)}
        actions={<div className="flex flex-wrap items-center gap-2">{c.is_lead && <Button variant="gold" size="sm" onClick={() => nav(`/staff/campus/clubs?club=${c.id}`)}>{t('campus.clubs.manage')}</Button>}<FollowButton club={c} onDone={() => void q.refetch()} /><JoinLeaveButton club={c} onDone={() => void q.refetch()} /></div>}
      />
      <p className="-mt-2 mb-5 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-muted">
        <span>{t('campus.clubs.memberCount', { n: c.member_count })}</span><span aria-hidden>·</span>
        <span>{t('campus.clubs.followers', { n: c.follower_count })}</span><span aria-hidden>·</span>
        <span>{t('campus.clubs.activeWeek', { n: c.posts_this_week })}</span>
        {c.profile.meets_en && <><span aria-hidden>·</span><span className="inline-flex items-center gap-1"><Clock className="h-3.5 w-3.5" aria-hidden />{l(c.profile.meets_en, c.profile.meets_ar || c.profile.meets_en)}</span></>}
      </p>

      <Tabs className="mb-5" label={l(c.name_en, c.name_ar)} value={tab} onChange={setTab} items={tabs} />

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1fr)_320px]">
        <div className="min-w-0">
          {tab === 'posts' && <ClubPosts clubId={c.id} events={upcoming} focusPostId={focusPost} onReportsChange={onReports} />}
          {tab === 'events' && (
            <div className="space-y-6">
              <section aria-labelledby="club-events-h">
                <SectionTitle id="club-events-h">{t('campus.clubs.events')}</SectionTitle>
                {upcoming.length === 0 && <EmptyState icon={<CalendarDays className="h-6 w-6" />} title={t('common.empty')} />}
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">{upcoming.map((e) => <EventCard key={e.id} e={e} />)}</div>
              </section>
              {past.length > 0 && <section aria-labelledby="club-past-h"><SectionTitle id="club-past-h">{t('campus.clubs.pastEvents')}</SectionTitle><div className="grid grid-cols-1 gap-3 sm:grid-cols-2">{past.map((e) => <EventCard key={e.id} e={e} compact />)}</div></section>}
            </div>
          )}
          {tab === 'members' && (
            c.roster_visible ? (
              <div className="space-y-6">
                {c.is_lead && pending.length > 0 && <Card><SectionTitle as="h3">{t('campus.clubs.pending')}</SectionTitle><ul className="divide-y divide-line">{pending.map((m) => <MemberRow key={m.id} m={m} club={c} onChanged={() => void q.refetch()} />)}</ul></Card>}
                <Card><ul className="divide-y divide-line">{members.map((m) => <MemberRow key={m.id} m={m} club={c} onChanged={() => void q.refetch()} />)}</ul></Card>
              </div>
            ) : <EmptyState icon={<Lock className="h-6 w-6" />} title={t('campus.clubs.rosterPrivate')} body={t('campus.clubs.rosterPrivateBody')} action={<JoinLeaveButton club={c} onDone={() => void q.refetch()} />} />
          )}
          {tab === 'about' && (
            <Card className="space-y-4">
              <p dir="auto" className="leading-relaxed">{l(c.description_en, c.description_ar)}</p>
              {c.profile.tags.length > 0 && <div className="flex flex-wrap gap-1">{c.profile.tags.map((tg) => <Badge key={tg.key} tone="neutral">{l(tg.en, tg.ar)}</Badge>)}</div>}
              <KeyValue items={[
                ...(c.profile.meets_en ? [{ k: t('campus.clubs.meets'), v: l(c.profile.meets_en, c.profile.meets_ar || c.profile.meets_en) }] : []),
                { k: t('campus.clubs.audience'), v: t(`campus.clubs.audience.${c.profile.audience}`) },
                { k: t('campus.clubs.join'), v: t(`campus.clubs.policy.${c.profile.join_policy}`) },
                ...(c.profile.founded ? [{ k: t('campus.clubs.founded'), v: <span className="num">{c.profile.founded}</span> }] : [])
              ]} />
              {c.tracks.length > 0 && <div><div className="mb-1.5 text-xs font-semibold text-muted">{t('campus.clubs.tracks')}</div><div className="flex flex-wrap gap-1">{c.tracks.map((tr) => <Badge key={tr} tone="brand">{tr}</Badge>)}</div></div>}
            </Card>
          )}
          {tab === 'moderation' && c.can_moderate && <ModerationQueue clubId={c.id} />}
        </div>

        <aside className="min-w-0 space-y-4">
          <Card>
            <h2 className="mb-3 text-sm font-semibold">{t('campus.clubs.officers')}</h2>
            {c.officers.length === 0 && <p className="text-sm text-muted">{t('campus.clubs.noLead')}</p>}
            <ul className="space-y-3">
              {c.officers.map((o) => (
                <li key={o.user_id} className="flex items-center gap-3">
                  <Avatar name={o.name_en} color={o.avatar_color} size={36} />
                  <div className="min-w-0"><div className="truncate text-sm font-semibold">{l(o.name_en, o.name_ar)}</div><div className="truncate text-xs text-muted">{o.title_en ? l(o.title_en, o.title_ar ?? o.title_en) : t(`campus.clubs.role.${o.role}`)}</div></div>
                </li>
              ))}
            </ul>
          </Card>
          {c.next_event && (
            <Link to={`/campus/events/${c.next_event.id}`} className="card block p-4 transition hover:border-brand-400">
              <div className="text-xs font-semibold text-muted">{t('campus.clubs.nextEventLabel')}</div>
              <div className="mt-1 font-semibold">{l(c.next_event.title_en, c.next_event.title_ar || c.next_event.title_en)}</div>
              <div className="num mt-1 text-sm text-muted">{fmtDate(c.next_event.start_at, locale, { weekday: 'short' })} · {fmtTime(c.next_event.start_at, locale)}</div>
            </Link>
          )}
          {!c.my_membership && !c.following && <p className="text-xs text-muted">{t('campus.clubs.followHint')}</p>}
        </aside>
      </div>
    </div>
  );
}
