import { useEffect, useRef, useState, type KeyboardEvent } from 'react';
import { Link, useNavigate, useParams } from 'react-router';
import clsx from 'clsx';
import { ArrowLeft, Send, Flag, MoreHorizontal, UserRound, MessageCircle, Users } from 'lucide-react';
import { useI18n } from '@/i18n';
import { api, errorMessage } from '@/lib/api';
import { refreshAll } from '@/lib/bus';
import { useQuery } from '@/lib/useQuery';
import { fmtDate, fmtRelative, fmtTime } from '@/lib/format';
import { useToast } from '@/components/ui/toast';
import { useDemoStatus } from '@/shell/DemoClock';
import { Menu, MenuItem } from '@/components/ui/Menu';
import { Avatar, Button, ButtonLink, EmptyState, ErrorState, Modal, Skeleton, Textarea } from '@/components/ui';
import type { ChatMessage, ConversationSummary, Thread } from '../types';
import { CommunityShell, usePoll } from './shared';

function ConversationList({ activeId }: { activeId?: string }) {
  const { t, l, locale } = useI18n();
  const { data: status } = useDemoStatus();
  const q = useQuery(() => api<{ items: ConversationSummary[]; unread: number }>('/campus/community/messages'), [], { refreshOn: ['messages'] });
  usePoll(() => void q.refetch(), 12000);
  const now = status?.clock ?? new Date().toISOString();
  if (q.loading && !q.data) return <Skeleton className="h-64" />;
  if (q.error) return <ErrorState error={q.error} onRetry={() => void q.refetch()} />;
  if (!q.data?.items.length) return <EmptyState icon={<MessageCircle className="h-6 w-6" />} title={t('social.msg.empty')} body={t('social.msg.emptyBody')} action={<ButtonLink to="/campus/community/people" variant="outline" icon={<Users className="h-4 w-4" aria-hidden />}>{t('social.msg.findPeople')}</ButtonLink>} />;
  return (
    <nav aria-label={t('social.msg.list')}>
      <ul className="card divide-y divide-line overflow-hidden">
        {q.data.items.map((c) => (
          <li key={c.id}>
            <Link to={`/campus/community/messages/${c.id}`} aria-current={c.id === activeId ? 'page' : undefined} className={clsx('flex min-w-0 items-center gap-3 p-3 transition', c.id === activeId ? 'bg-brand-500/10' : 'hover:bg-line/30')}>
              <Avatar name={c.other?.name_en ?? '?'} color={c.other?.avatar_color} size={40} />
              <span className="min-w-0 flex-1">
                <span className="flex items-center justify-between gap-2"><span className={clsx('truncate text-sm', c.unread ? 'font-bold' : 'font-semibold')}>{c.other ? l(c.other.name_en, c.other.name_ar) : '—'}</span>{c.last && <time className="shrink-0 text-xs text-muted" dateTime={c.last.created_at}>{fmtRelative(c.last.created_at, now, locale)}</time>}</span>
                <span className={clsx('block truncate text-xs', c.unread ? 'font-medium text-fg' : 'text-muted')} dir="auto">{c.last ? `${c.last.mine ? `${t('social.msg.you')}: ` : ''}${c.last.body ?? t('social.msg.removed')}` : t('social.msg.noMessages')}</span>
              </span>
              {c.unread > 0 && <span className="num grid h-6 min-w-6 place-items-center rounded-full bg-brand-500 px-1.5 text-xs font-bold text-ink-950" aria-label={t('social.msg.unread', { n: c.unread })}>{c.unread}</span>}
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  );
}

function ReportMessage({ convId, message, name, onClose }: { convId: string; message: ChatMessage; name: string; onClose: () => void }) {
  const { t } = useI18n();
  const toast = useToast();
  const [reason, setReason] = useState('harassment');
  const [block, setBlock] = useState(false);
  const [busy, setBusy] = useState(false);
  const send = async () => {
    setBusy(true);
    try { await api(`/campus/community/messages/${convId}/report`, { method: 'POST', body: { message_id: message.id, reason, block } }); toast.success(t('social.msg.reported')); refreshAll('messages', 'community'); onClose(); }
    catch (e) { toast.error(errorMessage(e)); } finally { setBusy(false); }
  };
  return (
    <Modal open onClose={onClose} title={t('social.msg.reportTitle')} description={t('social.msg.reportBody')} footer={<><Button variant="ghost" onClick={onClose}>{t('common.cancel')}</Button><Button loading={busy} onClick={() => void send()}>{t('social.msg.report')}</Button></>}>
      <blockquote dir="auto" className="mb-3 border-s-2 border-line ps-3 text-sm">{message.body}</blockquote>
      <fieldset className="space-y-1">
        <legend className="mb-2 text-sm font-medium">{t('community.mod.reason')}</legend>
        {(['harassment', 'spam', 'personal_info', 'other'] as const).map((r) => (
          <label key={r} className="flex min-h-11 cursor-pointer items-center gap-3 rounded-xl px-2 text-sm hover:bg-line/40"><input type="radio" name="msg-reason" checked={reason === r} onChange={() => setReason(r)} className="h-4 w-4 accent-brand-500" />{t(`community.reason.${r}`)}</label>
        ))}
      </fieldset>
      <label className="mt-3 flex min-h-11 cursor-pointer items-center gap-3 text-sm"><input type="checkbox" checked={block} onChange={(e) => setBlock(e.target.checked)} className="h-4 w-4 accent-brand-500" />{t('social.msg.alsoBlock', { name })}</label>
    </Modal>
  );
}

function ThreadView({ id }: { id: string }) {
  const { t, l, locale } = useI18n();
  const toast = useToast();
  const nav = useNavigate();
  const [thread, setThread] = useState<Thread | null>(null);
  const [error, setError] = useState<unknown>(null);
  const [draft, setDraft] = useState('');
  const [busy, setBusy] = useState(false);
  const [fresh, setFresh] = useState<Set<string>>(new Set());
  const [report, setReport] = useState<ChatMessage | null>(null);
  const end = useRef<HTMLDivElement>(null);
  const lastSeq = useRef(0);

  const load = async (incremental: boolean) => {
    try {
      const r = await api<Thread>(`/campus/community/messages/${id}`, { query: incremental ? { after: lastSeq.current } : undefined });
      setError(null);
      setThread((cur) => {
        if (!incremental || !cur) return r;
        if (!r.messages.length) return { ...cur, conversation: r.conversation, their_read_seq: r.their_read_seq };
        setFresh((f) => new Set([...f, ...r.messages.map((m) => m.id)]));
        return { ...r, messages: [...cur.messages, ...r.messages.filter((m) => !cur.messages.some((x) => x.id === m.id))] };
      });
      const max = r.messages.at(-1)?.seq;
      if (max) lastSeq.current = Math.max(lastSeq.current, max);
      if (r.messages.length) refreshAll('messages', 'notifications');
    } catch (e) { if (!incremental) setError(e); }
  };
  useEffect(() => { lastSeq.current = 0; setThread(null); setFresh(new Set()); void load(false); }, [id]); // eslint-disable-line react-hooks/exhaustive-deps
  usePoll(() => void load(true), 4000);
  useEffect(() => { end.current?.scrollIntoView({ block: 'end' }); }, [thread?.messages.length]);

  const send = async () => {
    const body = draft.trim();
    if (!body) return;
    setBusy(true);
    try {
      const m = await api<ChatMessage>(`/campus/community/messages/${id}`, { method: 'POST', body: { body } });
      setDraft('');
      lastSeq.current = Math.max(lastSeq.current, m.seq);
      setFresh((f) => new Set([...f, m.id]));
      setThread((cur) => (cur ? { ...cur, messages: [...cur.messages, m] } : cur));
      refreshAll('messages');
    } catch (e) { toast.error(errorMessage(e)); } finally { setBusy(false); }
  };
  const onKey = (e: KeyboardEvent<HTMLTextAreaElement>) => { if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) { e.preventDefault(); void send(); } };

  if (error) return <ErrorState error={error} onRetry={() => void load(false)} />;
  if (!thread) return <Skeleton className="h-96" />;
  const other = thread.conversation.other;
  const name = other ? l(other.name_en, other.name_ar) : '—';
  const lastMine = [...thread.messages].reverse().find((m) => m.mine);
  let lastDay = '';
  return (
    <section aria-labelledby="thread-h" className="card flex min-h-[28rem] flex-col overflow-hidden md:h-[calc(100dvh-18rem)]">
      <header className="flex items-center gap-3 border-b border-line p-3">
        <button type="button" onClick={() => nav('/campus/community/messages')} aria-label={t('social.msg.back')} className="grid h-11 w-11 place-items-center rounded-full text-muted hover:bg-line/60 md:hidden"><ArrowLeft className="h-5 w-5 rtl:rotate-180" aria-hidden /></button>
        <Avatar name={other?.name_en ?? '?'} color={other?.avatar_color} size={38} />
        <div className="min-w-0 flex-1">
          <h2 id="thread-h" className="truncate font-semibold">{other ? <Link to={`/campus/community/people/${other.id}`} className="hover:underline">{name}</Link> : name}</h2>
          <p className="truncate text-xs text-muted">{[other?.program_id?.toUpperCase(), other?.campus_id ? t(`shell.${other.campus_id}`) : null].filter(Boolean).join(' · ')}</p>
        </div>
        <Menu label={t('social.profile.options')} button={<MoreHorizontal className="h-4 w-4" aria-hidden />} buttonClassName="grid h-11 w-11 place-items-center rounded-full text-muted hover:bg-line/60 hover:text-fg">
          {other && <MenuItem icon={<UserRound className="h-4 w-4" />} to={`/campus/community/people/${other.id}`}>{t('social.msg.viewProfile')}</MenuItem>}
        </Menu>
      </header>
      <div className="flex-1 overflow-y-auto p-4">
      <ol className="space-y-1.5" aria-live="polite" aria-relevant="additions">
        {thread.messages.length === 0 && <li className="py-8 text-center text-sm text-muted">{t('social.msg.noMessages')}</li>}
        {thread.messages.map((m) => {
          const day = fmtDate(m.created_at, locale, { weekday: 'long' });
          const showDay = day !== lastDay;
          lastDay = day;
          return (
            <li key={m.id}>
              {showDay && <div className="my-3 text-center text-xs text-muted">{day}</div>}
              <div className={clsx('group flex items-end gap-2', m.mine ? 'justify-end' : 'justify-start')}>
                <div className={clsx('max-w-[78%] rounded-2xl px-3.5 py-2 text-sm leading-relaxed', fresh.has(m.id) && 'bubble-in', m.mine ? 'rounded-ee-md bg-brand-500 text-ink-950' : 'rounded-es-md bg-surface-2', m.removed && 'italic text-muted')}>
                  <p dir="auto" className="whitespace-pre-wrap break-words">{m.removed ? t('social.msg.removed') : m.body}</p>
                  <time dateTime={m.created_at} className={clsx('mt-0.5 block text-end text-xs', m.mine ? 'text-ink-950/85' : 'text-muted')}>{fmtTime(m.created_at, locale)}</time>
                </div>
                {!m.mine && !m.removed && <button type="button" onClick={() => setReport(m)} aria-label={t('social.msg.report')} title={t('social.msg.report')} className="grid h-9 w-9 shrink-0 place-items-center rounded-full text-muted opacity-60 hover:bg-line/60 hover:opacity-100 focus-visible:opacity-100 touch:opacity-100"><Flag className="h-3.5 w-3.5" aria-hidden /></button>}
              </div>
              {lastMine?.id === m.id && thread.their_read_seq >= m.seq && <div className="mt-0.5 text-end text-xs text-muted">{t('social.msg.seen')}</div>}
            </li>
          );
        })}
      </ol>
      <div ref={end} />
      </div>
      {thread.conversation.can_send ? (
        <form className="border-t border-line p-3" onSubmit={(e) => { e.preventDefault(); void send(); }}>
          <div className="flex items-end gap-2">
            <label htmlFor="msg-input" className="sr-only">{t('social.msg.placeholder')}</label>
            <Textarea id="msg-input" rows={1} maxLength={1000} value={draft} onChange={(e) => setDraft(e.target.value)} onKeyDown={onKey} placeholder={t('social.msg.placeholder')} className="max-h-40 min-h-11 flex-1 resize-y" />
            <Button type="submit" loading={busy} disabled={!draft.trim()} icon={<Send className="h-4 w-4 rtl:-scale-x-100" aria-hidden />}>{t('social.msg.send')}</Button>
          </div>
          <p className="mt-1 hidden text-xs text-muted sm:block">{t('social.msg.enterHint')}</p>
        </form>
      ) : (
        <p className="border-t border-line p-4 text-sm text-muted">{thread.conversation.blocked_by_me ? t('social.msg.blockedNotice') : t('social.msg.unavailable')}</p>
      )}
      {report && <ReportMessage convId={id} message={report} name={name} onClose={() => setReport(null)} />}
    </section>
  );
}

export function MessagesPage() {
  const { id } = useParams();
  const { t } = useI18n();
  return (
    <CommunityShell doc={t('social.msg.title')}>
      <div className="grid grid-cols-1 gap-4 md:grid-cols-[minmax(0,20rem)_minmax(0,1fr)]">
        <div className={clsx('min-w-0', id && 'hidden md:block')}><h2 className="mb-3 font-display text-2xl">{t('social.msg.title')}</h2><ConversationList activeId={id} /></div>
        <div className={clsx('min-w-0', !id && 'hidden md:block')}>
          {id ? <ThreadView id={id} /> : (
            <div className="card-2 flex h-full min-h-[20rem] flex-col items-center justify-center gap-2 p-8 text-center">
              <MessageCircle className="h-8 w-8 text-brand-600" aria-hidden />
              <p className="font-display text-xl">{t('social.msg.pick')}</p>
              <p className="max-w-sm text-sm text-muted">{t('social.msg.pickBody')}</p>
            </div>
          )}
        </div>
      </div>
    </CommunityShell>
  );
}
