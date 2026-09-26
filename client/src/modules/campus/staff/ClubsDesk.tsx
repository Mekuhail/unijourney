import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router';
import { Users, Plus, Pencil, CalendarDays } from 'lucide-react';
import { useI18n } from '@/i18n';
import { useQuery } from '@/lib/useQuery';
import { api, errorMessage } from '@/lib/api';
import { refreshAll } from '@/lib/bus';
import { useToast } from '@/components/ui/toast';
import { PageHeader } from '@/components/ui/PageHeader';
import { Avatar, Badge, Button, Callout, Card, EmptyState, ErrorState, Field, Input, Modal, SectionTitle, Select, Skeleton, StatusPill, Tabs, Textarea } from '@/components/ui';
import { fmtDateTime } from '@/lib/format';
import type { Club, ClubDetail, ClubMember, EventItem, MapLocation } from '../types';
import { fmtRange } from '../lib';

function EventEditor({ club, event, open, onClose }: { club: Club; event: EventItem | null; open: boolean; onClose: () => void }) {
  const { t, l } = useI18n();
  const toast = useToast();
  const locs = useQuery(() => api<MapLocation[]>('/campus/map/locations', { query: { campus: club.campus_id } }), [club.campus_id]);
  const blank = { title_en: '', title_ar: '', description_en: '', date: '2026-10-05', start: '16:00', end: '18:00', location_id: '', venue_text: '', capacity: '30', track: '' };
  const [form, setForm] = useState(blank);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    if (event) setForm({ title_en: event.title_en, title_ar: event.title_ar, description_en: event.description_en, date: event.start_at.slice(0, 10), start: event.start_at.slice(11, 16), end: event.end_at.slice(11, 16), location_id: event.location_id ?? '', venue_text: event.venue_text ?? '', capacity: event.capacity?.toString() ?? '', track: event.tags.find((x) => x.startsWith('track:'))?.slice(6) ?? '' });
    else setForm(blank);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [event, open]);
  const submit = async () => {
    setBusy(true); setError(null);
    const body = { title_en: form.title_en, title_ar: form.title_ar || undefined, description_en: form.description_en, start_at: `${form.date}T${form.start}:00+03:00`, end_at: `${form.date}T${form.end}:00+03:00`, location_id: form.location_id || null, venue_text: form.venue_text || null, capacity: form.capacity ? Number(form.capacity) : null, track: form.track || undefined };
    try {
      if (event) await api(`/campus/events/${event.id}`, { method: 'PUT', body });
      else await api(`/campus/clubs/${club.id}/events`, { body });
      toast.success(t('campus.events.saved')); refreshAll('campus', 'calendar'); onClose();
    } catch (e) { setError(errorMessage(e)); } finally { setBusy(false); }
  };
  return (
    <Modal open={open} onClose={onClose} title={event ? t('campus.events.edit') : t('campus.events.new')} description={l(club.name_en, club.name_ar)} footer={<><Button variant="ghost" onClick={onClose}>{t('common.cancel')}</Button><Button loading={busy} disabled={form.title_en.length < 3} onClick={() => void submit()}>{t('common.save')}</Button></>}>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <Field label={`${t('campus.events.title_field')} (EN)`} required className="sm:col-span-2"><Input value={form.title_en} onChange={(e) => setForm({ ...form, title_en: e.target.value })} /></Field>
        <Field label={`${t('campus.events.title_field')} (AR)`} className="sm:col-span-2"><Input dir="rtl" value={form.title_ar} onChange={(e) => setForm({ ...form, title_ar: e.target.value })} /></Field>
        <Field label={t('common.date')} required><Input type="date" value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} /></Field>
        <div className="grid grid-cols-2 gap-2"><Field label={t('campus.events.startsAt')}><Input type="time" value={form.start} onChange={(e) => setForm({ ...form, start: e.target.value })} /></Field><Field label={t('campus.events.endsAt')}><Input type="time" value={form.end} onChange={(e) => setForm({ ...form, end: e.target.value })} /></Field></div>
        <Field label={t('campus.events.location')}><Select value={form.location_id} onChange={(e) => setForm({ ...form, location_id: e.target.value })}><option value="">—</option>{locs.data?.map((x) => <option key={x.id} value={x.id}>{x.building_name_en ? `${l(x.name_en, x.name_ar)} — ${l(x.building_name_en, x.building_name_ar)}` : l(x.name_en, x.name_ar)}</option>)}</Select></Field>
        <Field label={t('campus.events.venueText')}><Input value={form.venue_text} onChange={(e) => setForm({ ...form, venue_text: e.target.value })} /></Field>
        <Field label={t('campus.events.capacity')}><Input type="number" min={1} value={form.capacity} onChange={(e) => setForm({ ...form, capacity: e.target.value })} /></Field>
        <Field label={t('campus.events.track')}><Input value={form.track} onChange={(e) => setForm({ ...form, track: e.target.value })} placeholder="Web Development" list="tracks" /><datalist id="tracks">{club.tracks.map((x) => <option key={x} value={x} />)}</datalist></Field>
        <Field label={t('campus.events.description')} className="sm:col-span-2"><Textarea value={form.description_en} onChange={(e) => setForm({ ...form, description_en: e.target.value })} /></Field>
        {error && <div className="sm:col-span-2"><Callout tone="danger">{error}</Callout></div>}
      </div>
    </Modal>
  );
}

function RequestRow({ club, m }: { club: Club; m: ClubMember }) {
  const { t, l, locale } = useI18n();
  const toast = useToast();
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState<'active' | 'rejected' | null>(null);
  const decide = async (decision: 'active' | 'rejected') => {
    setBusy(decision);
    try { await api(`/campus/clubs/${club.id}/requests/${m.id}/decide`, { body: { decision, note: note || undefined } }); toast.success(decision === 'active' ? t('campus.staff.clubs.approved') : t('campus.staff.clubs.declined')); refreshAll('campus'); }
    catch (e) { toast.error(errorMessage(e)); } finally { setBusy(null); }
  };
  return (
    <li className="card p-4">
      <div className="flex items-center gap-3">
        <Avatar name={m.name_en} color={m.avatar_color} />
        <div className="min-w-0 flex-1"><div className="font-semibold">{l(m.name_en, m.name_ar)}</div><div className="text-xs text-muted">{[m.program_id?.toUpperCase(), `L${m.level}`, m.student_no ? `#${m.student_no}` : null, fmtDateTime(m.requested_at, locale)].filter(Boolean).join(' · ')}</div></div>
        <StatusPill status={m.status} />
      </div>
      {m.answer && <p dir="auto" className="mt-3 rounded-xl bg-surface-2 p-3 text-sm"><span className="block text-xs font-semibold text-muted">{t('campus.clubs.joinAnswerLabel')}</span>{m.answer}</p>}
      <div className="mt-3 flex flex-col gap-2 sm:flex-row sm:items-end">
        <Field label={t('campus.staff.clubs.decisionNote')} className="flex-1"><Input value={note} onChange={(e) => setNote(e.target.value)} /></Field>
        <div className="flex gap-2"><Button variant="success" loading={busy === 'active'} onClick={() => void decide('active')}>{t('campus.clubs.approve')}</Button><Button variant="outline" loading={busy === 'rejected'} onClick={() => void decide('rejected')}>{t('campus.clubs.reject')}</Button></div>
      </div>
    </li>
  );
}

export function ClubsDesk() {
  const { t, l, locale } = useI18n();
  const [params, setParams] = useSearchParams();
  const clubs = useQuery(() => api<Club[]>('/campus/clubs'), [], { refreshOn: ['campus'] });
  const mine = (clubs.data ?? []).filter((c) => c.is_lead);
  const clubId = params.get('club') ?? mine[0]?.id ?? null;
  const detail = useQuery(() => api<ClubDetail>(`/campus/clubs/${clubId}`), [clubId], { enabled: !!clubId, refreshOn: ['campus', 'calendar'] });
  const requests = useQuery(() => api<ClubMember[]>(`/campus/clubs/${clubId}/requests`), [clubId], { enabled: !!clubId, refreshOn: ['campus'] });
  const [editor, setEditor] = useState<{ open: boolean; event: EventItem | null }>({ open: false, event: null });
  useEffect(() => {
    const evId = params.get('event');
    if (evId && detail.data) { const ev = detail.data.events.find((e) => e.id === evId); if (ev) setEditor({ open: true, event: ev }); const p = new URLSearchParams(params); p.delete('event'); setParams(p, { replace: true }); }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [detail.data]);
  const club = detail.data;
  return (
    <div>
      <PageHeader crumbs={[{ to: '/staff', label: t('nav.staff') }]} title={t('campus.staff.clubs.title')} subtitle={t('campus.staff.clubs.subtitle')} actions={mine.length > 1 && <Tabs value={clubId ?? ''} onChange={(v) => setParams({ club: v })} items={mine.map((c) => ({ value: c.id, label: l(c.name_en, c.name_ar), count: c.pending_count }))} />} />
      {clubs.loading && <Skeleton className="h-40" />}
      {clubs.error ? <ErrorState error={clubs.error} onRetry={() => void clubs.refetch()} /> : null}
      {clubs.data && mine.length === 0 && <EmptyState icon={<Users className="h-6 w-6" />} title={t('campus.staff.clubs.noClubs')} />}
      {club && (
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
          <section>
            <SectionTitle action={<Badge tone="warn">{requests.data?.length ?? 0}</Badge>}>{t('campus.clubs.requests')} · {l(club.name_en, club.name_ar)}</SectionTitle>
            {requests.loading && <Skeleton className="h-24" />}
            {requests.error ? <ErrorState error={requests.error} onRetry={() => void requests.refetch()} /> : null}
            {requests.data && requests.data.length === 0 && <EmptyState title={t('campus.staff.clubs.noRequests')} />}
            <ul className="space-y-2">{requests.data?.map((m) => <RequestRow key={m.id} club={club} m={m} />)}</ul>
            <Card className="mt-4">
              <SectionTitle>{t('campus.clubs.roster')}</SectionTitle>
              <ul className="divide-y divide-line text-sm">{club.members.filter((m) => m.status !== 'pending').map((m) => <li key={m.id} className="flex items-center gap-2 py-1.5"><Avatar name={m.name_en} color={m.avatar_color} size={24} /><span className="flex-1 truncate">{l(m.name_en, m.name_ar)}</span><StatusPill status={m.status} /></li>)}</ul>
            </Card>
          </section>
          <section>
            <SectionTitle action={<Button size="sm" icon={<Plus className="h-4 w-4" />} onClick={() => setEditor({ open: true, event: null })}>{t('campus.events.new')}</Button>}>{t('campus.staff.clubs.eventsEditor')}</SectionTitle>
            {club.events.length === 0 && <EmptyState icon={<CalendarDays className="h-6 w-6" />} title={t('common.empty')} />}
            <ul className="space-y-2">
              {club.events.map((e) => (
                <li key={e.id} className="card flex flex-wrap items-center gap-3 p-3">
                  <span className="min-w-0 flex-1"><Link to={`/campus/events/${e.id}`} className="block truncate font-semibold hover:text-brand-600">{l(e.title_en, e.title_ar)}</Link><span className="num block text-xs text-muted">{fmtRange(e.start_at, e.end_at, locale)} · {e.location ? l(e.location.name_en, e.location.name_ar) : e.venue_text} · {e.going_count}{e.capacity !== null ? `/${e.capacity}` : ''}</span></span>
                  {!e.upcoming && <Badge tone="neutral">{t('campus.clubs.pastEvents')}</Badge>}
                  <Button size="sm" variant="outline" icon={<Pencil className="h-3.5 w-3.5" />} onClick={() => setEditor({ open: true, event: e })}>{t('common.edit')}</Button>
                </li>
              ))}
            </ul>
          </section>
          <EventEditor club={club} event={editor.event} open={editor.open} onClose={() => setEditor({ open: false, event: null })} />
        </div>
      )}
    </div>
  );
}
