import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router';
import clsx from 'clsx';
import { Search, MessageCircle, Pencil, MoreHorizontal, Ban, ShieldCheck, Lock, Users } from 'lucide-react';
import { useI18n } from '@/i18n';
import { api, errorMessage } from '@/lib/api';
import { refreshAll } from '@/lib/bus';
import { useQuery } from '@/lib/useQuery';
import { useSession } from '@/lib/session';
import { useToast } from '@/components/ui/toast';
import { Menu, MenuItem } from '@/components/ui/Menu';
import { Avatar, Badge, Button, Card, ConfirmDialog, EmptyState, ErrorState, Field, Input, Select, Skeleton, Textarea, Toggle } from '@/components/ui';
import type { MyProfile, PersonListItem, PublicProfile } from '../types';
import { PostCard } from '../community';
import { CommunityShell } from './shared';

// ------------------------------------------------------------------ directory
export function PeoplePage() {
  const { t, l } = useI18n();
  const [q, setQ] = useState('');
  const [debounced, setDebounced] = useState('');
  useEffect(() => { const id = window.setTimeout(() => setDebounced(q.trim()), 250); return () => window.clearTimeout(id); }, [q]);
  const people = useQuery(() => api<{ items: PersonListItem[]; total: number }>('/campus/community/people', { query: { q: debounced } }), [debounced], { refreshOn: ['community'] });
  return (
    <CommunityShell doc={t('social.people.title')}>
      <h2 className="font-display text-2xl">{t('social.people.title')}</h2>
      <p className="mb-4 max-w-2xl text-sm text-muted">{t('social.people.body')}</p>
      <div className="relative mb-5 max-w-xl">
        <Search className="pointer-events-none absolute start-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" aria-hidden />
        <label htmlFor="people-search" className="sr-only">{t('social.people.search')}</label>
        <Input id="people-search" type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder={t('social.people.search')} className="ps-9" />
      </div>
      {people.loading && !people.data && <Skeleton className="h-72" />}
      {people.error ? <ErrorState error={people.error} onRetry={() => void people.refetch()} /> : null}
      {people.data && people.data.items.length === 0 && <EmptyState icon={<Users className="h-6 w-6" />} title={t('social.people.empty')} />}
      {people.data && people.data.items.length > 0 && <p className="mb-2 text-xs text-muted" aria-live="polite">{t('social.people.count', { n: people.data.total })}</p>}
      <ul className="card divide-y divide-line">
        {people.data?.items.map((p) => (
          <li key={p.id}>
            <Link to={`/campus/community/people/${p.id}`} className="flex min-w-0 items-start gap-3 p-4 transition hover:bg-line/30">
              <Avatar name={p.name_en} color={p.avatar_color} size={44} />
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2"><span className="font-semibold">{l(p.name_en, p.name_ar)}</span>{p.is_me && <Badge tone="neutral">{t('social.people.you')}</Badge>}{p.shared_clubs && !p.is_me && <Badge tone="brand">{t('social.people.sharedClub')}</Badge>}</div>
                <div className="text-xs text-muted">{[p.program_id?.toUpperCase(), p.campus_id ? t(`shell.${p.campus_id}`) : null].filter(Boolean).join(' · ')}</div>
                {p.bio && <p dir="auto" className="mt-1 line-clamp-2 text-sm">{p.bio}</p>}
                {p.interests.length > 0 && <div className="mt-2 flex flex-wrap gap-1">{p.interests.slice(0, 4).map((i) => <Badge key={i.key} tone="neutral">{l(i.en, i.ar)}</Badge>)}</div>}
              </div>
            </Link>
          </li>
        ))}
      </ul>
    </CommunityShell>
  );
}

// ------------------------------------------------------------------ profile
export function ProfilePage({ meId }: { meId?: string }) {
  const params = useParams();
  const id = meId ?? params.id!;
  const { t, l } = useI18n();
  const toast = useToast();
  const nav = useNavigate();
  const q = useQuery(() => api<PublicProfile>(`/campus/community/people/${id}`), [id], { refreshOn: ['community'] });
  const [busy, setBusy] = useState(false);
  const [confirmBlock, setConfirmBlock] = useState(false);
  const p = q.data;
  const message = async () => {
    if (!p) return;
    setBusy(true);
    try { const r = await api<{ id: string }>('/campus/community/messages/start', { method: 'POST', body: { user_id: p.id } }); refreshAll('messages'); nav(`/campus/community/messages/${r.id}`); }
    catch (e) { toast.error(errorMessage(e)); } finally { setBusy(false); }
  };
  const block = async (on: boolean) => {
    if (!p) return;
    setBusy(true);
    try {
      if (on) await api('/campus/community/blocks', { method: 'POST', body: { user_id: p.id } });
      else await api(`/campus/community/blocks/${p.id}`, { method: 'DELETE' });
      toast.info(t(on ? 'social.profile.blocked' : 'social.profile.unblocked'));
      setConfirmBlock(false);
      refreshAll('community', 'messages');
      void q.refetch();
    } catch (e) { toast.error(errorMessage(e)); } finally { setBusy(false); }
  };
  const name = p ? l(p.name_en, p.name_ar) : '';
  return (
    <CommunityShell doc={name || t('social.nav.people')}>
      {q.loading && !p && <div className="space-y-4"><Skeleton className="h-40" /><Skeleton className="h-64" /></div>}
      {q.error ? <ErrorState error={q.error} onRetry={() => void q.refetch()} /> : null}
      {p && (
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1fr)_320px]">
          <div className="min-w-0 space-y-6">
            <section aria-labelledby="profile-name" className="card p-5">
              <div className="flex flex-wrap items-start gap-4">
                <Avatar name={p.name_en} color={p.avatar_color} size={72} />
                <div className="min-w-0 flex-1">
                  <h2 id="profile-name" className="font-display text-2xl leading-tight sm:text-3xl">{name}</h2>
                  <p className="mt-1 text-sm text-muted">{[p.program ? `${p.program.code} · ${l(p.program.name_en, p.program.name_ar)}` : null, p.level ? t('social.profile.level', { n: p.level }) : null, p.campus_id ? t(`shell.${p.campus_id}`) : null].filter(Boolean).join(' · ')}</p>
                  {p.synthetic && <Badge tone="neutral" className="mt-2">{t('social.profile.demo')}</Badge>}
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  {p.is_me ? <Button variant="outline" icon={<Pencil className="h-4 w-4" aria-hidden />} onClick={() => nav('/campus/community/me/edit')}>{t('social.profile.edit')}</Button> : p.conversation_id ? (
                    <Button icon={<MessageCircle className="h-4 w-4" aria-hidden />} onClick={() => nav(`/campus/community/messages/${p.conversation_id}`)}>{t('social.profile.openChat')}</Button>
                  ) : p.can_message ? (
                    <Button loading={busy} icon={<MessageCircle className="h-4 w-4" aria-hidden />} onClick={() => void message()}>{t('social.profile.message')}</Button>
                  ) : p.message_reason && p.message_reason !== 'self' ? <span className="inline-flex items-center gap-1.5 text-sm text-muted"><Lock className="h-4 w-4" aria-hidden />{t(`social.reason.${p.message_reason}`)}</span> : null}
                  {!p.is_me && (
                    <Menu label={t('social.profile.options')} button={<MoreHorizontal className="h-4 w-4" aria-hidden />} buttonClassName="grid h-11 w-11 place-items-center rounded-full text-muted hover:bg-line/60 hover:text-fg">
                      {p.blocked_by_me ? <MenuItem icon={<ShieldCheck className="h-4 w-4" />} onSelect={() => void block(false)}>{t('social.profile.unblock')}</MenuItem>
                        : <MenuItem icon={<Ban className="h-4 w-4" />} onSelect={() => setConfirmBlock(true)}>{t('social.profile.block')}</MenuItem>}
                    </Menu>
                  )}
                </div>
              </div>
              {p.bio && <p dir="auto" className="mt-4 max-w-[65ch] leading-relaxed">{p.bio}</p>}
              {p.interests.length > 0 && (
                <div className="mt-4">
                  <h3 className="mb-1.5 text-xs font-semibold text-muted">{t('social.profile.interests')}</h3>
                  <div className="flex flex-wrap gap-1">{p.interests.map((i) => <Badge key={i.key} tone="neutral">{l(i.en, i.ar)}</Badge>)}</div>
                </div>
              )}
              {p.is_me && <p className="mt-4 flex items-center gap-2 text-xs text-muted"><Lock className="h-3.5 w-3.5" aria-hidden />{t('social.profile.privateNote')}</p>}
            </section>
            <section aria-labelledby="profile-posts">
              <h2 id="profile-posts" className="mb-3 font-display text-xl">{t('social.profile.posts')}</h2>
              {p.posts.length === 0 && <p className="text-sm text-muted">{t('social.profile.noPosts')}</p>}
              <div className="space-y-4">{p.posts.map((post) => <PostCard key={`${post.type}-${post.id}`} post={post} showClub onRemoved={() => void q.refetch()} />)}</div>
            </section>
          </div>
          <aside className="min-w-0">
            <Card>
              <h2 className="mb-3 font-display text-lg">{t('social.profile.clubs')}</h2>
              {p.clubs === null ? <p className="text-sm text-muted">{t('social.profile.clubsHidden')}</p> : p.clubs.length === 0 ? <p className="text-sm text-muted">{t('common.empty')}</p> : (
                <ul className="space-y-1">
                  {p.clubs.map((c) => (
                    <li key={c.id}>
                      <Link to={`/campus/clubs/${c.id}`} className="flex min-h-11 items-center gap-2.5 rounded-xl px-2 hover:bg-line/40">
                        <span aria-hidden className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: c.color }} />
                        <span className="min-w-0 flex-1"><span className="block truncate text-sm font-medium">{l(c.name_en, c.name_ar)}</span>{c.role !== 'member' && <span className="block truncate text-xs text-muted">{c.title_en ? l(c.title_en, c.title_ar ?? c.title_en) : t(`campus.clubs.role.${c.role}`)}</span>}</span>
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
            </Card>
          </aside>
          <ConfirmDialog open={confirmBlock} onClose={() => setConfirmBlock(false)} onConfirm={() => void block(true)} title={t('social.profile.blockTitle', { name })} body={t('social.profile.blockBody')} danger loading={busy} />
        </div>
      )}
    </CommunityShell>
  );
}

export function MyProfilePage() {
  const { user } = useSession();
  if (!user) return null;
  return <ProfilePage meId={user.id} />;
}

// ------------------------------------------------------------------ edit
const COLORS = ['#F0762B', '#C8975B', '#2E9E6B', '#2F6FDB', '#7C5CFF', '#0EA5E9', '#14B8A6', '#E11D48', '#BE185D', '#4F46E5', '#334155', '#7C2D12'];

export function ProfileEditPage() {
  const { t, l } = useI18n();
  const toast = useToast();
  const nav = useNavigate();
  const q = useQuery(() => api<MyProfile>('/campus/community/profile/me'), []);
  const [form, setForm] = useState<MyProfile | null>(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => { if (q.data) setForm(q.data); }, [q.data]);
  const set = <K extends keyof MyProfile>(k: K, v: MyProfile[K]) => setForm((f) => (f ? { ...f, [k]: v } : f));
  const toggleInterest = (key: string) => form && set('interests', form.interests.includes(key) ? form.interests.filter((i) => i !== key) : form.interests.length < 8 ? [...form.interests, key] : form.interests);
  const save = async () => {
    if (!form) return;
    setBusy(true);
    try {
      await api('/campus/community/profile/me', { method: 'PUT', body: { display_name: form.display_name?.trim() || null, bio: form.bio.trim(), avatar_color: form.avatar_color, interests: form.interests, show_program: form.show_program, show_campus: form.show_campus, show_clubs: form.show_clubs, dm_policy: form.dm_policy } });
      toast.success(t('social.edit.saved'));
      refreshAll('community', 'campus');
      nav('/campus/community/me');
    } catch (e) { toast.error(errorMessage(e)); } finally { setBusy(false); }
  };
  return (
    <CommunityShell doc={t('social.edit.title')}>
      {q.error ? <ErrorState error={q.error} onRetry={() => void q.refetch()} /> : null}
      {!form ? <Skeleton className="h-96" /> : (
        <form className="max-w-2xl space-y-6" onSubmit={(e) => { e.preventDefault(); void save(); }}>
          <div className="flex items-center gap-4">
            <Avatar name={form.display_name || form.record_name_en} color={form.avatar_color} size={64} />
            <div><h2 className="font-display text-2xl">{t('social.edit.title')}</h2><p className="text-sm text-muted">{t('social.edit.subtitle')}</p></div>
          </div>
          <Card className="space-y-4">
            <Field label={t('social.edit.displayName')} hint={t('social.edit.displayNameHint', { name: l(form.record_name_en, form.record_name_ar) })}><Input value={form.display_name ?? ''} maxLength={40} onChange={(e) => set('display_name', e.target.value)} /></Field>
            <Field label={t('social.edit.bio')} hint={t('social.edit.bioHint', { n: form.bio.length })}><Textarea rows={3} maxLength={280} value={form.bio} onChange={(e) => set('bio', e.target.value)} /></Field>
            <fieldset>
              <legend className="mb-2 text-sm font-medium">{t('social.edit.color')}</legend>
              <div className="flex flex-wrap gap-2">
                {COLORS.map((c, i) => (
                  <label key={c} className={clsx('grid h-11 w-11 cursor-pointer place-items-center rounded-full border-2 focus-within:ring-2 focus-within:ring-brand-500', form.avatar_color === c ? 'border-fg' : 'border-transparent')}>
                    <input type="radio" name="avatar-color" className="sr-only" checked={form.avatar_color === c} onChange={() => set('avatar_color', c)} aria-label={t('social.edit.colorOption', { n: i + 1 })} />
                    <span aria-hidden className="h-8 w-8 rounded-full" style={{ background: c }} />
                  </label>
                ))}
              </div>
            </fieldset>
            <fieldset>
              <legend className="text-sm font-medium">{t('social.edit.interests')}</legend>
              <p className="mb-2 text-xs text-muted">{t('social.edit.interestsHint')}</p>
              <div className="flex flex-wrap gap-2">
                {[...form.suggested_interests, ...form.interests.filter((k) => !form.suggested_interests.some((s) => s.key === k)).map((k) => ({ key: k, en: k, ar: k }))].map((i) => {
                  const on = form.interests.includes(i.key);
                  return <button key={i.key} type="button" aria-pressed={on} onClick={() => toggleInterest(i.key)} className={clsx('inline-flex min-h-11 items-center rounded-full border px-3.5 text-sm transition sm:min-h-9', on ? 'border-brand-500 bg-brand-500 text-ink-950' : 'border-line hover:border-brand-400')}>{l(i.en, i.ar)}</button>;
                })}
              </div>
            </fieldset>
          </Card>
          <Card className="space-y-4">
            <h3 className="font-semibold">{t('social.edit.privacy')}</h3>
            <Toggle checked={form.show_program} onChange={(v) => set('show_program', v)} label={t('social.edit.showProgram')} />
            <Toggle checked={form.show_campus} onChange={(v) => set('show_campus', v)} label={t('social.edit.showCampus')} />
            <Toggle checked={form.show_clubs} onChange={(v) => set('show_clubs', v)} label={t('social.edit.showClubs')} />
            <p className="flex items-center gap-2 text-xs text-muted"><Lock className="h-3.5 w-3.5" aria-hidden />{t('social.edit.private')}</p>
            <Field label={t('social.edit.dm')}>
              <Select value={form.dm_policy} onChange={(e) => set('dm_policy', e.target.value as MyProfile['dm_policy'])}>
                {(['everyone', 'club_mates', 'nobody'] as const).map((v) => <option key={v} value={v}>{t(`social.dm.${v}`)}</option>)}
              </Select>
            </Field>
          </Card>
          <div className="flex gap-2"><Button type="submit" loading={busy}>{t('social.edit.save')}</Button><Button type="button" variant="ghost" onClick={() => nav('/campus/community/me')}>{t('common.cancel')}</Button></div>
        </form>
      )}
    </CommunityShell>
  );
}
