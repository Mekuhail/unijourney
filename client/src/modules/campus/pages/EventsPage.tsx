import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router';
import { CalendarDays, MapPin, Users, ExternalLink, ArrowLeft, Route, FileText, Wrench, ShieldCheck, Trash2 } from 'lucide-react';
import { useI18n } from '@/i18n';
import { useQuery } from '@/lib/useQuery';
import { api, ApiError, errorMessage } from '@/lib/api';
import { refreshAll } from '@/lib/bus';
import { useToast } from '@/components/ui/toast';
import { useSession } from '@/lib/session';
import { PageHeader } from '@/components/ui/PageHeader';
import { Badge, Button, Callout, Card, ConfirmDialog, EmptyState, ErrorState, Field, Input, KeyValue, Modal, SectionTitle, Skeleton, StatusPill, Tabs, Avatar } from '@/components/ui';
import { fmtDate, fmtDateTime } from '@/lib/format';
import type { EventDetail, EventItem, RsvpResult } from '../types';
import { ConflictList, EventCard, KindBadge, fmtRange } from '../lib';

type Filter = 'all' | 'club' | 'external' | 'university' | 'personal' | 'mine';

export function PersonalEventModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { t } = useI18n();
  const toast = useToast();
  const [form, setForm] = useState({ title: '', date: '2026-09-28', start: '17:00', end: '18:00', location_text: '' });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const submit = async () => {
    setBusy(true); setError(null);
    try {
      await api('/campus/events/personal', { body: { title: form.title, start_at: `${form.date}T${form.start}:00+03:00`, end_at: `${form.date}T${form.end}:00+03:00`, location_text: form.location_text || undefined } });
      toast.success(t('campus.events.saved')); refreshAll('calendar', 'campus'); onClose();
    } catch (e) { setError(errorMessage(e)); } finally { setBusy(false); }
  };
  return (
    <Modal open={open} onClose={onClose} title={t('campus.events.personalTitle')} size="sm" footer={<><Button variant="ghost" onClick={onClose}>{t('common.cancel')}</Button><Button loading={busy} onClick={() => void submit()} disabled={form.title.trim().length < 2}>{t('common.save')}</Button></>}>
      <div className="space-y-3">
        <Field label={t('campus.events.title_field')} required><Input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} /></Field>
        <Field label={t('common.date')} required><Input type="date" value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} /></Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label={t('campus.events.startsAt')}><Input type="time" value={form.start} onChange={(e) => setForm({ ...form, start: e.target.value })} /></Field>
          <Field label={t('campus.events.endsAt')}><Input type="time" value={form.end} onChange={(e) => setForm({ ...form, end: e.target.value })} /></Field>
        </div>
        <Field label={t('campus.events.venueText')}><Input value={form.location_text} onChange={(e) => setForm({ ...form, location_text: e.target.value })} /></Field>
        {error && <Callout tone="danger">{error}</Callout>}
      </div>
    </Modal>
  );
}

export function EventsPage() {
  const { t } = useI18n();
  const [filter, setFilter] = useState<Filter>('all');
  const [personalOpen, setPersonalOpen] = useState(false);
  const q = useQuery(() => api<EventItem[]>('/campus/events', { query: filter === 'mine' ? { mine: 1 } : filter !== 'all' ? { kind: filter } : {} }), [filter], { refreshOn: ['calendar', 'campus'] });
  const list = (q.data ?? []).filter((e) => !e.is_past);
  const past = (q.data ?? []).filter((e) => e.is_past);
  return (
    <div>
      <PageHeader eyebrow={t('campus.hub.eyebrow')} title={t('campus.events.title')} subtitle={t('campus.events.subtitle')} actions={<Button variant="outline" onClick={() => setPersonalOpen(true)}>{t('campus.events.addPersonal')}</Button>} />
      <Tabs value={filter} onChange={setFilter} className="mb-4 w-fit max-w-full" items={[{ value: 'all', label: t('campus.events.all') }, { value: 'club', label: t('campus.events.club') }, { value: 'university', label: t('campus.events.university') }, { value: 'external', label: t('campus.events.external') }, { value: 'personal', label: t('campus.events.personal') }, { value: 'mine', label: t('campus.events.mine') }]} />
      {q.loading && <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">{[1, 2, 3, 4, 5, 6].map((i) => <Skeleton key={i} className="h-36" />)}</div>}
      {q.error ? <ErrorState error={q.error} onRetry={() => void q.refetch()} /> : null}
      {q.data && list.length === 0 && <EmptyState icon={<CalendarDays className="h-6 w-6" />} title={t('campus.events.none')} />}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">{list.map((e) => <EventCard key={e.id} e={e} />)}</div>
      {past.length > 0 && <><SectionTitle className="mt-8">{t('campus.clubs.pastEvents')}</SectionTitle><div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">{past.map((e) => <EventCard key={e.id} e={e} compact />)}</div></>}
      <PersonalEventModal open={personalOpen} onClose={() => setPersonalOpen(false)} />
    </div>
  );
}

export function EventDetailPage() {
  const { id } = useParams();
  const { t, l, locale } = useI18n();
  const nav = useNavigate();
  const toast = useToast();
  const { hasRole, user } = useSession();
  const q = useQuery(() => api<EventDetail>(`/campus/events/${id}`), [id], { refreshOn: ['calendar', 'campus'] });
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<RsvpResult | null>(null);
  const [cancelOpen, setCancelOpen] = useState(false);
  const [excuseBusy, setExcuseBusy] = useState(false);
  const e = q.data;
  const canVerify = !!e && ((e.club && hasRole('club_lead') && e.club.lead_id === user?.id) || hasRole('reviewer'));
  const participants = useQuery(() => api<Array<{ id: string; user_id: string; status: string; name_en: string; name_ar: string; avatar_color: string; achievement_id: string | null }>>(`/campus/events/${id}/participants`), [id, canVerify], { enabled: canVerify, refreshOn: ['campus'] });

  const rsvp = async () => {
    if (!e) return;
    setBusy(true);
    try {
      const r = await api<RsvpResult>(`/campus/events/${e.id}/rsvp`, { method: 'POST', body: {} });
      setResult(r);
      toast.success(r.rsvp.status === 'going' ? t('campus.events.rsvpDone') : t('campus.events.rsvpWaitlisted'));
      refreshAll('calendar', 'campus');
    } catch (err) { toast.error(errorMessage(err)); } finally { setBusy(false); }
  };
  const cancel = async () => {
    if (!e) return;
    setBusy(true);
    try { await api(`/campus/events/${e.id}/rsvp`, { method: 'DELETE' }); setResult(null); toast.info(t('campus.events.rsvpCancelled')); refreshAll('calendar', 'campus'); setCancelOpen(false); }
    catch (err) { toast.error(errorMessage(err)); } finally { setBusy(false); }
  };
  const draftExcuse = async () => {
    if (!e) return;
    setExcuseBusy(true);
    try {
      const d = await api<{ id: string }>('/academics/excuses/draft-from-event', { body: { eventId: e.id, attendanceIds: e.suggestions.attendanceIds } });
      toast.success(t('campus.events.excuseCreated'));
      nav(`/academics/excuses/${d.id}`);
    } catch (err) {
      if (err instanceof ApiError && err.status === 404) toast.error(t('campus.events.excuseUnavailable'));
      else toast.error(errorMessage(err));
    } finally { setExcuseBusy(false); }
  };
  const verify = async (userId: string) => {
    if (!e) return;
    try { await api(`/campus/events/${e.id}/attendance/${userId}/verify`, { method: 'POST', body: {} }); toast.success(t('campus.events.verified')); refreshAll('campus'); }
    catch (err) { toast.error(errorMessage(err)); }
  };
  const removePersonal = async () => {
    if (!e) return;
    try { await api(`/campus/events/${e.id}`, { method: 'DELETE' }); refreshAll('calendar', 'campus'); nav('/campus/events'); }
    catch (err) { toast.error(errorMessage(err)); }
  };

  if (q.loading) return <div className="space-y-4"><Skeleton className="h-24" /><Skeleton className="h-64" /></div>;
  if (q.error) return <ErrorState error={q.error} onRetry={() => void q.refetch()} />;
  if (!e) return null;
  const conflicts = result?.conflicts ?? e.conflicts;
  const suggestions = result?.suggestions ?? e.suggestions;
  const mine = result?.event.my_rsvp ?? e.my_rsvp;
  const going = mine?.status === 'going' || mine?.status === 'waitlisted';
  const classConflict = conflicts.some((c) => c.isClass);

  return (
    <div>
      <Link to="/campus/events" className="mb-3 inline-flex items-center gap-1 text-xs font-semibold text-muted hover:text-fg"><ArrowLeft className="h-3.5 w-3.5 rtl:rotate-180" />{t('campus.events.title')}</Link>
      <PageHeader eyebrow={<span className="flex items-center gap-2"><KindBadge kind={e.kind} />{e.club && <Link to={`/campus/clubs/${e.club.id}`} className="hover:underline">{l(e.club.name_en, e.club.name_ar)}</Link>}{e.demo_label && e.kind === 'external' && <Badge tone="gold">{t('campus.events.demoListing')}</Badge>}</span>} title={l(e.title_en, e.title_ar)}
        actions={<div className="flex flex-wrap items-center gap-2">
          {e.kind === 'personal' ? <Button variant="outline" icon={<Trash2 className="h-4 w-4" />} onClick={() => void removePersonal()}>{t('campus.events.deletePersonal')}</Button>
            : e.is_past ? <Badge tone="neutral">{t('campus.events.pastEvent')}</Badge>
            : going ? <><StatusPill status={mine!.status} /><Button variant="outline" loading={busy} onClick={() => setCancelOpen(true)}>{t('campus.events.cancelRsvp')}</Button></>
            : <Button loading={busy} onClick={() => void rsvp()} variant={e.full ? 'secondary' : 'primary'}>{e.full ? t('campus.events.joinWaitlist') : t('campus.events.rsvp')}</Button>}
          {e.can_edit && e.kind !== 'personal' && <Button variant="gold" size="sm" onClick={() => nav(`/staff/campus/clubs?club=${e.club_id}&event=${e.id}`)}>{t('campus.events.edit')}</Button>}
        </div>} />

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[1fr_340px]">
        <div className="space-y-4">
          {(classConflict || (going && conflicts.length > 0)) && (
            <Callout tone="warn" title={t('campus.events.conflict')}>
              <p className="mb-2">{t('campus.events.conflictBody')}</p>
              <ConflictList conflicts={conflicts} />
              {classConflict && (
                <div className="mt-3 flex flex-wrap gap-2">
                  <Button size="sm" icon={<FileText className="h-4 w-4" />} loading={excuseBusy} onClick={() => void draftExcuse()}>{t('campus.events.draftExcuse')}</Button>
                  <Button size="sm" variant="outline" icon={<Wrench className="h-4 w-4" />} onClick={() => nav(suggestions.studyRepairLink)}>{t('campus.events.studyRepair')}</Button>
                </div>
              )}
              {classConflict && <p className="mt-2 text-xs text-muted">{t('campus.events.attendanceNote')}</p>}
            </Callout>
          )}
          {going && !classConflict && conflicts.length === 0 && <Callout tone="success" title={t('campus.events.calendarEntry')}>{t('campus.events.noConflict')}</Callout>}
          {e.description_en && <Card><SectionTitle>{t('campus.events.description')}</SectionTitle><p className="whitespace-pre-line text-sm leading-relaxed">{e.description_en}</p></Card>}
          {e.kind === 'external' && (
            <Card>
              <SectionTitle>{t('campus.events.evidence')}</SectionTitle>
              <KeyValue items={[
                { k: t('campus.events.organizer'), v: e.organizer },
                { k: t('campus.events.source'), v: e.source_url ? <a className="inline-flex items-center gap-1 text-brand-600 hover:underline" href={e.source_url} target="_blank" rel="noreferrer noopener">{e.source_url}<ExternalLink className="h-3 w-3" /></a> : <span className="text-muted">{t('common.none')}</span> },
                { k: t('campus.events.deadline'), v: e.deadline ? fmtDate(e.deadline, locale) : '—' },
                { k: t('campus.events.eligibility'), v: e.eligibility ?? '—' },
                { k: t('campus.events.evidence'), v: <span className="text-muted">{e.evidence_note}</span> }
              ]} />
            </Card>
          )}
          {canVerify && (
            <Card>
              <SectionTitle>{t('campus.events.participants')}</SectionTitle>
              {participants.data && participants.data.length === 0 && <div className="text-sm text-muted">{t('common.empty')}</div>}
              <ul className="divide-y divide-line">
                {participants.data?.map((p) => (
                  <li key={p.id} className="flex items-center gap-3 py-2 text-sm">
                    <Avatar name={p.name_en} color={p.avatar_color} size={28} />
                    <span className="min-w-0 flex-1 truncate">{l(p.name_en, p.name_ar)}</span>
                    <StatusPill status={p.status} />
                    {p.achievement_id ? <Badge tone="success"><ShieldCheck className="h-3 w-3" />{t('campus.events.verified')}</Badge> : <Button size="sm" variant="outline" disabled={p.status !== 'going'} onClick={() => void verify(p.user_id)}>{t('campus.events.verify')}</Button>}
                  </li>
                ))}
              </ul>
            </Card>
          )}
        </div>
        <div className="space-y-4">
          <Card>
            <KeyValue items={[
              { k: t('campus.events.when'), v: <span className="num">{fmtRange(e.start_at, e.end_at, locale)}</span> },
              { k: t('campus.events.where'), v: e.location ? <span>{l(e.location.name_en, e.location.name_ar)}{e.location.building_name_en && <span className="block text-xs text-muted">{l(e.location.building_name_en, e.location.building_name_ar)}</span>}</span> : (e.venue_text ?? '—') },
              ...(e.kind !== 'personal' ? [{ k: t('campus.events.capacity'), v: <span className="flex items-center gap-1.5"><Users className="h-3.5 w-3.5" />{e.going_count} {t('campus.events.going')}{e.capacity !== null ? ` / ${e.capacity}` : ` · ${t('campus.events.unlimited')}`}{e.waitlist_count > 0 && <Badge tone="warn">{e.waitlist_count} {t('campus.events.waitlist')}</Badge>}</span> }] : []),
              { k: t('campus.events.organizer'), v: e.organizer || '—' }
            ]} />
            {e.map_link && <Button className="mt-4 w-full" variant="secondary" icon={<Route className="h-4 w-4" />} onClick={() => nav(e.map_link!)}>{t('campus.events.route')}</Button>}
            {e.location && <Link to={`/campus/map?to=${e.location.id}`} className="mt-2 flex items-center gap-1 text-xs text-muted hover:text-fg"><MapPin className="h-3 w-3" />{t('common.showOnMap')}</Link>}
          </Card>
          {mine && <Card className="text-xs text-muted">{t('campus.events.calendarEntry')}: <Link to="/calendar" className="text-brand-600 hover:underline">{fmtDateTime(e.start_at, locale)}</Link></Card>}
        </div>
      </div>
      <ConfirmDialog open={cancelOpen} onClose={() => setCancelOpen(false)} onConfirm={cancel} title={t('campus.events.cancelRsvp')} body={t('campus.events.rsvpCancelled')} loading={busy} />
    </div>
  );
}
