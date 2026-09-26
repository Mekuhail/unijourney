import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router';
import { Users, MapPin, ShieldCheck, ArrowLeft } from 'lucide-react';
import { useI18n } from '@/i18n';
import { useQuery } from '@/lib/useQuery';
import { api, errorMessage } from '@/lib/api';
import { refreshAll } from '@/lib/bus';
import { useToast } from '@/components/ui/toast';
import { useSession } from '@/lib/session';
import { PageHeader } from '@/components/ui/PageHeader';
import { Avatar, Badge, Button, Card, ConfirmDialog, EmptyState, ErrorState, SectionTitle, Skeleton, StatusPill, Tabs } from '@/components/ui';
import GlareHover from '@/components/reactbits/GlareHover';
import type { Club, ClubDetail } from '../types';
import { EventCard } from '../lib';

function JoinLeaveButton({ club, onDone }: { club: Club; onDone?: () => void }) {
  const { t } = useI18n();
  const toast = useToast();
  const { hasRole } = useSession();
  const [busy, setBusy] = useState(false);
  const [confirm, setConfirm] = useState(false);
  const m = club.my_membership;
  if (!hasRole('student', 'club_lead')) return null;
  if (m?.role === 'lead') return <Badge tone="gold"><ShieldCheck className="h-3 w-3" />{t('campus.clubs.lead')}</Badge>;
  const join = async () => {
    setBusy(true);
    try { await api(`/campus/clubs/${club.id}/join`, { method: 'POST', body: {} }); toast.success(t('campus.clubs.requestSent')); refreshAll('campus'); onDone?.(); }
    catch (e) { toast.error(errorMessage(e)); } finally { setBusy(false); }
  };
  const leave = async () => {
    setBusy(true);
    try { await api(`/campus/clubs/${club.id}/leave`, { method: 'POST', body: {} }); toast.info(t('campus.clubs.left')); refreshAll('campus'); onDone?.(); setConfirm(false); }
    catch (e) { toast.error(errorMessage(e)); } finally { setBusy(false); }
  };
  if (m?.status === 'active') return <><Button size="sm" variant="outline" loading={busy} onClick={() => setConfirm(true)}>{t('campus.clubs.leave')}</Button><ConfirmDialog open={confirm} onClose={() => setConfirm(false)} onConfirm={leave} title={t('campus.clubs.leave')} body={t('campus.clubs.leaveConfirm')} loading={busy} /></>;
  if (m?.status === 'pending') return <Badge tone="warn" dot>{t('campus.clubs.pending')}</Badge>;
  return <Button size="sm" loading={busy} onClick={() => void join()}>{t('campus.clubs.join')}</Button>;
}

export function ClubsPage() {
  const { t, l } = useI18n();
  const [campus, setCampus] = useState<'all' | 'riyadh' | 'khobar'>('all');
  const q = useQuery(() => api<Club[]>('/campus/clubs'), [], { refreshOn: ['campus'] });
  const list = (q.data ?? []).filter((c) => campus === 'all' || c.campus_id === campus);
  return (
    <div>
      <PageHeader eyebrow={t('campus.hub.eyebrow')} title={t('campus.clubs.title')} subtitle={t('campus.clubs.subtitle')} actions={<Tabs value={campus} onChange={setCampus} items={[{ value: 'all', label: t('common.all') }, { value: 'riyadh', label: t('shell.riyadh') }, { value: 'khobar', label: t('shell.khobar') }]} />} />
      {q.loading && <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">{[1, 2, 3, 4, 5].map((i) => <Skeleton key={i} className="h-48" />)}</div>}
      {q.error ? <ErrorState error={q.error} onRetry={() => void q.refetch()} /> : null}
      {q.data && list.length === 0 && <EmptyState title={t('common.empty')} />}
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
        {list.map((c) => (
          <GlareHover key={c.id} width="100%" height="auto" background="var(--surface)" borderRadius="1.25rem" borderColor="var(--line)" glareColor={c.color} glareOpacity={0.18} className="!block">
            <div className="flex h-full flex-col p-5">
              <div className="flex items-start justify-between gap-3">
                <Link to={`/campus/clubs/${c.id}`} className="flex min-w-0 items-center gap-3">
                  <span className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl text-white" style={{ background: c.color }}><Users className="h-5 w-5" /></span>
                  <span className="min-w-0"><span className="block truncate font-semibold hover:text-brand-600">{l(c.name_en, c.name_ar)}</span><span className="block text-xs text-muted">{t(`campus.clubs.categories.${c.category}`)} · <MapPin className="inline h-3 w-3" /> {t(`shell.${c.campus_id}`)}</span></span>
                </Link>
                {c.my_membership && c.my_membership.status !== 'left' && <StatusPill status={c.my_membership.status} />}
              </div>
              <p className="mt-3 line-clamp-3 flex-1 text-sm text-muted">{l(c.description_en, c.description_ar)}</p>
              {c.tracks.length > 0 && <div className="mt-3 flex flex-wrap gap-1">{c.tracks.map((tr) => <Badge key={tr} tone="brand">{tr}</Badge>)}</div>}
              <div className="mt-4 flex items-center justify-between gap-2 text-xs text-muted">
                <span>{c.member_count} {t('campus.clubs.members')} · {c.upcoming_events} {t('campus.clubs.upcoming')}</span>
                <JoinLeaveButton club={c} />
              </div>
            </div>
          </GlareHover>
        ))}
      </div>
    </div>
  );
}

export function ClubDetailPage() {
  const { id } = useParams();
  const { t, l, locale } = useI18n();
  const nav = useNavigate();
  const q = useQuery(() => api<ClubDetail>(`/campus/clubs/${id}`), [id], { refreshOn: ['campus', 'calendar'] });
  const c = q.data;
  if (q.loading) return <div className="space-y-4"><Skeleton className="h-24" /><Skeleton className="h-64" /></div>;
  if (q.error) return <ErrorState error={q.error} onRetry={() => void q.refetch()} />;
  if (!c) return null;
  const upcoming = c.events.filter((e) => e.upcoming);
  const past = c.events.filter((e) => !e.upcoming);
  return (
    <div>
      <Link to="/campus/clubs" className="mb-3 inline-flex items-center gap-1 text-xs font-semibold text-muted hover:text-fg min-h-11"><ArrowLeft className="h-3.5 w-3.5 rtl:rotate-180" />{t('campus.clubs.title')}</Link>
      <PageHeader eyebrow={t(`campus.clubs.categories.${c.category}`)} title={l(c.name_en, c.name_ar)} subtitle={l(c.description_en, c.description_ar)} actions={<div className="flex items-center gap-2">{c.is_lead && <Button variant="gold" size="sm" onClick={() => nav(`/staff/campus/clubs?club=${c.id}`)}>{t('campus.clubs.manage')}</Button>}<JoinLeaveButton club={c} onDone={() => void q.refetch()} /></div>} />
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[1fr_320px]">
        <div className="space-y-6">
          <section>
            <SectionTitle>{t('campus.clubs.events')}</SectionTitle>
            {upcoming.length === 0 && <EmptyState title={t('common.empty')} />}
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">{upcoming.map((e) => <EventCard key={e.id} e={e} />)}</div>
          </section>
          {past.length > 0 && (
            <section>
              <SectionTitle>{t('campus.clubs.pastEvents')}</SectionTitle>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">{past.map((e) => <EventCard key={e.id} e={e} compact />)}</div>
            </section>
          )}
        </div>
        <div className="space-y-4">
          <Card>
            <div className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted">{t('campus.clubs.lead')}</div>
            {c.lead ? <div className="flex items-center gap-3"><Avatar name={c.lead.name_en} color={c.lead.avatar_color} /><div><div className="text-sm font-semibold">{l(c.lead.name_en, c.lead.name_ar)}</div><div className="text-xs text-muted">{c.lead.program_id?.toUpperCase()} · {t(`shell.${c.lead.campus_id}`)}</div></div></div> : <div className="text-sm text-muted">{t('campus.clubs.noLead')}</div>}
            {c.tracks.length > 0 && <><div className="mb-1.5 mt-4 text-xs font-semibold uppercase tracking-wider text-muted">{t('campus.clubs.tracks')}</div><div className="flex flex-wrap gap-1">{c.tracks.map((tr) => <Badge key={tr} tone="brand">{tr}</Badge>)}</div></>}
          </Card>
          <Card>
            <div className="mb-2 flex items-center justify-between text-xs font-semibold uppercase tracking-wider text-muted"><span>{t('campus.clubs.roster')}</span><span className="num">{c.member_count}</span></div>
            <ul className="space-y-2">
              {c.members.map((m) => (
                <li key={m.id} className="flex items-center gap-2 text-sm">
                  <Avatar name={m.name_en} color={m.avatar_color} size={28} />
                  <span className="min-w-0 flex-1 truncate">{l(m.name_en, m.name_ar)}{m.role === 'lead' && <span className="ms-1 text-xs text-gold-700">· {t('campus.clubs.lead')}</span>}</span>
                  {c.is_lead && <StatusPill status={m.status} />}
                  {c.is_lead && m.status === 'pending' && <span className="text-xs text-muted">{new Date(m.requested_at).toLocaleDateString(locale === 'ar' ? 'ar-SA-u-nu-latn' : 'en-GB')}</span>}
                </li>
              ))}
              {c.members.length === 0 && <li className="text-sm text-muted">{t('common.empty')}</li>}
            </ul>
          </Card>
        </div>
      </div>
    </div>
  );
}
