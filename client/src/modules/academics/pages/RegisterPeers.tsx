import { useEffect, useState } from 'react';
import clsx from 'clsx';
import { AlertTriangle, Check, Copy, Link2, UserPlus, Users, X } from 'lucide-react';
import { useI18n } from '@/i18n';
import { api, errorMessage } from '@/lib/api';
import { useQuery } from '@/lib/useQuery';
import { refreshAll } from '@/lib/bus';
import { useToast } from '@/components/ui/toast';
import { fmtDate, fmtTime, weekdayName } from '@/lib/format';
import { Button, ConfirmDialog, Input, Modal, Skeleton, ErrorState } from '@/components/ui';
import type { Proposal, SectionView } from '../api';

// ---------------------------------------------------------------- shapes (mirror server/modules/academics/peers.ts)
interface Meeting { day: number; start: string; end: string; location?: { name_en: string; name_ar: string } | null }
interface Issue { id: string; label: string; explanation: string }
interface CompareOption { section: SectionView; is_current: boolean; seats: { left: number; capacity: number; status: 'open' | 'few' | 'full'; checked_at: string }; campus_differs: boolean; conflicts: Array<{ course_code: string; section_no: string }>; travel: Array<{ day: number; from: string; to: string; gap_min: number; walk_min: number }>; credits_total: number; hard_fails: Issue[]; warnings: Issue[]; timetable_change: { removed: Meeting[]; added: Meeting[] }; feasible: boolean }
interface CompareData { proposal: { id: string; revision: number; status: string }; course: { code: string; title_en: string; title_ar: string; credits: number; eligible: boolean; reasons: string[] }; current: string | null; options: CompareOption[]; peers: Array<{ link_id: string; peer: Peer; section: { id: string; section_no: string } | null }> }
interface Peer { first_en: string; first_ar: string; avatar_color: string }
interface PeerSection { id: string; section_no: string; instructor: string; meetings: Meeting[]; seats_left: number }
interface Suggestion { id: string; link_id: string; course_code: string; section: PeerSection | null; note: string | null; status: string; created_at: string; peer: Peer }
interface PeersData {
  term: string; basket: { id: string; revision: number; courses: string[] } | null;
  invites: Array<{ code: string; expires_at: string }>;
  links: Array<{ id: string; peer: Peer; since: string; my_shares: string[]; theirs: Array<{ course_code: string; section: PeerSection | null }>; overlaps: Array<{ course_code: string; mine: { id: string; section_no: string } | null; theirs: { id: string; section_no: string } | null; same: boolean }> }>;
  incoming: Suggestion[]; outgoing: Suggestion[];
}
export type Undo = { label: string; body: Record<string, unknown> };

function meetingsText(ms: Meeting[], locale: 'en' | 'ar', l: (en: string, ar?: string | null) => string) {
  return ms.map((m) => `${weekdayName(m.day, locale)} ${fmtTime(m.start, locale)}–${fmtTime(m.end, locale)}${m.location ? ` · ${l(m.location.name_en, m.location.name_ar)}` : ''}`).join(' · ');
}

// ---------------------------------------------------------------- compare sections
/** Side by side (stacked on phones). Looking changes nothing; only "Switch" edits the saved plan. */
export function CompareSections({ proposal, course, focusSection, onClose, onSwitched, suggestion }: { proposal: Proposal; course: string; focusSection?: string | null; onClose: () => void; onSwitched: (u: Undo) => void; suggestion?: Suggestion | null }) {
  const { t, l, locale } = useI18n();
  const toast = useToast();
  const q = useQuery(() => api<CompareData>(`/academics/proposals/${proposal.id}/compare`, { query: { course } }), [proposal.id, proposal.revision, course]);
  const [confirm, setConfirm] = useState<CompareOption | null>(null);
  const [busy, setBusy] = useState(false);
  const d = q.data;
  const current = d?.options.find((o) => o.is_current) ?? null;
  const switchTo = async (o: CompareOption) => {
    if (!d) return;
    setBusy(true);
    try {
      if (suggestion) {
        const r = await api<{ proposal: Proposal; undo: Record<string, unknown> }>(`/academics/peers/proposals/${suggestion.id}/apply`, { body: { proposalId: proposal.id, expectedRevision: d.proposal.revision } });
        onSwitched({ label: t('reg.cmp.switched', { code: course, sec: o.section.section_no }), body: { ...r.undo, expectedRevision: r.proposal.revision } });
      } else {
        const body = current ? { swap: { from: current.section.id, to: o.section.id }, expectedRevision: d.proposal.revision } : { add: o.section.id, expectedRevision: d.proposal.revision };
        const r = await api<{ proposal: Proposal }>(`/academics/proposals/${proposal.id}`, { method: 'PUT', body });
        onSwitched({ label: t('reg.cmp.switched', { code: course, sec: o.section.section_no }), body: current ? { swap: { from: o.section.id, to: current.section.id }, expectedRevision: r.proposal.revision } : { remove: o.section.id, expectedRevision: r.proposal.revision } });
      }
      refreshAll('academics', 'calendar');
      setConfirm(null);
      onClose();
    } catch (e) {
      toast.error(t('reg.cmp.couldNot'), errorMessage(e));
      void q.refetch();
    } finally { setBusy(false); }
  };
  const suggest = async (linkId: string, o: CompareOption, name: string) => {
    try { await api(`/academics/peers/links/${linkId}/proposals`, { body: { course_code: course, section_id: o.section.id } }); toast.success(t('reg.peer.suggested', { name })); refreshAll('academics'); }
    catch (e) { toast.error(t('common.error'), errorMessage(e)); }
  };
  const mutual = d?.peers.filter((p) => p.section) ?? [];
  return (
    <Modal open onClose={onClose} size="xl" title={d ? `${t('reg.cmp.title')} · ${d.course.code}` : t('reg.cmp.title')} description={t('reg.cmp.help')}>
      {q.error ? <ErrorState error={q.error} onRetry={q.refetch} /> : !d ? <Skeleton className="h-64" /> : (
        <div className="space-y-4">
          <p className="text-sm"><span className="font-semibold" dir="auto">{l(d.course.title_en, d.course.title_ar)}</span> · <span className="num">{d.course.credits} {t('common.credits')}</span> · {d.course.eligible ? <span className="text-success">{t('reg.cmp.prereqsOk')}</span> : <span className="text-danger">{d.course.reasons.join('; ')}</span>}</p>
          {suggestion && <p className="rounded-xl bg-surface-2 p-3 text-sm">{t('reg.peer.reviewing', { name: l(suggestion.peer.first_en, suggestion.peer.first_ar), code: course, sec: suggestion.section?.section_no ?? '' })}{suggestion.note ? <span className="block text-muted" dir="auto">“{suggestion.note}”</span> : null}</p>}
          <ul className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {d.options.map((o) => {
              const peersHere = mutual.filter((p) => p.section!.id === o.section.id);
              const focus = focusSection === o.section.id;
              return (
                <li key={o.section.id} className={clsx('flex flex-col rounded-2xl border p-4 text-sm', o.is_current ? 'border-brand-500/60 bg-brand-500/5' : focus ? 'border-gold-500 ring-2 ring-gold-500/40' : 'border-line')}>
                  <div className="flex items-baseline justify-between gap-2">
                    <h3 className="font-semibold">{t('reg.cmp.section', { n: o.section.section_no })}</h3>
                    <span className={clsx('text-xs font-semibold', o.is_current ? 'text-brand-700 dark:text-brand-300' : 'text-muted')}>{o.is_current ? t('reg.cmp.inPlan') : t('reg.cmp.alternative')}</span>
                  </div>
                  <dl className="mt-2 space-y-1.5">
                    <div><dt className="sr-only">{t('reg.cmp.instructor')}</dt><dd>{o.section.instructor}</dd></div>
                    <div><dt className="sr-only">{t('reg.cmp.meetings')}</dt><dd className="num text-muted">{meetingsText(o.section.meetings, locale, l)}</dd></div>
                    <div className="flex flex-wrap gap-x-2"><dt className="text-muted">{t('reg.cmp.seats')}</dt><dd className={clsx('num font-medium', o.seats.status === 'full' ? 'text-danger' : o.seats.status === 'few' ? 'text-warn' : '')}>{t('reg.cmp.seatsLeft', { n: o.seats.left, cap: o.seats.capacity })} <span className="font-normal text-muted">· {t('reg.cmp.checked', { time: fmtTime(o.seats.checked_at, locale) })}</span></dd></div>
                    <div className="flex flex-wrap gap-x-2"><dt className="text-muted">{t('reg.cmp.total')}</dt><dd className="num">{o.credits_total} {t('common.credits')}</dd></div>
                  </dl>
                  {!o.is_current && (o.timetable_change.removed.length > 0 || o.timetable_change.added.length > 0) && (
                    <p className="num mt-2 text-muted">{t('reg.cmp.moves', { from: meetingsText(o.timetable_change.removed, locale, l) || '—', to: meetingsText(o.timetable_change.added, locale, l) || '—' })}</p>
                  )}
                  <div className="mt-2 space-y-1">
                    {o.conflicts.map((c) => <p key={c.course_code} className="flex gap-1.5 text-danger"><AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />{t('reg.cmp.clash', { code: c.course_code, sec: c.section_no })}</p>)}
                    {o.hard_fails.filter((f) => f.id !== 'overlap').map((f) => <p key={f.id} className="flex gap-1.5 text-danger"><AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />{f.label}: {f.explanation}</p>)}
                    {o.travel.map((x, i) => <p key={i} className="text-warn">{t('reg.cmp.travel', { day: weekdayName(x.day, locale), gap: x.gap_min, walk: x.walk_min })}</p>)}
                    {o.campus_differs && <p className="text-warn">{t('reg.cmp.otherCampus')}</p>}
                    {o.feasible && !o.conflicts.length && !o.travel.length && !o.is_current && <p className="flex gap-1.5 text-success"><Check className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />{t('reg.cmp.fits')}</p>}
                  </div>
                  {peersHere.length > 0 && <p className="mt-2 flex items-center gap-1.5 text-sm"><Users className="h-4 w-4 text-muted" aria-hidden />{t('reg.cmp.peerHere', { names: peersHere.map((p) => l(p.peer.first_en, p.peer.first_ar)).join(', ') })}</p>}
                  <div className="mt-auto flex flex-wrap gap-2 pt-3">
                    {!o.is_current && (!suggestion || suggestion.section?.id === o.section.id) && (
                      <Button size="sm" disabled={!o.feasible} onClick={() => setConfirm(o)} title={!o.feasible ? t('reg.cmp.cannot') : undefined}>{suggestion ? t('reg.peer.accept') : t('reg.cmp.switch')}</Button>
                    )}
                    {!suggestion && !o.is_current && d.peers.filter((p) => p.section && p.section.id !== o.section.id).map((p) => (
                      <Button key={p.link_id} size="sm" variant="ghost" onClick={() => void suggest(p.link_id, o, l(p.peer.first_en, p.peer.first_ar))}>{t('reg.peer.suggestTo', { name: l(p.peer.first_en, p.peer.first_ar) })}</Button>
                    ))}
                  </div>
                </li>
              );
            })}
          </ul>
          {d.peers.length === 0 && <p className="text-sm text-muted">{t('reg.cmp.noPeers')}</p>}
        </div>
      )}
      <ConfirmDialog open={!!confirm} onClose={() => setConfirm(null)} loading={busy}
        title={t('reg.cmp.confirmTitle', { code: course, sec: confirm?.section.section_no ?? '' })}
        body={<span>{current ? t('reg.cmp.confirmBody', { from: current.section.section_no, to: confirm?.section.section_no ?? '' }) : t('reg.cmp.confirmAdd')} {t('reg.cmp.confirmNote')}</span>}
        confirmLabel={suggestion ? t('reg.peer.accept') : t('reg.cmp.switch')} onConfirm={() => { if (confirm) void switchTo(confirm); }} />
    </Modal>
  );
}

// ---------------------------------------------------------------- classmates
export function ClassmatesPanel({ proposal, onReview, focus }: { proposal: Proposal; onReview: (s: Suggestion) => void; focus: boolean }) {
  const { t, l, locale } = useI18n();
  const toast = useToast();
  const q = useQuery(() => api<PeersData>('/academics/peers'), [proposal.id, proposal.revision], { refreshOn: ['academics'] });
  const [code, setCode] = useState('');
  const [preview, setPreview] = useState<Peer | null>(null);
  const [shares, setShares] = useState<Record<string, string[]>>({});
  const [ending, setEnding] = useState<string | null>(null);
  const [copied, setCopied] = useState<string | null>(null);
  useEffect(() => { if (q.data) setShares(Object.fromEntries(q.data.links.map((x) => [x.id, x.my_shares]))); }, [q.data]);
  useEffect(() => { if (focus) document.getElementById('classmates-h')?.scrollIntoView({ block: 'start' }); }, [focus, q.data]);
  const act = async (fn: () => Promise<unknown>, msg?: string) => { try { await fn(); if (msg) toast.success(msg); refreshAll('academics'); void q.refetch(); } catch (e) { toast.error(t('common.error'), errorMessage(e)); } };
  const d = q.data;
  return (
    <section aria-labelledby="classmates-h" className="scroll-mt-24">
      <h2 id="classmates-h" className="flex items-center gap-2 text-lg font-semibold"><Users className="h-5 w-5 text-muted" aria-hidden />{t('reg.peer.title')}</h2>
      <p className="mt-1 max-w-[70ch] text-sm text-muted">{t('reg.peer.help')}</p>
      {q.error ? <ErrorState error={q.error} onRetry={q.refetch} /> : !d ? <Skeleton className="mt-3 h-24" /> : (
        <div className="mt-4 space-y-6">
          {d.incoming.filter((s) => s.status === 'open').length > 0 && (
            <div>
              <h3 className="mb-1 text-sm font-semibold">{t('reg.peer.incoming')}</h3>
              <ul className="divide-y divide-line rounded-2xl border border-line">
                {d.incoming.filter((s) => s.status === 'open').map((s) => (
                  <li key={s.id} className="flex flex-wrap items-center gap-x-4 gap-y-2 p-3 text-sm">
                    <span className="min-w-0 flex-1">{t('reg.peer.suggestion', { name: l(s.peer.first_en, s.peer.first_ar), code: s.course_code, sec: s.section?.section_no ?? '?' })}{s.note && <span className="block text-muted" dir="auto">“{s.note}”</span>}</span>
                    <Button size="sm" onClick={() => onReview(s)}>{t('reg.peer.review')}</Button>
                    <Button size="sm" variant="ghost" onClick={() => void act(() => api(`/academics/peers/proposals/${s.id}/decline`, { method: 'POST' }), t('reg.peer.declined'))}>{t('reg.peer.decline')}</Button>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {d.links.map((lk) => {
            const name = l(lk.peer.first_en, lk.peer.first_ar);
            const mine = shares[lk.id] ?? [];
            const dirty = mine.slice().sort().join() !== lk.my_shares.slice().sort().join();
            return (
              <div key={lk.id} className="rounded-2xl border border-line p-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <h3 className="font-semibold">{t('reg.peer.with', { name })}</h3>
                  <Button size="sm" variant="ghost" icon={<X className="h-4 w-4" />} onClick={() => setEnding(lk.id)}>{t('reg.peer.end')}</Button>
                </div>
                <fieldset className="mt-3">
                  <legend className="text-sm font-medium">{t('reg.peer.youShare', { name })}</legend>
                  {d.basket?.courses.length ? (
                    <div className="mt-1 flex flex-wrap gap-2">
                      {d.basket.courses.map((c) => (
                        <label key={c} className={clsx('inline-flex min-h-11 cursor-pointer items-center gap-2 rounded-xl border px-3 text-sm sm:min-h-9', mine.includes(c) ? 'border-brand-500 bg-brand-500/10' : 'border-line')}>
                          <input type="checkbox" className="h-4 w-4 accent-[var(--color-brand-500)]" checked={mine.includes(c)} onChange={(e) => setShares((s) => ({ ...s, [lk.id]: e.target.checked ? [...mine, c] : mine.filter((x) => x !== c) }))} />{c}
                        </label>
                      ))}
                    </div>
                  ) : <p className="text-sm text-muted">{t('reg.peer.noBasket')}</p>}
                  {dirty && <Button size="sm" className="mt-2" onClick={() => void act(() => api(`/academics/peers/links/${lk.id}/shares`, { method: 'PUT', body: { courses: mine } }), t('reg.peer.saved'))}>{t('reg.peer.saveShares')}</Button>}
                  {!dirty && mine.length === 0 && <p className="mt-1 text-xs text-muted">{t('reg.peer.nothingShared')}</p>}
                </fieldset>
                <div className="mt-4">
                  <h4 className="text-sm font-medium">{t('reg.peer.theyShare', { name })}</h4>
                  {lk.theirs.length === 0 ? <p className="text-sm text-muted">{t('reg.peer.theyNothing', { name })}</p> : (
                    <ul className="mt-1 space-y-1 text-sm">
                      {lk.theirs.map((x) => {
                        const ov = lk.overlaps.find((o) => o.course_code === x.course_code);
                        return (
                          <li key={x.course_code} className="flex flex-wrap items-center gap-x-3">
                            <span className="font-semibold">{x.course_code}</span>
                            <span className="num text-muted">{x.section ? `${t('reg.cmp.section', { n: x.section.section_no })} · ${meetingsText(x.section.meetings, locale, l)}` : t('reg.peer.notInBasket')}</span>
                            {ov && <span className={clsx('text-xs font-semibold', ov.same ? 'text-success' : 'text-muted')}>{ov.same ? t('reg.peer.same') : ov.mine ? t('reg.peer.youIn', { sec: ov.mine.section_no }) : ''}</span>}
                          </li>
                        );
                      })}
                    </ul>
                  )}
                </div>
                {d.outgoing.filter((s) => s.link_id === lk.id && s.status !== 'withdrawn').length > 0 && (
                  <ul className="mt-3 space-y-1 text-sm text-muted">
                    {d.outgoing.filter((s) => s.link_id === lk.id && s.status !== 'withdrawn').map((s) => (
                      <li key={s.id} className="flex flex-wrap items-center gap-x-3">{t('reg.peer.youSuggested', { code: s.course_code, sec: s.section?.section_no ?? '?' })} · {t(`reg.peer.status.${s.status}`)}{s.status === 'open' && <button type="button" className="font-medium text-brand-600 hover:underline" onClick={() => void act(() => api(`/academics/peers/proposals/${s.id}/withdraw`, { method: 'POST' }))}>{t('reg.peer.withdraw')}</button>}</li>
                    ))}
                  </ul>
                )}
              </div>
            );
          })}

          <div className="grid gap-6 md:grid-cols-2">
            <div>
              <h3 className="flex items-center gap-2 text-sm font-semibold"><UserPlus className="h-4 w-4 text-muted" aria-hidden />{t('reg.peer.invite')}</h3>
              <p className="text-sm text-muted">{t('reg.peer.inviteHelp')}</p>
              {d.invites.map((iv) => (
                <div key={iv.code} className="mt-2 flex flex-wrap items-center gap-2">
                  <code className="num rounded-lg bg-surface-2 px-3 py-1.5 text-base font-semibold tracking-widest">{iv.code}</code>
                  <Button size="icon" variant="ghost" aria-label={t('common.copy')} onClick={() => { void navigator.clipboard?.writeText(iv.code); setCopied(iv.code); window.setTimeout(() => setCopied(null), 1500); }}>{copied === iv.code ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}</Button>
                  <span className="text-xs text-muted">{t('reg.peer.expires', { date: fmtDate(iv.expires_at, locale, { weekday: 'short', year: undefined }) })}</span>
                  <button type="button" className="text-xs font-medium text-brand-600 hover:underline" onClick={() => void act(() => api(`/academics/peers/invites/${iv.code}`, { method: 'DELETE' }))}>{t('reg.peer.cancelCode')}</button>
                </div>
              ))}
              <Button size="sm" variant="outline" className="mt-2" disabled={d.invites.length >= 3} onClick={() => void act(() => api('/academics/peers/invites', { method: 'POST' }))}>{t('reg.peer.createCode')}</Button>
            </div>
            <div>
              <h3 className="flex items-center gap-2 text-sm font-semibold"><Link2 className="h-4 w-4 text-muted" aria-hidden />{t('reg.peer.haveCode')}</h3>
              <form className="mt-1 flex gap-2" onSubmit={(e) => { e.preventDefault(); void api<{ peer: Peer }>('/academics/peers/redeem', { body: { code } }).then((r) => setPreview(r.peer)).catch((err) => toast.error(t('common.error'), errorMessage(err))); }}>
                <label htmlFor="peer-code" className="sr-only">{t('reg.peer.codeLabel')}</label>
                <Input id="peer-code" value={code} onChange={(e) => { setCode(e.target.value.toUpperCase()); setPreview(null); }} placeholder="ABCD2345" autoComplete="off" className="num uppercase tracking-widest" maxLength={12} />
                <Button type="submit" variant="secondary" disabled={code.trim().length < 6}>{t('reg.peer.lookUp')}</Button>
              </form>
              {preview && (
                <div className="mt-2 rounded-xl bg-surface-2 p-3 text-sm">
                  <p>{t('reg.peer.codeFrom', { name: l(preview.first_en, preview.first_ar) })}</p>
                  <div className="mt-2 flex gap-2">
                    <Button size="sm" onClick={() => void act(() => api('/academics/peers/redeem', { body: { code, confirm: true } }), t('reg.peer.connected', { name: l(preview.first_en, preview.first_ar) })).then(() => { setPreview(null); setCode(''); })}>{t('reg.peer.connect')}</Button>
                    <Button size="sm" variant="ghost" onClick={() => { setPreview(null); setCode(''); }}>{t('common.cancel')}</Button>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
      <ConfirmDialog open={!!ending} onClose={() => setEnding(null)} danger title={t('reg.peer.endTitle')} body={t('reg.peer.endBody')} confirmLabel={t('reg.peer.end')}
        onConfirm={() => { const id = ending; setEnding(null); if (id) void act(() => api(`/academics/peers/links/${id}`, { method: 'DELETE' }), t('reg.peer.ended')); }} />
    </section>
  );
}

export type { Suggestion };
