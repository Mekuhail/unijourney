import { useRef, useState, type ReactNode } from 'react';
import { Link } from 'react-router';
import clsx from 'clsx';
import {
  Award, BookOpen, Briefcase, CheckCircle2, Code2, Download, ExternalLink, FileArchive, FolderGit2, GraduationCap, Languages as LanguagesIcon,
  Link2, ListTodo, Pencil, Plus, RefreshCw, ShieldCheck, Star, Trash2, Upload, UserRound, IdCard, Trophy, ArrowRight
} from 'lucide-react';
import { Avatar, Badge, Button, Callout, Card, EmptyState, ErrorState, Field, Input, Modal, Progress, SectionTitle, Select, Skeleton, Textarea, Toggle } from '@/components/ui';
import { useToast } from '@/components/ui/toast';
import { useI18n } from '@/i18n';
import { useSession } from '@/lib/session';
import { api, errorMessage } from '@/lib/api';
import { refreshAll } from '@/lib/bus';
import { useQuery } from '@/lib/useQuery';
import { fmtDate, fmtDateTime } from '@/lib/format';
import { MatchRing, SkillChip } from './ui';
import { openStudentCard } from '@/shell/StudentCard';
import type { CardData } from '@/modules/campus/types';
import { addToLinkedinUrl, readLinkedinExport, type DraftItem, type LinkedinImport } from './linkedinExport';
import { explainText, oppTypeLabel, type CareerProfile, type OppList, type SkillGap } from './types';
import type { CompetitionList, EvidenceKind, ItemKind, PortfolioData, PortfolioItem, Visibility } from './portfolioTypes';

const EVIDENCE_ICON: Record<EvidenceKind, typeof Star> = { self: UserRound, course: BookOpen, course_in_progress: BookOpen, project: FolderGit2, github: Code2, experience: Briefcase, certificate: ShieldCheck, award: Award, award_verified: Award };

/** "2026-03" → "Mar 2026"; "2026" stays; null → "". */
function monthLabel(v: string | null, locale: 'en' | 'ar'): string {
  if (!v) return '';
  if (/^\d{4}$/.test(v)) return v;
  return fmtDate(v.length === 7 ? `${v}-01` : v, locale, { day: undefined, month: 'short', year: 'numeric' });
}

function Section({ id, title, icon, action, children }: { id: string; title: string; icon: ReactNode; action?: ReactNode; children: ReactNode }) {
  return (
    <Card as="section" aria-labelledby={id}>
      <SectionTitle id={id} action={action}><span className="flex items-center gap-2">{icon}{title}</span></SectionTitle>
      {children}
    </Card>
  );
}

function VerificationBadge({ item }: { item: PortfolioItem }) {
  const { t } = useI18n();
  if (item.verification === 'university') return <Badge tone="success" dot>{t('portfolio.verified.university')}</Badge>;
  if (item.source === 'linkedin_export') return <Badge tone="info">{t('portfolio.source.linkedin')}</Badge>;
  if (item.verification === 'link') return <Badge tone="neutral">{t('portfolio.verified.link')}</Badge>;
  return <Badge tone="neutral">{t('portfolio.verified.self')}</Badge>;
}

function ItemRow({ item, onEdit, onDelete, onVisibility }: { item: PortfolioItem; onEdit: () => void; onDelete: () => void; onVisibility: (v: Visibility) => void }) {
  const { t, locale } = useI18n();
  const dates = [monthLabel(item.start_date, locale), item.end_date && item.end_date !== item.start_date ? monthLabel(item.end_date, locale) : !item.end_date && item.start_date && item.kind !== 'award' ? t('portfolio.present') : ''].filter(Boolean).join(' – ');
  const linkable = item.kind === 'award' || item.kind === 'certificate';
  return (
    <li className="py-3 first:pt-0 last:pb-0">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <h3 dir="auto" className="font-semibold leading-snug">{item.url ? <a href={item.url} target="_blank" rel="noreferrer noopener" className="hover:text-brand-600 hover:underline">{item.title}</a> : item.title}</h3>
          <p className="text-sm text-muted">{[item.org, dates].filter(Boolean).join(' · ')}</p>
        </div>
        <VerificationBadge item={item} />
      </div>
      {item.description && <p className="mt-1 text-sm">{item.description}</p>}
      {item.skills.length > 0 && <div className="mt-2 flex flex-wrap gap-1">{item.skills.map((s) => <SkillChip key={s}>{s}</SkillChip>)}</div>}
      <div className="mt-2 flex flex-wrap items-center gap-2">
        <Select aria-label={t('portfolio.visibility')} value={item.visibility} onChange={(e) => onVisibility(e.target.value as Visibility)} className="!w-auto !py-1.5 text-sm">
          {(['private', 'staff', 'employers'] as Visibility[]).map((v) => <option key={v} value={v}>{t(`portfolio.visibility.${v}`)}</option>)}
        </Select>
        {linkable && <a href={addToLinkedinUrl({ name: item.title, org: item.org || 'Al Yamamah University', date: item.end_date ?? item.start_date, url: item.url, credentialId: item.credential_id })} target="_blank" rel="noreferrer noopener" className="inline-flex min-h-11 items-center gap-1 rounded-xl px-2 text-sm font-medium text-brand-600 hover:underline sm:min-h-8"><ExternalLink className="h-4 w-4" aria-hidden />{t('portfolio.addToLinkedin')}</a>}
        <span className="ms-auto flex gap-1">
          <Button size="icon" variant="ghost" aria-label={t('common.edit')} title={t('common.edit')} onClick={onEdit}><Pencil className="h-4 w-4" /></Button>
          {item.verification !== 'university' && <Button size="icon" variant="ghost" aria-label={t('common.delete')} title={t('common.delete')} onClick={onDelete}><Trash2 className="h-4 w-4 text-danger" /></Button>}
        </span>
      </div>
    </li>
  );
}

type Draft = { id?: string; kind: ItemKind; title: string; org: string; start_date: string; end_date: string; description: string; url: string; skills: string; visibility: Visibility; locked?: boolean };
const emptyDraft = (kind: ItemKind): Draft => ({ kind, title: '', org: '', start_date: '', end_date: '', description: '', url: '', skills: '', visibility: 'private' });

function ItemDialog({ draft, onClose, onSaved }: { draft: Draft | null; onClose: () => void; onSaved: () => void }) {
  const { t } = useI18n();
  const toast = useToast();
  const [d, setD] = useState<Draft | null>(draft);
  const [busy, setBusy] = useState(false);
  if (draft && d?.id !== draft.id && d?.kind !== draft.kind) setD(draft);
  const cur = d ?? draft;
  if (!cur) return null;
  const set = (patch: Partial<Draft>) => setD({ ...cur, ...patch });
  const save = async () => {
    setBusy(true);
    const body = { kind: cur.kind, title: cur.title.trim(), org: cur.org.trim(), start_date: cur.start_date || null, end_date: cur.end_date || null, description: cur.description.trim(), url: cur.url.trim() || null, skills: cur.skills.split(',').map((x) => x.trim()).filter(Boolean), visibility: cur.visibility };
    try {
      if (cur.id) await api(`/career/portfolio/items/${cur.id}`, { method: 'PATCH', body });
      else await api('/career/portfolio/items', { body });
      toast.success(t('portfolio.saved'));
      refreshAll('career');
      onSaved();
    } catch (e) { toast.error(errorMessage(e)); } finally { setBusy(false); }
  };
  return (
    <Modal open onClose={onClose} title={cur.id ? t('portfolio.editItem') : t('portfolio.addItem')} footer={<><Button variant="ghost" onClick={onClose}>{t('common.cancel')}</Button><Button loading={busy} disabled={!cur.title.trim()} onClick={() => void save()}>{t('common.save')}</Button></>}>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <Field label={t('portfolio.kind')}><Select value={cur.kind} disabled={!!cur.id} onChange={(e) => set({ kind: e.target.value as ItemKind })}>{(['project', 'experience', 'volunteer', 'certificate', 'award', 'language', 'education'] as ItemKind[]).map((k) => <option key={k} value={k}>{t(`portfolio.kind.${k}`)}</option>)}</Select></Field>
        <Field label={t('portfolio.visibility')}><Select value={cur.visibility} onChange={(e) => set({ visibility: e.target.value as Visibility })}>{(['private', 'staff', 'employers'] as Visibility[]).map((v) => <option key={v} value={v}>{t(`portfolio.visibility.${v}`)}</option>)}</Select></Field>
        <Field label={t('portfolio.title')} required className="sm:col-span-2"><Input value={cur.title} disabled={cur.locked} onChange={(e) => set({ title: e.target.value })} maxLength={160} /></Field>
        <Field label={t('portfolio.org')} className="sm:col-span-2"><Input value={cur.org} disabled={cur.locked} onChange={(e) => set({ org: e.target.value })} maxLength={160} /></Field>
        <Field label={t('portfolio.start')} hint={t('portfolio.dateHint')}><Input value={cur.start_date} disabled={cur.locked} onChange={(e) => set({ start_date: e.target.value })} placeholder="2026-03" /></Field>
        <Field label={t('portfolio.end')} hint={t('portfolio.endHint')}><Input value={cur.end_date} disabled={cur.locked} onChange={(e) => set({ end_date: e.target.value })} placeholder="2026-06" /></Field>
        <Field label={t('portfolio.url')} className="sm:col-span-2"><Input type="url" value={cur.url} onChange={(e) => set({ url: e.target.value })} placeholder="https://" /></Field>
        <Field label={t('portfolio.description')} className="sm:col-span-2"><Textarea value={cur.description} onChange={(e) => set({ description: e.target.value })} maxLength={2000} /></Field>
        <Field label={t('portfolio.skills')} hint={t('portfolio.skillsHint')} className="sm:col-span-2"><Input value={cur.skills} onChange={(e) => set({ skills: e.target.value })} placeholder="React, Node.js" /></Field>
      </div>
      {cur.locked && <p className="mt-3 text-sm text-muted">{t('portfolio.lockedNote')}</p>}
    </Modal>
  );
}

function LinkedinImportCard({ onDone }: { onDone: () => void }) {
  const { t, locale } = useI18n();
  const toast = useToast();
  const fileRef = useRef<HTMLInputElement>(null);
  const [parsed, setParsed] = useState<LinkedinImport | null>(null);
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [useProfile, setUseProfile] = useState(true);
  const [busy, setBusy] = useState(false);
  const read = async (file: File) => {
    setBusy(true);
    try {
      const r = await readLinkedinExport(file);
      setParsed(r);
      setPicked(new Set(r.items.map((i) => i.key)));
    } catch { toast.error(t('portfolio.li.readError')); } finally { setBusy(false); }
  };
  const sample = async () => {
    const res = await fetch('/samples/linkedin-export-sample.zip');
    await read(new File([await res.blob()], 'linkedin-export-sample.zip'));
  };
  const submit = async () => {
    if (!parsed) return;
    setBusy(true);
    try {
      const items = parsed.items.filter((i) => picked.has(i.key)).map((i: DraftItem) => ({ kind: i.kind, title: i.title, org: i.org, start_date: i.start_date, end_date: i.end_date, description: i.description, url: i.url, credential_id: i.credential_id, skills: i.skills, visibility: 'private', source_ref: i.key }));
      const r = await api<{ added: number; skipped: number }>('/career/portfolio/import/linkedin', { body: { items, ...(useProfile ? { headline: parsed.headline || undefined, summary: parsed.summary || undefined } : {}) } });
      if (parsed.skills.length) {
        const p = await api<{ profile: CareerProfile }>('/career/profile');
        const merged = [...new Set([...p.profile.skills, ...parsed.skills])];
        await api('/career/profile', { method: 'PUT', body: { skills: merged.slice(0, 40) } });
      }
      toast.success(t('portfolio.li.done', { n: r.added }), r.skipped ? t('portfolio.li.skipped', { n: r.skipped }) : undefined);
      setParsed(null);
      refreshAll('career');
      onDone();
    } catch (e) { toast.error(errorMessage(e)); } finally { setBusy(false); }
  };
  return (
    <Card as="section" aria-labelledby="li-import-h">
      <SectionTitle id="li-import-h"><span className="flex items-center gap-2"><FileArchive className="h-4 w-4 text-muted" aria-hidden />{t('portfolio.li.title')}</span></SectionTitle>
      {!parsed ? (
        <>
          <ol className="list-decimal space-y-1 ps-5 text-sm">
            <li>{t('portfolio.li.step1')}</li>
            <li>{t('portfolio.li.step2')}</li>
            <li>{t('portfolio.li.step3')}</li>
          </ol>
          <p className="mt-2 text-sm text-muted">{t('portfolio.li.privacy')}</p>
          <input ref={fileRef} type="file" accept=".zip,application/zip" className="sr-only" aria-label={t('portfolio.li.choose')} tabIndex={-1} onChange={(e) => { const f = e.target.files?.[0]; if (f) void read(f); e.target.value = ''; }} />
          <div className="mt-3 flex flex-wrap gap-2">
            <Button icon={<Upload className="h-4 w-4" aria-hidden />} loading={busy} onClick={() => fileRef.current?.click()}>{t('portfolio.li.choose')}</Button>
            <Button variant="outline" disabled={busy} onClick={() => void sample()}>{t('portfolio.li.sample')}</Button>
          </div>
        </>
      ) : (
        <div>
          <p className="text-sm">{t('portfolio.li.review', { files: parsed.filesRead.length, ignored: parsed.filesIgnored })}</p>
          {(parsed.headline || parsed.summary) && <div className="mt-3"><Toggle checked={useProfile} onChange={setUseProfile} label={t('portfolio.li.useProfile')} description={parsed.headline} /></div>}
          <ul className="mt-3 max-h-80 space-y-1 overflow-y-auto rounded-xl border border-line p-2" tabIndex={0} aria-label={t('portfolio.li.items')}>
            {parsed.items.map((i) => (
              <li key={i.key}>
                <label className="flex min-h-11 cursor-pointer items-start gap-3 rounded-lg px-2 py-1.5 hover:bg-line/40">
                  <input type="checkbox" className="mt-1 h-4 w-4 accent-[var(--color-brand-600)]" checked={picked.has(i.key)} onChange={(e) => { const n = new Set(picked); if (e.target.checked) n.add(i.key); else n.delete(i.key); setPicked(n); }} />
                  <span className="min-w-0 flex-1 text-sm">
                    <span dir="auto" className="block font-medium">{i.title}</span>
                    <span className="block text-muted">{t(`portfolio.kind.${i.kind}`)}{i.org ? ` · ${i.org}` : ''}{i.start_date ? ` · ${monthLabel(i.start_date, locale)}` : ''}</span>
                  </span>
                </label>
              </li>
            ))}
          </ul>
          {parsed.skills.length > 0 && <p className="mt-2 text-sm text-muted">{t('portfolio.li.skillsFound', { skills: parsed.skills.join(', ') })}</p>}
          <div className="mt-3 flex flex-wrap gap-2">
            <Button loading={busy} disabled={!picked.size && !parsed.skills.length} onClick={() => void submit()}>{t('portfolio.li.import', { n: picked.size })}</Button>
            <Button variant="ghost" onClick={() => setParsed(null)}>{t('common.cancel')}</Button>
          </div>
        </div>
      )}
    </Card>
  );
}

function AccountsCard({ data, onChanged }: { data: PortfolioData; onChanged: () => void }) {
  const { t, locale } = useI18n();
  const toast = useToast();
  const li = data.accounts.find((a) => a.provider === 'linkedin');
  const gh = data.accounts.find((a) => a.provider === 'github');
  const [liUrl, setLiUrl] = useState('');
  const [ghUser, setGhUser] = useState('');
  const [busy, setBusy] = useState<string | null>(null);
  const run = async (key: string, fn: () => Promise<unknown>, okMsg?: string) => {
    setBusy(key);
    try { await fn(); if (okMsg) toast.success(okMsg); refreshAll('career'); onChanged(); } catch (e) { toast.error(errorMessage(e)); } finally { setBusy(null); }
  };
  return (
    <Card as="section" aria-labelledby="accounts-h">
      <SectionTitle id="accounts-h"><span className="flex items-center gap-2"><Link2 className="h-4 w-4 text-muted" aria-hidden />{t('portfolio.accounts')}</span></SectionTitle>
      <div className="space-y-5">
        <div>
          <h3 className="font-semibold">LinkedIn</h3>
          {li ? (
            <div className="mt-1 space-y-2 text-sm">
              <p className="flex flex-wrap items-center gap-2"><a href={li.url} target="_blank" rel="noreferrer noopener" className="font-medium text-brand-600 hover:underline">{li.url.replace('https://www.', '')}</a>{li.verified ? <Badge tone="success" dot>{t('portfolio.li.verifiedSim')}</Badge> : <Badge tone="neutral">{t('portfolio.li.notVerified')}</Badge>}</p>
              <div className="flex flex-wrap gap-2">
                {!li.verified && <Button size="sm" variant="outline" loading={busy === 'liv'} onClick={() => void run('liv', () => api('/career/portfolio/accounts/linkedin/verify', { method: 'POST' }), t('portfolio.li.verifiedToast'))}>{t('portfolio.li.verify')}</Button>}
                <Button size="sm" variant="ghost" loading={busy === 'lid'} onClick={() => void run('lid', () => api('/career/portfolio/accounts/linkedin', { method: 'DELETE' }))}>{t('portfolio.unlink')}</Button>
              </div>
              <p className="text-muted">{t('portfolio.li.verifyNote')}</p>
            </div>
          ) : (
            <form className="mt-1 flex items-end gap-2" onSubmit={(e) => { e.preventDefault(); void run('li', () => api('/career/portfolio/accounts/linkedin', { method: 'PUT', body: { url: liUrl } }), t('portfolio.li.linked')); }}>
              <Field label={t('portfolio.li.url')} className="min-w-0 flex-1"><Input value={liUrl} onChange={(e) => setLiUrl(e.target.value)} placeholder="https://www.linkedin.com/in/…" inputMode="url" /></Field>
              <Button type="submit" variant="outline" loading={busy === 'li'} disabled={!liUrl.trim()}>{t('portfolio.link')}</Button>
            </form>
          )}
        </div>
        <div>
          <h3 className="font-semibold">GitHub</h3>
          {gh ? (
            <div className="mt-1 space-y-2 text-sm">
              <p className="flex flex-wrap items-center gap-2"><a href={gh.url} target="_blank" rel="noreferrer noopener" className="font-medium text-brand-600 hover:underline">github.com/{gh.handle}</a>{gh.last_synced_at && <span className="text-muted">{t('portfolio.gh.synced', { when: fmtDateTime(gh.last_synced_at, locale) })}</span>}</p>
              {gh.error && <Callout tone="warn">{gh.error}</Callout>}
              {gh.data && (
                <>
                  <div className="flex flex-wrap gap-1">{gh.data.languages.map((l) => <SkillChip key={l.name}>{l.name} · {l.repos}</SkillChip>)}</div>
                  <ul className="divide-y divide-line">
                    {gh.data.repos.slice(0, 5).map((r) => (
                      <li key={r.url}><a href={r.url} target="_blank" rel="noreferrer noopener" className="flex min-h-11 items-center justify-between gap-2 py-1.5 hover:text-brand-600"><span className="min-w-0"><span dir="auto" className="block truncate font-medium">{r.name}</span>{r.description && <span dir="auto" className="block truncate text-muted">{r.description}</span>}</span><span className="num flex shrink-0 items-center gap-1 text-muted">{r.language}{r.stars > 0 && <><Star className="h-3.5 w-3.5" aria-hidden />{r.stars}</>}</span></a></li>
                    ))}
                  </ul>
                </>
              )}
              <div className="flex flex-wrap gap-2">
                <Button size="sm" variant="outline" icon={<RefreshCw className="h-4 w-4" aria-hidden />} loading={busy === 'ghs'} onClick={() => void run('ghs', () => api('/career/portfolio/accounts/github', { method: 'PUT', body: { username: gh.handle } }), t('portfolio.gh.syncedToast'))}>{t('portfolio.gh.sync')}</Button>
                <Button size="sm" variant="ghost" loading={busy === 'ghd'} onClick={() => void run('ghd', () => api('/career/portfolio/accounts/github', { method: 'DELETE' }))}>{t('portfolio.unlink')}</Button>
              </div>
            </div>
          ) : (
            <form className="mt-1 flex items-end gap-2" onSubmit={(e) => { e.preventDefault(); void run('gh', () => api('/career/portfolio/accounts/github', { method: 'PUT', body: { username: ghUser } }), t('portfolio.gh.linked')); }}>
              <Field label={t('portfolio.gh.user')} className="min-w-0 flex-1"><Input value={ghUser} onChange={(e) => setGhUser(e.target.value)} placeholder="username" autoCapitalize="none" autoCorrect="off" spellCheck={false} /></Field>
              <Button type="submit" variant="outline" loading={busy === 'gh'} disabled={!ghUser.trim()}>{t('portfolio.link')}</Button>
            </form>
          )}
          <p className="mt-2 text-sm text-muted">{t('portfolio.gh.note')}</p>
        </div>
      </div>
    </Card>
  );
}

function PrivacyCard({ data, onChanged }: { data: PortfolioData; onChanged: () => void }) {
  const { t } = useI18n();
  const toast = useToast();
  const [confirm, setConfirm] = useState<'linkedin_export' | 'github' | 'all' | null>(null);
  const [busy, setBusy] = useState(false);
  const consent = async (purpose: 'matching' | 'staff_view', granted: boolean) => {
    try { await api('/career/portfolio/consents', { method: 'PUT', body: { purpose, granted } }); refreshAll('career'); onChanged(); } catch (e) { toast.error(errorMessage(e)); }
  };
  const exportJson = async () => {
    try {
      const data = await api<unknown>('/career/portfolio/resume.json');
      const url = URL.createObjectURL(new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' }));
      const a = document.createElement('a'); a.href = url; a.download = 'resume.json'; a.click(); URL.revokeObjectURL(url);
    } catch (e) { toast.error(errorMessage(e)); }
  };
  const erase = async () => {
    if (!confirm) return;
    setBusy(true);
    try { await api(`/career/portfolio/data?scope=${confirm}`, { method: 'DELETE' }); toast.success(t('portfolio.privacy.erased')); setConfirm(null); refreshAll('career'); onChanged(); }
    catch (e) { toast.error(errorMessage(e)); } finally { setBusy(false); }
  };
  return (
    <Card as="section" aria-labelledby="privacy-h">
      <SectionTitle id="privacy-h"><span className="flex items-center gap-2"><ShieldCheck className="h-4 w-4 text-muted" aria-hidden />{t('portfolio.privacy')}</span></SectionTitle>
      <div className="space-y-3">
        <Toggle checked={data.consents.matching.granted} onChange={(v) => void consent('matching', v)} label={t('portfolio.consent.matching')} description={t('portfolio.consent.matchingHint')} />
        <Toggle checked={data.consents.staff_view.granted} onChange={(v) => void consent('staff_view', v)} label={t('portfolio.consent.staff')} description={t('portfolio.consent.staffHint')} />
      </div>
      <div className="mt-4 flex flex-wrap gap-2">
        <Button size="sm" variant="outline" icon={<Download className="h-4 w-4" aria-hidden />} onClick={() => void exportJson()}>{t('portfolio.privacy.export')}</Button>
        <Button size="sm" variant="ghost" onClick={() => setConfirm('linkedin_export')}>{t('portfolio.privacy.eraseLinkedin')}</Button>
        <Button size="sm" variant="ghost" onClick={() => setConfirm('all')}>{t('portfolio.privacy.eraseAll')}</Button>
      </div>
      <p className="mt-2 text-sm text-muted">{t('portfolio.privacy.note')}</p>
      <Modal open={!!confirm} onClose={() => setConfirm(null)} size="sm" title={t('portfolio.privacy.confirmTitle')} footer={<><Button variant="ghost" onClick={() => setConfirm(null)}>{t('common.cancel')}</Button><Button variant="danger" loading={busy} onClick={() => void erase()}>{t('common.delete')}</Button></>}>
        <p className="text-sm">{confirm ? t(`portfolio.privacy.confirm.${confirm}`) : ''}</p>
      </Modal>
    </Card>
  );
}

function SkillGaps() {
  const { t, l, locale } = useI18n();
  const toast = useToast();
  const gaps = useQuery(() => api<{ items: SkillGap[]; basis: { saved: number; tracked: number } }>('/career/skill-gaps'), [], { refreshOn: ['career'] });
  const [busy, setBusy] = useState<string | null>(null);
  const createTask = async (g: SkillGap) => {
    setBusy(g.skill);
    try { const r = await api<{ created: boolean }>('/career/skill-gaps/task', { body: { skill: g.skill, effort_min: 90 } }); toast.success(r.created ? t('career.taskCreated') : t('career.taskExists'), g.skill); refreshAll('career', 'study'); } catch (e) { toast.error(errorMessage(e)); } finally { setBusy(null); }
  };
  return (
    <Card as="section" aria-labelledby="gaps-h">
      <SectionTitle id="gaps-h">{t('career.skillGaps')}</SectionTitle>
      <p className="text-sm text-muted">{t('career.skillGapsBody', { saved: gaps.data?.basis.saved ?? 0, tracked: gaps.data?.basis.tracked ?? 0 })}</p>
      {!!gaps.error && <ErrorState error={gaps.error} onRetry={() => void gaps.refetch()} />}
      {gaps.loading && !gaps.data && <Skeleton className="mt-3 h-32" />}
      {gaps.data && gaps.data.items.length === 0 && <EmptyState className="mt-3" icon={<GraduationCap className="h-6 w-6" />} title={t('career.noGaps')} body={t('career.noGapsBody')} />}
      <ul className="mt-3 space-y-3">
        {gaps.data?.items.map((g) => (
          <li key={g.skill} className="card-2 p-3 text-sm">
            <div className="flex flex-wrap items-center gap-2"><SkillChip tone="missing">{g.skill}</SkillChip><span className="text-muted">{t('career.neededBy', { n: g.opportunities.length })}: {g.opportunities.map((o) => o.company).join(', ')}</span></div>
            <div className="mt-2 flex flex-wrap items-center gap-2">
              {g.workshops.map((w) => <Link key={w.id} to={w.link} className="inline-flex min-h-11 items-center gap-1 rounded-lg border border-line bg-surface px-2 hover:border-brand-400 sm:min-h-8"><BookOpen className="h-3.5 w-3.5 text-brand-600" aria-hidden />{l(w.title_en, w.title_ar)} · {fmtDateTime(w.start_at, locale)}</Link>)}
              {g.task ? <Link to={g.task.link} className="ms-auto inline-flex min-h-11 items-center gap-1 text-success sm:min-h-8"><ListTodo className="h-3.5 w-3.5" aria-hidden />{t('career.taskExists')}</Link> : <Button size="sm" variant="outline" className="ms-auto" loading={busy === g.skill} icon={<ListTodo className="h-4 w-4" aria-hidden />} onClick={() => void createTask(g)}>{t('career.createTask')}</Button>}
            </div>
          </li>
        ))}
      </ul>
    </Card>
  );
}

function CvCard({ profile, onChanged }: { profile: CareerProfile; onChanged: () => void }) {
  const { t, locale } = useI18n();
  const toast = useToast();
  const [label, setLabel] = useState('');
  const add = async () => {
    if (!label.trim()) return;
    try { await api('/career/profile/cv', { body: { label: label.trim() } }); setLabel(''); toast.success(t('career.cvAdded')); refreshAll('career'); onChanged(); } catch (e) { toast.error(errorMessage(e)); }
  };
  return (
    <Card as="section" aria-labelledby="cv-h">
      <SectionTitle id="cv-h">{t('career.cvVersions')}</SectionTitle>
      <ul className="mb-2 space-y-1 text-sm">{profile.cv_versions.map((v) => <li key={v.id} className="flex items-center justify-between rounded-lg bg-surface-2 px-3 py-1.5"><span>{v.label}</span><span className="text-muted">{fmtDate(v.updated_at, locale)}</span></li>)}{profile.cv_versions.length === 0 && <li className="text-muted">{t('common.none')}</li>}</ul>
      <form className="flex gap-2" onSubmit={(e) => { e.preventDefault(); void add(); }}><Input aria-label={t('career.cvLabelPlaceholder')} value={label} onChange={(e) => setLabel(e.target.value)} placeholder={t('career.cvLabelPlaceholder')} /><Button type="submit" variant="outline" disabled={!label.trim()}>{t('career.add')}</Button></form>
      <p className="mt-1 text-sm text-muted">{t('career.cvNote')}</p>
    </Card>
  );
}

function AboutDialog({ open, profile, onClose, onSaved }: { open: boolean; profile: CareerProfile; onClose: () => void; onSaved: () => void }) {
  const { t } = useI18n();
  const toast = useToast();
  const [f, setF] = useState(profile);
  const [skill, setSkill] = useState('');
  const [busy, setBusy] = useState(false);
  const save = async () => {
    setBusy(true);
    try { await api('/career/profile', { method: 'PUT', body: { headline: f.headline, summary: f.summary, availability: f.availability, skills: f.skills } }); toast.success(t('career.profileSaved')); refreshAll('career'); onSaved(); }
    catch (e) { toast.error(errorMessage(e)); } finally { setBusy(false); }
  };
  const add = () => { const s = skill.trim(); if (s && !f.skills.some((x) => x.toLowerCase() === s.toLowerCase())) setF({ ...f, skills: [...f.skills, s] }); setSkill(''); };
  return (
    <Modal open={open} onClose={onClose} title={t('portfolio.editAbout')} footer={<><Button variant="ghost" onClick={onClose}>{t('common.cancel')}</Button><Button loading={busy} onClick={() => void save()}>{t('common.save')}</Button></>}>
      <div className="space-y-3">
        <Field label={t('career.headline')}><Input value={f.headline} onChange={(e) => setF({ ...f, headline: e.target.value })} maxLength={140} /></Field>
        <Field label={t('career.summary')}><Textarea value={f.summary} onChange={(e) => setF({ ...f, summary: e.target.value })} maxLength={2000} /></Field>
        <Field label={t('career.availability')} hint={t('career.availabilityHint')}><Input value={f.availability} onChange={(e) => setF({ ...f, availability: e.target.value })} /></Field>
        <Field label={t('portfolio.selfSkills')} hint={t('portfolio.selfSkillsHint')}>
          <div className="mb-2 flex flex-wrap gap-1.5">{f.skills.map((s) => <SkillChip key={s} onRemove={() => setF({ ...f, skills: f.skills.filter((x) => x !== s) })}>{s}</SkillChip>)}</div>
          <div className="flex gap-2"><Input value={skill} onChange={(e) => setSkill(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); add(); } }} placeholder={t('career.addSkill')} /><Button type="button" variant="outline" icon={<Plus className="h-4 w-4" aria-hidden />} onClick={add}>{t('career.add')}</Button></div>
        </Field>
      </div>
    </Modal>
  );
}

/** Portfolio strength as a ring on the dark hero (white text, gold arc). */
function StrengthRing({ done, total, label }: { done: number; total: number; label: string }) {
  const size = 76, r = (size - 8) / 2, c = 2 * Math.PI * r, pct = total ? done / total : 0;
  return (
    <div className="flex shrink-0 flex-col items-center gap-1">
      <div className="relative" style={{ width: size, height: size }} role="img" aria-label={`${label}: ${done}/${total}`}>
        <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="-rotate-90" aria-hidden>
          <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="rgba(255,255,255,0.15)" strokeWidth={6} />
          <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="#e2c79c" strokeWidth={6} strokeLinecap="round" strokeDasharray={c} strokeDashoffset={c * (1 - pct)} />
        </svg>
        <span className="num absolute inset-0 grid place-items-center text-lg font-bold">{done}/{total}</span>
      </div>
      <span className="text-xs font-medium text-white/70">{label}</span>
    </div>
  );
}

/** What the portfolio unlocks: best-matching co-ops/internships and open competitions that fit proven skills. */
function Suggestions() {
  const { t, locale } = useI18n();
  const { user } = useSession();
  const opps = useQuery(() => api<OppList>('/career/opportunities', { query: { sort: 'match' } }), [user?.id], { refreshOn: ['career'] });
  const comps = useQuery(() => api<CompetitionList>('/career/competitions', { query: { segment: 'open' } }), [user?.id], { refreshOn: ['career'] });
  const jobs = (opps.data?.items ?? []).filter((o) => o.type !== 'competition' && !o.expired && !o.applicationId && o.match.eligible !== false)
    .sort((a, b) => Number(b.match.eligible === true) - Number(a.match.eligible === true) || b.match.score - a.match.score).slice(0, 3);
  const contests = (comps.data?.items ?? []).filter((c) => !c.entry || c.entry.status === 'interested')
    .sort((a, b) => b.fit.length - a.fit.length || a.days_left - b.days_left).slice(0, 3);
  return (
    <section aria-labelledby="suggest-h" className="card p-5">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div>
          <h2 id="suggest-h" className="text-base font-semibold">{t('portfolio.suggest.title')}</h2>
          <p className="text-sm text-muted">{t('portfolio.suggest.body')}</p>
        </div>
      </div>
      <div className="mt-4 grid grid-cols-1 gap-6 lg:grid-cols-2">
        <div className="min-w-0">
          <h3 className="mb-2 flex items-center gap-2 text-sm font-semibold"><Briefcase className="h-4 w-4 text-brand-600" aria-hidden />{t('portfolio.suggest.jobs')}</h3>
          {opps.loading && !opps.data && <Skeleton className="h-40" />}
          {opps.data && jobs.length === 0 && <p className="text-sm text-muted">{t('portfolio.suggest.noJobs')}</p>}
          <ul className="space-y-2">
            {jobs.map((o) => (
              <li key={o.id}>
                <Link to={`/career?open=${o.id}`} className="flex min-h-11 items-start gap-3 rounded-2xl border border-line p-3 transition hover:border-brand-400">
                  <MatchRing score={o.match.score} size={44} />
                  <span className="min-w-0 flex-1">
                    <span dir="auto" className="block font-semibold leading-snug rtl:text-right">{o.title}</span>
                    <span className="block text-sm text-muted">{o.company} · {oppTypeLabel(t, o.type)}{o.deadline ? ` · ${fmtDate(o.deadline, locale, { year: undefined })}` : ''}</span>
                    {o.match.explain?.[0] && <span className="mt-1 block text-sm">{explainText(t, o.match.explain[0])}</span>}
                    {o.match.eligible === true && <span className="mt-1 inline-flex items-center gap-1 text-sm font-medium text-success"><CheckCircle2 className="h-4 w-4" aria-hidden />{t('career.eligible')}</span>}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
          <Link to="/career" className="mt-2 inline-flex min-h-11 items-center gap-1 text-sm font-medium text-brand-600 hover:underline sm:min-h-8">{t('portfolio.suggest.allJobs')}<ArrowRight className="h-4 w-4 rtl:rotate-180" aria-hidden /></Link>
        </div>
        <div className="min-w-0">
          <h3 className="mb-2 flex items-center gap-2 text-sm font-semibold"><Trophy className="h-4 w-4 text-brand-600" aria-hidden />{t('portfolio.suggest.comps')}</h3>
          {comps.loading && !comps.data && <Skeleton className="h-40" />}
          {comps.data && contests.length === 0 && <p className="text-sm text-muted">{t('comp.empty.open')}</p>}
          <ul className="space-y-2">
            {contests.map((c) => (
              <li key={c.id}>
                <Link to={`/competitions?id=${c.id}`} className="flex min-h-11 items-start gap-3 rounded-2xl border border-line p-3 transition hover:border-brand-400">
                  <span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-gold-100 text-gold-700 dark:bg-gold-700/25"><Trophy className="h-5 w-5" aria-hidden /></span>
                  <span className="min-w-0 flex-1">
                    <span dir="auto" className="block font-semibold leading-snug rtl:text-right">{c.title}</span>
                    <span className="block text-sm text-muted">{t(`comp.kind.${c.kind}`)} · {t('comp.closesIn', { n: c.days_left, date: fmtDate(c.registration_deadline, locale, { year: undefined }) })}</span>
                    {c.fit.length > 0 && <span className="mt-1 inline-flex items-center gap-1 text-sm font-medium text-success"><CheckCircle2 className="h-4 w-4" aria-hidden />{t('comp.goodFit', { skills: c.fit.join(', ') })}</span>}
                    {c.entry?.status === 'interested' && <Badge tone="info" className="ms-2">{t('comp.status.interested')}</Badge>}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
          <Link to="/competitions" className="mt-2 inline-flex min-h-11 items-center gap-1 text-sm font-medium text-brand-600 hover:underline sm:min-h-8">{t('portfolio.suggest.allComps')}<ArrowRight className="h-4 w-4 rtl:rotate-180" aria-hidden /></Link>
        </div>
      </div>
    </section>
  );
}

export function Portfolio() {
  const { t, l, locale } = useI18n();
  const { user } = useSession();
  const toast = useToast();
  const q = useQuery(() => api<PortfolioData>('/career/portfolio'), [user?.id], { refreshOn: ['career', 'persona'] });
  const [draft, setDraft] = useState<Draft | null>(null);
  const [aboutOpen, setAboutOpen] = useState(false);
  if (q.error) return <ErrorState error={q.error} onRetry={() => void q.refetch()} />;
  if (!q.data) return <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1fr)_380px]"><Skeleton className="h-96" /><Skeleton className="h-96" /></div>;
  const d = q.data;
  const byKind = (...k: ItemKind[]) => d.items.filter((i) => k.includes(i.kind));
  const edit = (i: PortfolioItem) => setDraft({ id: i.id, kind: i.kind, title: i.title, org: i.org, start_date: i.start_date ?? '', end_date: i.end_date ?? '', description: i.description, url: i.url ?? '', skills: i.skills.join(', '), visibility: i.visibility, locked: i.verification === 'university' });
  const del = async (i: PortfolioItem) => { try { await api(`/career/portfolio/items/${i.id}`, { method: 'DELETE' }); toast.info(t('portfolio.deleted')); refreshAll('career'); void q.refetch(); } catch (e) { toast.error(errorMessage(e)); } };
  const vis = async (i: PortfolioItem, v: Visibility) => { try { await api(`/career/portfolio/items/${i.id}`, { method: 'PATCH', body: { visibility: v } }); void q.refetch(); } catch (e) { toast.error(errorMessage(e)); } };
  const list = (items: PortfolioItem[], emptyKey: string, kind: ItemKind) => items.length === 0
    ? <p className="text-sm text-muted">{t(emptyKey)} <button type="button" className="inline-flex min-h-11 items-center font-medium text-brand-600 hover:underline sm:min-h-8" onClick={() => setDraft(emptyDraft(kind))}>{t('portfolio.addOne')}</button></p>
    : <ul className="divide-y divide-line">{items.map((i) => <ItemRow key={i.id} item={i} onEdit={() => edit(i)} onDelete={() => void del(i)} onVisibility={(v) => void vis(i, v)} />)}</ul>;
  const addBtn = (kind: ItemKind) => <Button size="sm" variant="outline" icon={<Plus className="h-4 w-4" aria-hidden />} onClick={() => setDraft(emptyDraft(kind))}>{t('portfolio.add')}</Button>;
  const accountChip = (provider: 'linkedin' | 'github') => {
    const a = d.accounts.find((x) => x.provider === provider);
    const label = provider === 'linkedin' ? 'LinkedIn' : 'GitHub';
    if (!a) return <a href="#accounts-h" className="inline-flex min-h-9 items-center gap-1.5 rounded-full border border-dashed border-white/30 px-3 text-sm text-white/80 hover:border-gold-300 hover:text-white"><Plus className="h-3.5 w-3.5" aria-hidden />{t('portfolio.connect', { name: label })}</a>;
    return <a href={a.url} target="_blank" rel="noreferrer noopener" className="inline-flex min-h-9 items-center gap-1.5 rounded-full bg-white/10 px-3 text-sm font-medium text-white hover:bg-white/15">{provider === 'github' ? <Code2 className="h-3.5 w-3.5" aria-hidden /> : <Link2 className="h-3.5 w-3.5" aria-hidden />}{label}{a.verified && <CheckCircle2 className="h-3.5 w-3.5 text-gold-300" aria-label={t('portfolio.li.verifiedSim')} />}</a>;
  };
  const strong = d.skills.filter((s) => s.strength >= 0.55);
  const selfOnly = d.skills.filter((s) => s.strength < 0.55);

  return (
    <div className="space-y-6">
      <section aria-labelledby="about-h" className="overflow-hidden rounded-3xl border border-line bg-[linear-gradient(135deg,#1e1b18,#2a2622_55%,#3a2a1a)] p-5 text-white sm:p-6">
        <div className="flex flex-wrap items-start gap-4">
          {user && <Avatar name={user.name_en} color={user.avatar_color} size={64} className="ring-2 ring-gold-300/60" />}
          <div className="min-w-0 flex-1">
            <h2 id="about-h" className="text-xl font-bold leading-tight">{user ? l(user.name_en, user.name_ar) : ''}</h2>
            <p dir="auto" className="mt-0.5 text-sm text-white/90">{d.profile.headline || t('portfolio.noHeadline')}</p>
            <p className="mt-1 text-sm text-white/70">{d.education.program ? `${l(d.education.program.name_en, d.education.program.name_ar)} · ` : ''}{t('portfolio.levelCredits', { level: d.education.level, credits: d.education.credits })}{d.education.gpa !== null ? ` · ${t('portfolio.gpa', { gpa: d.education.gpa.toFixed(2) })}` : ''}</p>
            <div className="mt-3 flex flex-wrap gap-2">
              {accountChip('linkedin')}
              {accountChip('github')}
            </div>
          </div>
          <StrengthRing done={d.completeness.done} total={d.completeness.total} label={t('portfolio.completeness')} />
        </div>
        {d.profile.summary && <p dir="auto" className="mt-4 max-w-[70ch] text-sm text-white/85">{d.profile.summary}</p>}
        <ul className="mt-4 flex flex-wrap gap-2 text-sm" aria-label={t('portfolio.completeness')}>
          {d.completeness.checks.map((c) => (
            <li key={c.key} className={clsx('inline-flex items-center gap-1.5 rounded-full px-3 py-1', c.done ? 'bg-white/10 text-gold-300' : 'border border-white/20 text-white/70')}>
              {c.done ? <CheckCircle2 className="h-4 w-4" aria-hidden /> : <span aria-hidden className="h-3 w-3 rounded-full border-2 border-current" />}
              <span>{t(`portfolio.check.${c.key}`)}</span><span className="sr-only">{c.done ? t('status.done') : t('status.todo')}</span>
            </li>
          ))}
        </ul>
        <div className="mt-5 flex flex-wrap gap-2">
          <button type="button" onClick={() => setAboutOpen(true)} className="inline-flex min-h-11 items-center gap-2 rounded-xl bg-white px-4 text-sm font-semibold text-ink-950 hover:bg-gold-100 sm:min-h-10"><Pencil className="h-4 w-4" aria-hidden />{t('portfolio.editAbout')}</button>
          <button type="button" onClick={openStudentCard} className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-white/25 px-4 text-sm font-semibold text-white hover:bg-white/10 sm:min-h-10"><IdCard className="h-4 w-4" aria-hidden />{t('shell.card')}</button>
        </div>
      </section>

      <Suggestions />

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1fr)_380px]">
        <div className="min-w-0 space-y-6">
          <Section id="skills-h" title={t('portfolio.skillsEvidence')} icon={<Star className="h-4 w-4 text-muted" aria-hidden />}>
            <p className="mb-3 text-sm text-muted">{t('portfolio.skillsExplain')}</p>
            <ul className="space-y-2">
              {strong.map((s) => (
                <li key={s.key} className="grid grid-cols-[minmax(0,1fr)_96px] items-center gap-3 text-sm">
                  <div className="min-w-0">
                    <div className="font-medium">{locale === 'ar' ? s.label_ar : s.label_en}</div>
                    <div className="flex flex-wrap gap-x-3 gap-y-0.5 text-muted">
                      {s.evidence.filter((e) => e.kind !== 'self').sort((a, b) => b.weight - a.weight).slice(0, 3).map((e) => { const I = EVIDENCE_ICON[e.kind]; return <span key={`${e.kind}${e.ref}`} className="inline-flex items-center gap-1"><I className="h-3.5 w-3.5" aria-hidden /><span className="sr-only">{t(`portfolio.evidence.${e.kind}`)}: </span><span dir="auto">{e.ref}</span></span>; })}
                    </div>
                  </div>
                  <Progress label={t('portfolio.strengthOf', { skill: s.label_en })} value={Math.round(s.strength * 100)} tone={s.strength >= 0.8 ? 'success' : 'brand'} />
                </li>
              ))}
            </ul>
            {selfOnly.length > 0 && <p className="mt-3 text-sm text-muted">{t('portfolio.selfOnly', { skills: selfOnly.map((s) => (locale === 'ar' ? s.label_ar : s.label_en)).join(', ') })}</p>}
          </Section>

          <Section id="exp-h" title={t('portfolio.experience')} icon={<Briefcase className="h-4 w-4 text-muted" aria-hidden />} action={addBtn('experience')}>
            {list(byKind('experience', 'volunteer'), 'portfolio.empty.experience', 'experience')}
          </Section>
          <Section id="proj-h" title={t('portfolio.projects')} icon={<FolderGit2 className="h-4 w-4 text-muted" aria-hidden />} action={addBtn('project')}>
            {list(byKind('project'), 'portfolio.empty.projects', 'project')}
          </Section>
          <Section id="awards-h" title={t('portfolio.awards')} icon={<Award className="h-4 w-4 text-muted" aria-hidden />} action={addBtn('certificate')}>
            {list(byKind('award', 'certificate'), 'portfolio.empty.awards', 'certificate')}
            <p className="mt-3 text-sm text-muted">{t('portfolio.awardsNote')} <Link to="/competitions" className="font-medium text-brand-600 hover:underline">{t('career.tab.competitions')}</Link></p>
            <CampusActivities />
          </Section>
          <Section id="edu-h" title={t('portfolio.education')} icon={<GraduationCap className="h-4 w-4 text-muted" aria-hidden />}>
            {d.education.program && <p className="text-sm"><span className="font-medium">{l(d.education.program.name_en, d.education.program.name_ar)}</span> · Al Yamamah University <Badge tone="success" dot className="ms-1">{t('portfolio.verified.university')}</Badge></p>}
            <ul className="mt-2 grid grid-cols-1 gap-1 text-sm sm:grid-cols-2">
              {d.education.courses.map((c) => <li key={c.course_code} className="flex items-baseline gap-2"><span className="w-16 shrink-0 font-mono font-semibold">{c.course_code}</span><span className="min-w-0"><span className="block truncate">{l(c.title_en, c.title_ar)}</span><span className="text-muted">{c.status === 'enrolled' ? t('status.enrolled') : c.grade ?? t('status.completed')}</span></span></li>)}
            </ul>
            {byKind('education').length > 0 && <div className="mt-3 border-t border-line pt-3">{list(byKind('education'), 'portfolio.empty.projects', 'education')}</div>}
          </Section>
          <Section id="lang-h" title={t('portfolio.languages')} icon={<LanguagesIcon className="h-4 w-4 text-muted" aria-hidden />} action={addBtn('language')}>
            {list(byKind('language'), 'portfolio.empty.languages', 'language')}
          </Section>
        </div>

        <aside className="min-w-0 space-y-6" aria-label={t('portfolio.sidebar')}>
          <AccountsCard data={d} onChanged={() => void q.refetch()} />
          <LinkedinImportCard onDone={() => void q.refetch()} />
          <PrivacyCard data={d} onChanged={() => void q.refetch()} />
          <CvCard profile={d.profile} onChanged={() => void q.refetch()} />
          <SkillGaps />
        </aside>
      </div>

      {draft && <ItemDialog draft={draft} onClose={() => setDraft(null)} onSaved={() => { setDraft(null); void q.refetch(); }} />}
      {aboutOpen && <AboutDialog open profile={d.profile} onClose={() => setAboutOpen(false)} onSaved={() => { setAboutOpen(false); void q.refetch(); }} />}
    </div>
  );
}

/** Club participation verified by a lead or a QR check-in (it used to live on the digital card page). */
function CampusActivities() {
  const { t, l, locale } = useI18n();
  const q = useQuery(() => api<CardData>('/campus/me/card'), [], { refreshOn: ['campus'] });
  const items = q.data?.achievements ?? [];
  if (!items.length) return null;
  return (
    <div className="mt-5 border-t border-line pt-4">
      <h3 id="activities-h" className="mb-2 text-sm font-semibold">{t('portfolio.campusActivities')}</h3>
      <ul className="space-y-2">
        {items.map((a) => (
          <li key={a.id} className="flex items-start gap-3 text-sm">
            <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-success" aria-hidden />
            <span className="min-w-0">
              <span className="block font-medium">{l(a.title_en, a.title_ar || a.title_en)}</span>
              <span className="block text-xs text-muted">{[a.club_name_en, a.event_start_at ? fmtDate(a.event_start_at, locale) : null, a.verified_by_name ? `${t('campus.card.verifiedBy')} ${a.verified_by_name}` : null].filter(Boolean).join(' · ')}</span>
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
