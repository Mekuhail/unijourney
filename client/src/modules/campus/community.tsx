import { useEffect, useState, type ReactNode } from 'react';
import { Link } from 'react-router';
import clsx from 'clsx';
import { QRCodeSVG } from 'qrcode.react';
import { MapPin, Megaphone, MessageCircle, HelpCircle, BarChart3, Pin, PinOff, ThumbsUp, MoreHorizontal, Flag, Trash2, Pencil, CheckCircle2, CalendarDays, EyeOff, Plus, X, QrCode, ShieldCheck, Lock, ExternalLink, ImagePlus } from 'lucide-react';
import { useI18n } from '@/i18n';
import { api, apiUpload, errorMessage } from '@/lib/api';
import { refreshAll } from '@/lib/bus';
import { useQuery } from '@/lib/useQuery';
import { fmtDate, fmtRelative, fmtTime } from '@/lib/format';
import { useToast } from '@/components/ui/toast';
import { Menu, MenuItem, MenuSeparator } from '@/components/ui/Menu';
import { Avatar, Badge, Button, Callout, ConfirmDialog, EmptyState, ErrorState, Field, Input, Modal, Select, Skeleton, Textarea, Toggle } from '@/components/ui';
import { useDemoStatus } from '@/shell/DemoClock';
import type { CheckinState, ClubReport, EventItem, FeedPost, Post, PostAuthor, PostImage, PostKind, PostList } from './types';
import type { DocumentMeta } from '@shared/types';

const KIND_ICON: Record<PostKind, typeof Megaphone> = { announcement: Megaphone, discussion: MessageCircle, question: HelpCircle, poll: BarChart3 };
const KIND_TONE: Record<PostKind, 'brand' | 'neutral' | 'info' | 'gold'> = { announcement: 'brand', discussion: 'neutral', question: 'info', poll: 'gold' };

/** Club posts live under their club; student posts under the community. Both expose the same verbs. */
export function postBase(post: Post | FeedPost) {
  return 'type' in post && post.type === 'social' ? `/campus/community/posts/${post.id}` : `/campus/clubs/${post.club_id}/posts/${post.id}`;
}

function useNow() {
  const { data } = useDemoStatus();
  return data?.clock ?? new Date().toISOString();
}

/** Officer titles as a quiet chip next to the name: "President", "Web track lead". */
export function RoleChip({ author }: { author: Pick<PostAuthor, 'role' | 'title_en' | 'title_ar'> | null }) {
  const { t, l } = useI18n();
  if (!author || !author.role || author.role === 'member') return null;
  const label = author.title_en ? l(author.title_en, author.title_ar ?? author.title_en) : t(`campus.clubs.role.${author.role}`);
  return <Badge tone={author.role === 'lead' ? 'gold' : 'brand'} className="shrink-0"><ShieldCheck className="h-3 w-3" aria-hidden />{label}</Badge>;
}

// ------------------------------------------------------------------ post card
function Poll({ post, onChange }: { post: Post; onChange: (p: Post) => void }) {
  const { t } = useI18n();
  const toast = useToast();
  const [busy, setBusy] = useState<string | null>(null);
  const poll = post.poll!;
  const revealed = poll.options.some((o) => o.votes !== null);
  const vote = async (id: string) => {
    setBusy(id);
    try { onChange(await api<Post>(`/campus/clubs/${post.club_id}/posts/${post.id}/vote`, { method: 'POST', body: { option_id: id } })); }
    catch (e) { toast.error(errorMessage(e)); } finally { setBusy(null); }
  };
  return (
    <fieldset className="mt-3 space-y-2">
      <legend className="sr-only">{post.body}</legend>
      {poll.options.map((o) => {
        const pct = revealed && poll.total ? Math.round(((o.votes ?? 0) / poll.total) * 100) : 0;
        const mine = poll.my_vote === o.id;
        return (
          <button key={o.id} type="button" disabled={!post.can.vote || !!busy} aria-pressed={mine} onClick={() => void vote(o.id)} className={clsx('relative flex min-h-11 w-full items-center justify-between gap-3 overflow-hidden rounded-xl border px-3 text-start text-sm transition', mine ? 'border-brand-500' : 'border-line hover:border-brand-400', !post.can.vote && 'cursor-default hover:border-line')}>
            {revealed && <span aria-hidden className="absolute inset-y-0 start-0 bg-brand-500/15" style={{ width: `${pct}%` }} />}
            <span className="relative flex min-w-0 items-center gap-2"><bdi className="truncate">{o.label}</bdi>{mine && <Badge tone="brand">{t('community.yourVote')}</Badge>}</span>
            {revealed && <span className="num relative shrink-0 font-semibold">{pct}%</span>}
          </button>
        );
      })}
      <p className="text-xs text-muted">{t('community.pollVotes', { n: poll.total })}{!revealed && post.can.vote ? ` · ${t('community.pollVoteToSee')}` : ''}</p>
    </fieldset>
  );
}

function ReportDialog({ open, onClose, post, commentId }: { open: boolean; onClose: () => void; post: Post | FeedPost; commentId?: string }) {
  const { t } = useI18n();
  const toast = useToast();
  const [reason, setReason] = useState('spam');
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const send = async () => {
    setBusy(true);
    try {
      await api(`${postBase(post)}/report`, { method: 'POST', body: { reason, note: note.trim() || undefined, comment_id: commentId } });
      toast.success(t('community.reportSent'));
      onClose();
    } catch (e) { toast.error(errorMessage(e)); } finally { setBusy(false); }
  };
  return (
    <Modal open={open} onClose={onClose} title={t(commentId ? 'community.reportReplyTitle' : 'community.reportTitle')} description={t('community.reportBody')} footer={<><Button variant="ghost" onClick={onClose}>{t('common.cancel')}</Button><Button loading={busy} onClick={() => void send()}>{t('community.report')}</Button></>}>
      <fieldset className="space-y-1">
        <legend className="mb-2 text-sm font-medium">{t('community.mod.reason')}</legend>
        {(['spam', 'harassment', 'off_topic', 'personal_info', 'other'] as const).map((r) => (
          <label key={r} className="flex min-h-11 cursor-pointer items-center gap-3 rounded-xl px-2 text-sm hover:bg-line/40">
            <input type="radio" name="reason" value={r} checked={reason === r} onChange={() => setReason(r)} className="h-4 w-4 accent-brand-500" />
            {t(`community.reason.${r}`)}
          </label>
        ))}
      </fieldset>
      <Field label={t('community.reportNote')} className="mt-3"><Textarea rows={2} maxLength={300} value={note} onChange={(e) => setNote(e.target.value)} /></Field>
    </Modal>
  );
}

/** Club photos: reserved space from the stored size (no layout shift), alt text always, captions and credit when given. */
function Gallery({ images }: { images: PostImage[] }) {
  const { l } = useI18n();
  const [broken, setBroken] = useState<Set<string>>(new Set());
  const one = images.length === 1;
  return (
    <div className={clsx('mt-3 grid gap-1.5 overflow-hidden rounded-xl', one ? 'grid-cols-1' : 'grid-cols-2')}>
      {images.map((m, i) => (
        <figure key={m.id} className={clsx('min-w-0', images.length === 3 && i === 0 && 'col-span-2')}>
          <div className="overflow-hidden rounded-xl border border-line bg-surface-2" style={{ aspectRatio: one || (images.length === 3 && i === 0) ? `${m.width} / ${m.height}` : '1 / 1' }}>
            {broken.has(m.id)
              ? <div className="grid h-full place-items-center p-4 text-center text-sm text-muted" dir="auto">{l(m.alt_en, m.alt_ar)}</div>
              : <img src={m.url} alt={l(m.alt_en, m.alt_ar)} width={m.width} height={m.height} loading="lazy" decoding="async" onError={() => setBroken((b) => new Set(b).add(m.id))} className="h-full w-full object-cover" />}
          </div>
          {(m.caption_en || m.credit_en) && (
            <figcaption className="mt-1 text-xs text-muted" dir="auto">{m.caption_en ? l(m.caption_en, m.caption_ar) : ''}{m.caption_en && m.credit_en ? ' · ' : ''}{m.credit_en ? l(m.credit_en, m.credit_ar) : ''}</figcaption>
          )}
        </figure>
      ))}
    </div>
  );
}

export function PostCard({ post: initial, showClub, highlight, onRemoved }: { post: Post | FeedPost; showClub?: boolean; highlight?: boolean; onRemoved?: (id: string) => void }) {
  const { t, l, locale } = useI18n();
  const toast = useToast();
  const now = useNow();
  const [post, setPost] = useState<Post | FeedPost>(initial);
  const [open, setOpen] = useState(highlight || (initial.kind === 'question' && initial.comments.length > 0 && initial.comments.length <= 2));
  const [reply, setReply] = useState('');
  const [busy, setBusy] = useState(false);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(initial.body);
  const [confirm, setConfirm] = useState(false);
  const [report, setReport] = useState<{ comment?: string } | null>(null);
  useEffect(() => setPost(initial), [initial]);
  const base = postBase(post);
  const social = 'type' in post && post.type === 'social';
  const feed = 'type' in post ? (post as FeedPost) : null;
  const Icon = KIND_ICON[post.kind as PostKind] ?? MessageCircle;
  const own = post.can.edit || (!post.can.report && post.can.delete);

  const run = async (fn: () => Promise<Post | void>, ok?: string) => {
    setBusy(true);
    try { const p = await fn(); if (p) setPost((cur) => ({ ...cur, ...p })); if (ok) toast.success(ok); }
    catch (e) { toast.error(errorMessage(e)); } finally { setBusy(false); }
  };
  const react = () => run(async () => {
    const r = await api<{ reacted: boolean; count: number }>(`${base}/react`, { method: 'POST', body: {} });
    return { ...post, reacted: r.reacted, reactions: r.count };
  });
  const sendReply = () => run(async () => {
    const p = await api<Post>(`${base}/comments`, { method: 'POST', body: { body: reply.trim() } });
    setReply('');
    refreshAll('notifications');
    return p;
  });
  const pin = (pinned: boolean) => run(() => api<Post>(base, { method: 'PATCH', body: { pinned } }), t(pinned ? 'community.pinnedToast' : 'community.unpinnedToast')).then(() => refreshAll('community'));
  const save = () => run(async () => { const p = await api<Post>(base, { method: 'PATCH', body: { body: draft.trim() } }); setEditing(false); return p; });
  const remove = () => run(async () => {
    await api(base, { method: 'DELETE' });
    setConfirm(false);
    onRemoved?.(post.id);
    refreshAll('community');
  }, t('community.removed'));
  const accept = (commentId: string | null) => run(() => api<Post>(`${base}/answer`, { method: 'POST', body: { comment_id: commentId } }));
  const delComment = (id: string) => run(() => api<Post>(`${base}/comments/${id}`, { method: 'DELETE' }));

  return (
    <article id={`post-${post.id}`} aria-labelledby={`post-${post.id}-author`} className={clsx('card min-w-0 p-4', highlight && 'ring-2 ring-brand-500', post.hidden && 'border-dashed')}>
      <header className="flex items-start gap-3">
        <Avatar name={post.author?.name_en ?? '?'} color={post.author?.avatar_color} size={40} />
        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-2">
            <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
              {post.author ? <Link id={`post-${post.id}-author`} to={`/campus/community/people/${post.author.id}`} className="font-semibold hover:underline">{l(post.author.name_en, post.author.name_ar)}</Link> : <span id={`post-${post.id}-author`} className="font-semibold">—</span>}
              <RoleChip author={post.author} />
            </div>
            <div className="-me-2 -mt-1 shrink-0">
            {(post.can.edit || post.can.pin || post.can.delete || post.can.report) && (
              <Menu label={t('common.more')} button={<MoreHorizontal className="h-4 w-4" aria-hidden />} buttonClassName="grid h-11 w-11 place-items-center rounded-full text-muted hover:bg-line/60 hover:text-fg sm:h-9 sm:w-9">
                {post.can.edit && <MenuItem icon={<Pencil className="h-4 w-4" />} onSelect={() => { setDraft(post.body); setEditing(true); }}>{t('community.edit')}</MenuItem>}
                {post.can.pin && <MenuItem icon={post.pinned ? <PinOff className="h-4 w-4" /> : <Pin className="h-4 w-4" />} onSelect={() => void pin(!post.pinned)}>{t(post.pinned ? 'community.unpin' : 'community.pin')}</MenuItem>}
                {post.can.report && <MenuItem icon={<Flag className="h-4 w-4" />} onSelect={() => setReport({})}>{t('community.report')}</MenuItem>}
                {post.can.delete && <><MenuSeparator /><MenuItem icon={<Trash2 className="h-4 w-4" />} onSelect={() => setConfirm(true)}>{t(own ? 'community.delete' : 'community.remove')}</MenuItem></>}
              </Menu>
            )}
            </div>
          </div>
          <div className="mt-0.5 flex flex-wrap items-center gap-x-1.5 text-xs text-muted">
            {(showClub || social) && post.club && <><Link to={social ? `/campus/clubs/${post.club.id}` : `/campus/clubs/${post.club.id}?post=${post.id}`} className="inline-flex items-center gap-1.5 font-medium text-fg hover:underline"><span aria-hidden className="h-2 w-2 rounded-full" style={{ background: post.club.color }} />{l(post.club.name_en, post.club.name_ar)}</Link><span aria-hidden>·</span></>}
            <time dateTime={post.created_at} title={`${fmtDate(post.created_at, locale)} ${fmtTime(post.created_at, locale)}`}>{fmtRelative(post.created_at, now, locale)}</time>
            {post.edited_at && <><span aria-hidden>·</span><span>{t('community.edited')}</span></>}
          </div>
          <div className="mt-1.5 flex flex-wrap gap-1.5 empty:hidden">
            {post.pinned && <Badge tone="gold"><Pin className="h-3 w-3" aria-hidden />{t('community.pinned')}</Badge>}
            {social ? (feed?.audience === 'campus' && <Badge tone="neutral"><MapPin className="h-3 w-3" aria-hidden />{t('social.campusOnly')}</Badge>) : <Badge tone={KIND_TONE[post.kind as PostKind]}><Icon className="h-3 w-3" aria-hidden />{t(`community.kind.${post.kind}`)}</Badge>}
          </div>
        </div>
      </header>

      {post.hidden && <p className="mt-3 flex items-center gap-2 text-sm text-muted"><EyeOff className="h-4 w-4 shrink-0" aria-hidden />{t('community.hiddenPending')}</p>}
      {editing ? (
        <div className="mt-3 space-y-2">
          <Textarea aria-label={t('community.edit')} rows={3} maxLength={1500} value={draft} onChange={(e) => setDraft(e.target.value)} />
          <div className="flex justify-end gap-2"><Button size="sm" variant="ghost" onClick={() => setEditing(false)}>{t('common.cancel')}</Button><Button size="sm" loading={busy} disabled={draft.trim().length < 2} onClick={() => void save()}>{t('community.save')}</Button></div>
        </div>
      ) : <p dir="auto" className="mt-3 whitespace-pre-line text-[0.95rem] leading-relaxed">{post.body}</p>}

      {feed?.media && (
        <figure className="mt-3 overflow-hidden rounded-xl border border-line bg-surface-2">
          <img src={feed.media.url} alt={feed.media.alt} loading="lazy" className="max-h-[28rem] w-full object-cover" />
          {feed.media.alt && <figcaption className="sr-only">{feed.media.alt}</figcaption>}
        </figure>
      )}
      {post.gallery && post.gallery.length > 0 && <Gallery images={post.gallery} />}
      {post.source && (
        <p className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted">
          {post.source.highlight ? <span className="rounded-md bg-gold-500/20 px-1.5 py-0.5 font-semibold text-gold-700">{t('community.pastHighlight')}{post.source.happened_on ? ` · ${fmtDate(post.source.happened_on, locale)}` : ''}</span> : null}
          <a href={post.source.url} target="_blank" rel="noreferrer noopener" className="inline-flex min-h-11 items-center gap-1 font-medium text-brand-600 hover:underline sm:min-h-0">{t('community.source')}: {l(post.source.label_en, post.source.label_ar)}<ExternalLink className="h-3 w-3" aria-hidden /></a>
        </p>
      )}
      {post.event && (
        <Link to={`/campus/events/${post.event.id}`} className="mt-3 flex min-h-11 items-center gap-3 rounded-xl border border-line px-3 py-2 text-sm transition hover:border-brand-400">
          <CalendarDays className="h-4 w-4 shrink-0 text-brand-600" aria-hidden />
          <span className="min-w-0 flex-1"><span className="block truncate font-medium">{l(post.event.title_en, post.event.title_ar || post.event.title_en)}</span><span className="num block text-xs text-muted">{fmtDate(post.event.start_at, locale, { weekday: 'short' })} · {fmtTime(post.event.start_at, locale)}</span></span>
          <span className="shrink-0 text-sm font-semibold text-brand-600">{t('community.eventCta')}</span>
        </Link>
      )}
      {post.poll && <Poll post={post} onChange={setPost} />}

      <footer className="mt-3 flex flex-wrap items-center gap-1 border-t border-line pt-2">
        <button type="button" disabled={!post.can.react || busy} aria-pressed={post.reacted} onClick={() => void react()} className={clsx('inline-flex min-h-11 items-center gap-1.5 rounded-xl px-2.5 text-sm transition sm:min-h-9', post.reacted ? 'font-semibold text-brand-700 dark:text-brand-300' : 'text-muted hover:bg-line/50 hover:text-fg', !post.can.react && 'cursor-default hover:bg-transparent')}>
          <ThumbsUp className={clsx('h-4 w-4', post.reacted && 'fill-current')} aria-hidden />{post.reactions ? t('community.helpfulCount', { n: post.reactions }) : t('community.helpful')}
        </button>
        <button type="button" aria-expanded={open} aria-controls={`post-${post.id}-replies`} onClick={() => setOpen((v) => !v)} className="inline-flex min-h-11 items-center gap-1.5 rounded-xl px-2.5 text-sm text-muted transition hover:bg-line/50 hover:text-fg sm:min-h-9">
          <MessageCircle className="h-4 w-4" aria-hidden />{t('community.replies', { n: post.comments.length })}
        </button>
        {post.kind === 'question' && post.answer_comment_id && <Badge tone="success" className="ms-auto"><CheckCircle2 className="h-3 w-3" aria-hidden />{t('community.answered')}</Badge>}
      </footer>

      {open && (
        <div id={`post-${post.id}-replies`} className="mt-2 space-y-3">
          {post.comments.length > 0 && (
            <ul className="space-y-3 border-s-2 border-line ps-3">
              {post.comments.map((c) => (
                <li key={c.id} className={clsx('rounded-xl', c.is_answer && 'bg-success/10 p-2.5 ring-1 ring-success/40')}>
                  <div className="flex items-start gap-2">
                    <Avatar name={c.author?.name_en ?? '?'} color={c.author?.avatar_color} size={28} />
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm"><span className="font-semibold">{c.author ? l(c.author.name_en, c.author.name_ar) : '—'}</span><RoleChip author={c.author} /><time className="text-xs text-muted" dateTime={c.created_at}>{fmtRelative(c.created_at, now, locale)}</time></div>
                      {c.is_answer && <div className="mt-0.5 flex items-center gap-1 text-xs font-semibold text-success"><CheckCircle2 className="h-3.5 w-3.5" aria-hidden />{t('community.acceptedAnswer')}</div>}
                      <p dir="auto" className="mt-1 whitespace-pre-line text-sm">{c.body}</p>
                      <div className="mt-1 flex flex-wrap gap-1">
                        {post.can.accept && <button type="button" onClick={() => void accept(c.is_answer ? null : c.id)} className="min-h-11 rounded-lg px-2 text-xs font-medium text-brand-700 hover:underline sm:min-h-8 dark:text-brand-300">{t(c.is_answer ? 'community.unmarkAnswer' : 'community.markAnswer')}</button>}
                        {c.can_delete && <button type="button" onClick={() => void delComment(c.id)} className="min-h-11 rounded-lg px-2 text-xs text-muted hover:text-fg hover:underline sm:min-h-8">{t('community.delete')}</button>}
                        {!c.can_delete && post.can.comment && <button type="button" onClick={() => setReport({ comment: c.id })} className="min-h-11 rounded-lg px-2 text-xs text-muted hover:text-fg hover:underline sm:min-h-8">{t('community.report')}</button>}
                      </div>
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          )}
          {post.can.comment && (
            <form className="flex items-end gap-2" onSubmit={(e) => { e.preventDefault(); if (reply.trim()) void sendReply(); }}>
              <label className="sr-only" htmlFor={`reply-${post.id}`}>{t('community.replyPlaceholder')}</label>
              <Textarea id={`reply-${post.id}`} rows={1} maxLength={600} value={reply} onChange={(e) => setReply(e.target.value)} placeholder={t('community.replyPlaceholder')} className="min-h-11 flex-1 resize-y" />
              <Button type="submit" size="sm" loading={busy} disabled={!reply.trim()}>{t('community.send')}</Button>
            </form>
          )}
        </div>
      )}

      <ConfirmDialog open={confirm} onClose={() => setConfirm(false)} onConfirm={() => void remove()} title={t(own ? 'community.delete' : 'community.remove')} body={t(own ? 'community.deleteConfirm' : 'community.removeConfirm')} danger loading={busy} />
      {report && <ReportDialog open onClose={() => setReport(null)} post={post} commentId={report.comment} />}
    </article>
  );
}

// ------------------------------------------------------------------ composer
export function Composer({ clubId, can, events, onPosted }: { clubId: string; can: PostList['can_post']; events: Array<Pick<EventItem, 'id' | 'title_en' | 'title_ar'>>; onPosted: (p: Post) => void }) {
  const { t, l } = useI18n();
  const toast = useToast();
  const kinds = (['discussion', 'question', 'announcement', 'poll'] as PostKind[]).filter((k) => can[k]);
  const [kind, setKind] = useState<PostKind>(kinds[0] ?? 'discussion');
  const [body, setBody] = useState('');
  const [options, setOptions] = useState(['', '']);
  const [pin, setPin] = useState(false);
  const [notifyAll, setNotifyAll] = useState(true);
  const [eventId, setEventId] = useState('');
  const [busy, setBusy] = useState(false);
  const [expanded, setExpanded] = useState(false);
  // Photos: up to four, each with alt text; the size is read here so the feed can reserve space.
  const [photos, setPhotos] = useState<Array<{ id: string; url: string; width: number; height: number; alt: string; caption: string }>>([]);
  const [uploading, setUploading] = useState(false);
  const addPhotos = async (files: FileList | null) => {
    if (!files?.length) return;
    setUploading(true);
    try {
      for (const f of [...files].slice(0, 4 - photos.length)) {
        if (!/^image\/(png|jpeg|webp)$/.test(f.type)) { toast.error(t('community.photoType')); continue; }
        const url = URL.createObjectURL(f);
        const size = await new Promise<{ w: number; h: number }>((res) => { const img = new Image(); img.onload = () => res({ w: img.naturalWidth, h: img.naturalHeight }); img.onerror = () => res({ w: 1200, h: 675 }); img.src = url; });
        const doc = await apiUpload<DocumentMeta>('/documents', f, { kind: 'post_media', label: 'Club post image' });
        setPhotos((p) => [...p, { id: doc.id, url, width: size.w, height: size.h, alt: '', caption: '' }]);
      }
    } catch (e) { toast.error(errorMessage(e)); } finally { setUploading(false); }
  };
  if (!kinds.length) return null;
  if (!expanded) {
    return (
      <button type="button" onClick={() => setExpanded(true)} className="card flex min-h-14 w-full items-center gap-3 px-4 text-start text-sm text-muted transition hover:border-brand-400">
        <MessageCircle className="h-5 w-5 shrink-0 text-brand-600" aria-hidden />{t(`community.composePlaceholder.${kind}`)}
      </button>
    );
  }
  const valid = body.trim().length >= 2 && (kind !== 'poll' || options.filter((o) => o.trim()).length >= 2) && photos.every((p) => p.alt.trim().length >= 3);
  const submit = async () => {
    setBusy(true);
    try {
      const p = await api<Post>(`/campus/clubs/${clubId}/posts`, { method: 'POST', body: { kind, body: body.trim(), event_id: eventId || null, pin: kind === 'announcement' ? pin : undefined, notify: kind === 'announcement' || kind === 'poll' ? notifyAll : undefined, options: kind === 'poll' ? options.map((o) => o.trim()).filter(Boolean) : undefined, media: kind !== 'poll' && photos.length ? photos.map((p) => ({ document_id: p.id, alt: p.alt.trim(), caption: p.caption.trim() || undefined, width: p.width, height: p.height })) : undefined } });
      setBody(''); setOptions(['', '']); setPin(false); setEventId(''); setExpanded(false); setPhotos([]);
      toast.success(t('community.posted'));
      onPosted(p);
      refreshAll('community');
    } catch (e) { toast.error(errorMessage(e)); } finally { setBusy(false); }
  };
  return (
    <section aria-labelledby={`compose-${clubId}`} className="card p-4">
      <h2 id={`compose-${clubId}`} className="sr-only">{t('community.compose')}</h2>
      {kinds.length > 1 && (
        <div role="radiogroup" aria-label={t('community.compose')} className="mb-3 flex flex-wrap gap-1.5">
          {kinds.map((k) => {
            const Icon = KIND_ICON[k];
            return <button key={k} type="button" role="radio" aria-checked={kind === k} onClick={() => setKind(k)} className={clsx('inline-flex min-h-11 items-center gap-1.5 rounded-full border px-3 text-sm font-medium transition sm:min-h-9', kind === k ? 'border-brand-500 bg-brand-500 text-ink-950' : 'border-line hover:border-brand-400')}><Icon className="h-4 w-4" aria-hidden />{t(`community.kind.${k}`)}</button>;
          })}
        </div>
      )}
      <label className="sr-only" htmlFor={`compose-body-${clubId}`}>{t(`community.composePlaceholder.${kind}`)}</label>
      <Textarea id={`compose-body-${clubId}`} autoFocus rows={3} maxLength={1500} value={body} onChange={(e) => setBody(e.target.value)} placeholder={t(`community.composePlaceholder.${kind}`)} />
      {kind === 'poll' && (
        <div className="mt-3 space-y-2">
          {options.map((o, i) => (
            <div key={i} className="flex items-center gap-2">
              <Input aria-label={t('community.pollOption', { n: i + 1 })} placeholder={t('community.pollOption', { n: i + 1 })} maxLength={80} value={o} onChange={(e) => setOptions(options.map((x, j) => (j === i ? e.target.value : x)))} />
              {options.length > 2 && <button type="button" aria-label={t('community.removeOption', { n: i + 1 })} onClick={() => setOptions(options.filter((_, j) => j !== i))} className="grid h-11 w-11 shrink-0 place-items-center rounded-xl text-muted hover:bg-line/60"><X className="h-4 w-4" aria-hidden /></button>}
            </div>
          ))}
          {options.length < 5 && <Button size="sm" variant="ghost" icon={<Plus className="h-4 w-4" aria-hidden />} onClick={() => setOptions([...options, ''])}>{t('community.addOption')}</Button>}
        </div>
      )}
      {kind !== 'poll' && (
        <div className="mt-3">
          {photos.length > 0 && (
            <ul className="mb-2 space-y-2">
              {photos.map((p, i) => (
                <li key={p.id} className="flex gap-3 rounded-xl border border-line p-2">
                  <img src={p.url} alt="" className="h-16 w-24 shrink-0 rounded-lg object-cover" />
                  <div className="min-w-0 flex-1 space-y-1.5">
                    <Input aria-label={t('community.photoAlt', { n: i + 1 })} placeholder={t('community.photoAltPh')} maxLength={200} value={p.alt} onChange={(e) => setPhotos(photos.map((x, j) => (j === i ? { ...x, alt: e.target.value } : x)))} dir="auto" />
                    <Input aria-label={t('community.photoCaption', { n: i + 1 })} placeholder={t('community.photoCaptionPh')} maxLength={200} value={p.caption} onChange={(e) => setPhotos(photos.map((x, j) => (j === i ? { ...x, caption: e.target.value } : x)))} dir="auto" />
                  </div>
                  <button type="button" aria-label={t('community.photoRemove', { n: i + 1 })} onClick={() => setPhotos(photos.filter((_, j) => j !== i))} className="grid h-11 w-11 shrink-0 place-items-center rounded-xl text-muted hover:bg-line/60"><X className="h-4 w-4" aria-hidden /></button>
                </li>
              ))}
            </ul>
          )}
          {photos.length < 4 && (
            <label className={clsx('inline-flex min-h-11 cursor-pointer items-center gap-2 rounded-xl px-3 text-sm font-medium text-brand-600 hover:bg-line/50 sm:min-h-9', uploading && 'opacity-60')}>
              <ImagePlus className="h-4 w-4" aria-hidden />{uploading ? t('community.photoUploading') : t('community.photoAdd')}
              <input type="file" accept="image/png,image/jpeg,image/webp" multiple className="sr-only" disabled={uploading} onChange={(e) => { void addPhotos(e.target.files); e.target.value = ''; }} />
            </label>
          )}
          {photos.some((p) => p.alt.trim().length < 3) && <p className="mt-1 text-xs text-warn">{t('community.photoAltNeeded')}</p>}
        </div>
      )}
      {(kind === 'announcement' || kind === 'poll') && (
        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          {kind === 'announcement' && <Toggle checked={pin} onChange={setPin} label={t('community.pinPost')} />}
          <Toggle checked={notifyAll} onChange={setNotifyAll} label={t('community.notifyMembers')} />
        </div>
      )}
      <div className="mt-3 flex flex-wrap items-end justify-between gap-3">
        {events.length > 0 && kind !== 'poll' ? (
          <Field label={t('community.linkEvent')} className="min-w-0 flex-1 sm:max-w-xs">
            <Select value={eventId} onChange={(e) => setEventId(e.target.value)}>
              <option value="">{t('community.noEvent')}</option>
              {events.map((e) => <option key={e.id} value={e.id}>{l(e.title_en, e.title_ar || e.title_en)}</option>)}
            </Select>
          </Field>
        ) : <span />}
        <div className="flex gap-2"><Button variant="ghost" onClick={() => setExpanded(false)}>{t('common.cancel')}</Button><Button loading={busy} disabled={!valid} onClick={() => void submit()}>{t('community.post')}</Button></div>
      </div>
      <p className="mt-2 text-xs text-muted">{t('community.guidelines')}</p>
    </section>
  );
}

// ------------------------------------------------------------------ club posts tab
export function ClubPosts({ clubId, events, focusPostId, onReportsChange }: { clubId: string; events: Array<Pick<EventItem, 'id' | 'title_en' | 'title_ar'>>; focusPostId?: string | null; onReportsChange?: (n: number) => void }) {
  const { t } = useI18n();
  const [kind, setKind] = useState<PostKind | ''>('');
  const q = useQuery(() => api<PostList>(`/campus/clubs/${clubId}/posts`, { query: { kind } }), [clubId, kind], { refreshOn: ['community'] });
  useEffect(() => { if (q.data) onReportsChange?.(q.data.open_reports); }, [q.data, onReportsChange]);
  useEffect(() => { if (focusPostId && q.data) document.getElementById(`post-${focusPostId}`)?.scrollIntoView({ block: 'center' }); }, [focusPostId, q.data]);
  const d = q.data;
  const remove = () => void q.refetch();
  return (
    <div className="space-y-4">
      {d && <Composer clubId={clubId} can={d.can_post} events={events} onPosted={() => void q.refetch()} />}
      <div role="group" aria-label={t('community.filter.all')} className="scroll-row -mx-1 flex gap-2 overflow-x-auto px-1 py-0.5">
        {(['', 'announcement', 'discussion', 'question', 'poll'] as Array<PostKind | ''>).map((k) => (
          <button key={k || 'all'} type="button" aria-pressed={kind === k} onClick={() => setKind(k)} className={clsx('inline-flex min-h-11 shrink-0 items-center rounded-full border px-4 text-sm font-medium transition sm:min-h-9', kind === k ? 'border-brand-500 bg-brand-500 text-ink-950' : 'border-line bg-surface hover:border-brand-400')}>{k ? t(`community.kind.${k}`) : t('community.filter.all')}</button>
        ))}
      </div>
      {q.loading && !d && <div className="space-y-3">{[1, 2, 3].map((i) => <Skeleton key={i} className="h-36" />)}</div>}
      {q.error ? <ErrorState error={q.error} onRetry={() => void q.refetch()} /> : null}
      {d && d.pinned.length + d.items.length === 0 && <EmptyState icon={<MessageCircle className="h-6 w-6" />} title={t('community.empty')} body={t('community.emptyBody')} />}
      {d?.pinned.map((p) => <PostCard key={p.id} post={p} highlight={p.id === focusPostId} onRemoved={remove} />)}
      {d?.items.map((p) => <PostCard key={p.id} post={p} highlight={p.id === focusPostId} onRemoved={remove} />)}
      {d && d.members_only_hidden > 0 && <Callout tone="info" icon={<Lock className="h-5 w-5" />}>{t('community.membersOnly', { n: d.members_only_hidden })}</Callout>}
    </div>
  );
}

// ------------------------------------------------------------------ moderation queue (lead and officers)
export function ModerationQueue({ clubId }: { clubId: string }) {
  const { t, l, locale } = useI18n();
  const toast = useToast();
  const q = useQuery(() => api<ClubReport[]>(`/campus/clubs/${clubId}/reports`), [clubId], { refreshOn: ['community'] });
  const [busy, setBusy] = useState<string | null>(null);
  const resolve = async (r: ClubReport, action: 'dismiss' | 'remove') => {
    setBusy(r.id);
    try {
      await api(`/campus/clubs/${clubId}/reports/${r.id}/resolve`, { method: 'POST', body: { action, reason: action === 'remove' ? t(`community.reason.${r.reason}`) : undefined } });
      toast.success(t(action === 'remove' ? 'community.mod.removedToast' : 'community.mod.dismissed'));
      refreshAll('community');
    } catch (e) { toast.error(errorMessage(e)); } finally { setBusy(null); }
  };
  return (
    <section aria-labelledby="mod-h" className="space-y-3">
      <div><h2 id="mod-h" className="font-semibold">{t('community.mod.title')}</h2><p className="text-sm text-muted">{t('community.mod.body')}</p></div>
      {q.loading && !q.data && <Skeleton className="h-32" />}
      {q.error ? <ErrorState error={q.error} onRetry={() => void q.refetch()} /> : null}
      {q.data && q.data.length === 0 && <EmptyState icon={<ShieldCheck className="h-6 w-6" />} title={t('community.mod.empty')} />}
      <ul className="space-y-3">
        {q.data?.map((r) => (
          <li key={r.id} className="card p-4">
            <div className="flex flex-wrap items-center gap-1.5">
              <Badge tone="warn"><Flag className="h-3 w-3" aria-hidden />{t(`community.reason.${r.reason}`)}</Badge>
              <Badge tone="neutral">{t(r.comment_id ? 'community.mod.reply' : `community.kind.${r.post_kind}`)}</Badge>
              {r.hidden && <Badge tone="neutral"><EyeOff className="h-3 w-3" aria-hidden />{t('community.mod.hiddenBadge')}</Badge>}
              <span className="num ms-auto text-xs text-muted">{fmtDate(r.created_at, locale)}</span>
            </div>
            <blockquote dir="auto" className="mt-2 border-s-2 border-line ps-3 text-sm">{r.comment_body ?? r.post_body}</blockquote>
            {r.author && <p className="mt-1 text-xs text-muted">{l(r.author.name_en, r.author.name_ar)}</p>}
            {r.note && <p dir="auto" className="mt-2 text-sm text-muted">“{r.note}”</p>}
            <div className="mt-3 flex flex-wrap gap-2">
              <Button size="sm" variant="outline" loading={busy === r.id} onClick={() => void resolve(r, 'dismiss')}>{t('community.mod.dismiss')}</Button>
              <Button size="sm" variant="danger" loading={busy === r.id} onClick={() => void resolve(r, 'remove')}>{t(r.comment_id ? 'community.mod.removeReply' : 'community.mod.removePost')}</Button>
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}

// ------------------------------------------------------------------ Campus Life feed
export function CommunityFeed({ limit = 4, header }: { limit?: number; header?: ReactNode }) {
  const { t } = useI18n();
  const q = useQuery(() => api<{ items: Post[]; clubs: number }>('/campus/community/feed'), [], { refreshOn: ['community', 'campus'] });
  return (
    <section aria-labelledby="feed-h" className="min-w-0">
      {header}
      {q.loading && !q.data && <div className="space-y-3">{[1, 2].map((i) => <Skeleton key={i} className="h-36" />)}</div>}
      {q.error ? <ErrorState error={q.error} onRetry={() => void q.refetch()} /> : null}
      {q.data && q.data.items.length === 0 && <EmptyState icon={<MessageCircle className="h-6 w-6" />} title={t('community.feedEmpty')} />}
      <div className="space-y-3">{q.data?.items.slice(0, limit).map((p) => <PostCard key={p.id} post={p} showClub />)}</div>
    </section>
  );
}

// ------------------------------------------------------------------ event check-in
export function CheckinPanel({ eventId, state }: { eventId: string; state: CheckinState }) {
  const { t, locale } = useI18n();
  const toast = useToast();
  const [s, setS] = useState(state);
  const [open, setOpen] = useState(false);
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  useEffect(() => setS(state), [state]);
  const submit = async () => {
    setBusy(true);
    try {
      const r = await api<CheckinState>(`/campus/events/${eventId}/checkin`, { method: 'POST', body: { code: code.trim() } });
      setS(r); setOpen(false);
      toast.success(t('campus.checkin.doneToast'));
      refreshAll('campus');
    } catch (e) { toast.error(errorMessage(e)); } finally { setBusy(false); }
  };
  return (
    <section aria-labelledby="checkin-h" className="card p-4">
      <h2 id="checkin-h" className="flex items-center gap-2 font-semibold"><QrCode className="h-5 w-5 text-brand-600" aria-hidden />{t('campus.checkin.title')}</h2>
      {s.is_organiser && s.qr_payload ? (
        <div className="mt-3 flex flex-wrap items-center gap-4">
          <div className="rounded-xl bg-white p-2"><QRCodeSVG value={s.qr_payload} size={112} level="M" title={t('campus.checkin.poster')} /></div>
          <div className="min-w-0 flex-1 text-sm">
            <div className="font-medium">{t('campus.checkin.poster')}</div>
            <p className="text-muted">{t('campus.checkin.posterBody')}</p>
            <p className="num mt-2 text-lg font-semibold tracking-[0.2em]">{s.code}</p>
            <p className="mt-1 text-muted">{t('campus.checkin.count', { n: s.count })}</p>
          </div>
        </div>
      ) : s.checked_in ? (
        <p className="mt-2 flex items-center gap-2 text-sm font-medium text-success"><CheckCircle2 className="h-4 w-4" aria-hidden />{t('campus.checkin.done', { time: fmtTime(s.checked_in.at, locale) })}</p>
      ) : (
        <>
          <p className="mt-1 text-sm text-muted">{t('campus.checkin.body')}</p>
          {s.open ? <Button className="mt-3" icon={<QrCode className="h-4 w-4" aria-hidden />} onClick={() => setOpen(true)}>{t('campus.checkin.scan')}</Button>
            : <p className="mt-2 text-sm">{new Date(s.opens_at) > new Date() ? t('campus.checkin.opens', { time: `${fmtDate(s.opens_at, locale, { weekday: 'short' })} ${fmtTime(s.opens_at, locale)}` }) : t('campus.checkin.closed')}</p>}
        </>
      )}
      <Modal open={open} onClose={() => setOpen(false)} title={t('campus.checkin.title')} description={t('campus.checkin.cameraNote')} footer={<><Button variant="ghost" onClick={() => setOpen(false)}>{t('common.cancel')}</Button><Button loading={busy} disabled={code.trim().length < 4} onClick={() => void submit()}>{t('campus.checkin.confirm')}</Button></>}>
        <Field label={t('campus.checkin.enterCode')}><Input value={code} onChange={(e) => setCode(e.target.value.toUpperCase())} autoCapitalize="characters" autoComplete="off" maxLength={64} className="num tracking-[0.2em]" /></Field>
        {s.code && (
          <div className="mt-3 flex flex-wrap items-center justify-between gap-2 rounded-xl bg-surface-2 p-3 text-sm">
            <span>{t('campus.checkin.demoCode', { code: s.code })}</span>
            <Button size="sm" variant="outline" onClick={() => setCode(s.code!)}>{t('campus.checkin.useDemo')}</Button>
          </div>
        )}
      </Modal>
    </section>
  );
}
