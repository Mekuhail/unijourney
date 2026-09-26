import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router';
import { BookOpen, Bookmark, BookmarkCheck, ThumbsUp, Download, Eye, ListPlus, Flag, Upload, FileText, Sparkles } from 'lucide-react';
import clsx from 'clsx';
import { useI18n } from '@/i18n';
import { useQuery } from '@/lib/useQuery';
import { api, apiUpload, errorMessage } from '@/lib/api';
import { refreshAll } from '@/lib/bus';
import { useToast } from '@/components/ui/toast';
import { PageHeader } from '@/components/ui/PageHeader';
import { Avatar, Badge, Button, Callout, Card, EmptyState, ErrorState, Field, Input, Modal, Select, Skeleton, StatusPill, Tabs, Textarea } from '@/components/ui';
import { fmtDate } from '@/lib/format';
import type { DocumentMeta } from '@shared/types';
import type { Resource, ResourceList, ResourcePreview, SummaryResult } from '../types';

const TYPES = ['notes', 'slides', 'summary', 'past_exam', 'cheatsheet', 'lab'];
const TERMS = ['2026-1', '2025-3', '2025-2', '2025-1', '2024-2', '2024-1'];

export function ResourceCard({ r, onPreview, onTask, onReport }: { r: Resource; onPreview: (r: Resource) => void; onTask: (r: Resource) => void; onReport: (r: Resource) => void }) {
  const { t, l, locale } = useI18n();
  const toast = useToast();
  const [busy, setBusy] = useState<'vote' | 'bm' | null>(null);
  const toggle = async (kind: 'helpful' | 'bookmark') => {
    setBusy(kind === 'helpful' ? 'vote' : 'bm');
    try { await api(`/campus/resources/${r.id}/${kind}`, { method: 'POST', body: {} }); refreshAll('campus'); }
    catch (e) { toast.error(errorMessage(e)); } finally { setBusy(null); }
  };
  return (
    <article className={clsx('card flex flex-col p-4', r.status === 'pending' && 'border-dashed')}>
      <div className="flex flex-wrap items-center gap-1.5">
        <Badge tone="brand">{r.course_code}</Badge>
        <Badge tone="neutral">{t(`campus.resources.types.${r.type}`)}</Badge>
        <Badge tone="neutral">{locale === 'ar' ? r.term_label_ar : r.term_label}</Badge>
        {r.status !== 'published' && <StatusPill status={r.status} />}
      </div>
      <button type="button" onClick={() => onPreview(r)} className="mt-2 text-start font-semibold leading-snug hover:text-brand-600">{r.title}</button>
      {(r.course_title_en || r.course_title_ar) && <div className="text-xs text-muted">{l(r.course_title_en, r.course_title_ar)}</div>}
      <p className="mt-1.5 line-clamp-2 flex-1 text-sm text-muted">{r.description}</p>
      {r.status === 'pending' && r.is_owner && <div className="mt-2 text-xs text-warn">{t('campus.resources.pendingNote')}</div>}
      {r.moderation_note && r.status === 'rejected' && <div className="mt-2 text-xs text-danger">{r.moderation_note}</div>}
      <div className="mt-3 flex items-center gap-2 text-xs text-muted">
        {r.author && <><Avatar name={r.author.name_en} color={r.author.avatar_color} size={20} /><span className="truncate">{t('campus.resources.byAuthor')} {l(r.author.name_en, r.author.name_ar)}</span></>}
        <span className="ms-auto num">{r.pages} {t('campus.resources.pages')} · {r.downloads} {t('campus.resources.downloads')} · {fmtDate(r.created_at, locale)}</span>
      </div>
      <div className="mt-3 flex flex-wrap items-center gap-1.5 border-t border-line pt-3">
        <Button size="sm" variant={r.voted ? 'primary' : 'outline'} loading={busy === 'vote'} icon={<ThumbsUp className="h-3.5 w-3.5" />} onClick={() => void toggle('helpful')} aria-pressed={r.voted}>{r.helpful_count}</Button>
        <Button size="sm" variant={r.bookmarked ? 'gold' : 'outline'} loading={busy === 'bm'} icon={r.bookmarked ? <BookmarkCheck className="h-3.5 w-3.5" /> : <Bookmark className="h-3.5 w-3.5" />} onClick={() => void toggle('bookmark')} aria-pressed={r.bookmarked}>{t('campus.resources.bookmark')}</Button>
        <Button size="sm" variant="secondary" icon={<Eye className="h-3.5 w-3.5" />} onClick={() => onPreview(r)}>{t('campus.resources.preview')}</Button>
        <Button size="sm" variant="secondary" icon={<ListPlus className="h-3.5 w-3.5" />} onClick={() => onTask(r)}>{t('campus.resources.addTask')}</Button>
        <button type="button" className="ms-auto rounded-lg p-1.5 text-muted hover:bg-line/60 hover:text-danger" title={t('campus.resources.report')} aria-label={t('campus.resources.report')} onClick={() => onReport(r)}><Flag className="h-3.5 w-3.5" /></button>
      </div>
    </article>
  );
}

export function PreviewModal({ resource, onClose, onTask }: { resource: Resource | null; onClose: () => void; onTask: (r: Resource) => void }) {
  const { t } = useI18n();
  const toast = useToast();
  const [tab, setTab] = useState<'text' | 'pdf'>('text');
  const [summary, setSummary] = useState<SummaryResult | null>(null);
  const [busy, setBusy] = useState(false);
  const q = useQuery(() => api<ResourcePreview>(`/campus/resources/${resource!.id}/preview`), [resource?.id], { enabled: !!resource });
  useEffect(() => { setSummary(null); setTab('text'); }, [resource?.id]);
  const summarise = async () => {
    if (!resource) return;
    setBusy(true);
    try { setSummary(await api<SummaryResult>(`/campus/resources/${resource.id}/summary`, { method: 'POST', body: {} })); } catch (e) { toast.error(errorMessage(e)); } finally { setBusy(false); }
  };
  const p = q.data;
  return (
    <Modal open={!!resource} onClose={onClose} title={resource?.title ?? ''} size="xl" description={resource ? `${resource.course_code} · ${t(`campus.resources.types.${resource.type}`)}` : undefined}
      footer={<>{p?.file_url && <a href={`/api/campus/resources/${resource!.id}/download`} target="_blank" rel="noreferrer" className="inline-flex h-10 items-center gap-2 rounded-xl border border-line px-4 text-sm font-medium hover:border-brand-400"><Download className="h-4 w-4" />{t('campus.resources.download')}</a>}<Button variant="secondary" icon={<ListPlus className="h-4 w-4" />} onClick={() => resource && onTask(resource)}>{t('campus.resources.addTask')}</Button><Button variant="gold" loading={busy} icon={<Sparkles className="h-4 w-4" />} onClick={() => void summarise()} disabled={!p?.content_text}>{t('campus.resources.summary')}</Button></>}>
      {q.loading && <Skeleton className="h-64" />}
      {q.error ? <ErrorState error={q.error} onRetry={() => void q.refetch()} /> : null}
      {p && (
        <div className="space-y-4">
          <Tabs value={tab} onChange={setTab} className="w-fit" items={[{ value: 'text', label: t('campus.resources.text'), icon: <FileText className="h-4 w-4" /> }, { value: 'pdf', label: t('campus.resources.pdf'), icon: <BookOpen className="h-4 w-4" /> }]} />
          {summary && (
            <Callout tone="gold" title={summary.label}>
              <ul className="mt-1 list-disc space-y-1 ps-5 text-sm">{summary.points.map((pt, i) => <li key={i}>{pt.text} <span className="text-xs text-muted">[{t('campus.resources.paragraph')} {pt.citation.paragraph}, p.{pt.citation.page}]</span></li>)}</ul>
              <div className="mt-2 text-xs text-muted">{summary.note} {t('campus.resources.summaryNote')}</div>
            </Callout>
          )}
          {tab === 'text' && (p.paragraphs.length ? <div className="space-y-3 text-sm leading-relaxed">{p.paragraphs.map((para, i) => <p key={i}><span className="me-2 rounded bg-line/60 px-1.5 py-0.5 text-[10px] font-semibold text-muted">P{i + 1}</span>{para}</p>)}</div> : <EmptyState title={t('common.empty')} />)}
          {tab === 'pdf' && (p.file_url ? <iframe title={p.title} src={p.file_url} className="h-[60vh] w-full rounded-xl border border-line bg-white" /> : <EmptyState title={t('common.empty')} />)}
        </div>
      )}
    </Modal>
  );
}

export function StudyTaskModal({ resource, onClose }: { resource: Resource | null; onClose: () => void }) {
  const { t } = useI18n();
  const toast = useToast();
  const nav = useNavigate();
  const [form, setForm] = useState({ title: '', effort: 45, deadline: '' });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => { if (resource) setForm({ title: `Study: ${resource.title}`, effort: 45, deadline: '' }); }, [resource]);
  const submit = async () => {
    if (!resource) return;
    setBusy(true); setError(null);
    try {
      await api(`/campus/resources/${resource.id}/study-task`, { body: { title: form.title, effort_min: Number(form.effort), deadline: form.deadline || null } });
      toast.success(t('campus.resources.taskCreated')); refreshAll('study'); onClose();
    } catch (e) { setError(errorMessage(e)); } finally { setBusy(false); }
  };
  return (
    <Modal open={!!resource} onClose={onClose} title={t('campus.resources.addTask')} size="sm" description={resource?.course_code} footer={<><Button variant="ghost" onClick={() => nav('/academics/study')}>{t('campus.resources.openPlanner')}</Button><Button loading={busy} onClick={() => void submit()}>{t('common.save')}</Button></>}>
      <div className="space-y-3">
        <Field label={t('campus.resources.taskTitle')} required><Input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} /></Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label={t('campus.resources.effort')} required><Input type="number" min={5} max={600} value={form.effort} onChange={(e) => setForm({ ...form, effort: Number(e.target.value) })} /></Field>
          <Field label={t('campus.resources.deadline')}><Input type="date" value={form.deadline} onChange={(e) => setForm({ ...form, deadline: e.target.value })} /></Field>
        </div>
        {error && <Callout tone="danger">{error}</Callout>}
      </div>
    </Modal>
  );
}

function ReportModal({ resource, onClose }: { resource: Resource | null; onClose: () => void }) {
  const { t } = useI18n();
  const toast = useToast();
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const submit = async () => {
    if (!resource) return;
    setBusy(true); setError(null);
    try { await api(`/campus/resources/${resource.id}/report`, { body: { reason } }); toast.success(t('campus.resources.reported')); refreshAll('campus'); setReason(''); onClose(); }
    catch (e) { setError(errorMessage(e)); } finally { setBusy(false); }
  };
  return (
    <Modal open={!!resource} onClose={onClose} title={t('campus.resources.report')} size="sm" description={resource?.title} footer={<><Button variant="ghost" onClick={onClose}>{t('common.cancel')}</Button><Button variant="danger" loading={busy} disabled={reason.trim().length < 5} onClick={() => void submit()}>{t('common.submit')}</Button></>}>
      <Field label={t('campus.resources.reportReason')} required><Textarea value={reason} onChange={(e) => setReason(e.target.value)} /></Field>
      {error && <div className="mt-2"><Callout tone="danger">{error}</Callout></div>}
    </Modal>
  );
}

function UploadModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { t } = useI18n();
  const toast = useToast();
  const [form, setForm] = useState({ course_code: '', term: '2026-1', type: 'notes', title: '', description: '', content_text: '', rights: false });
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const submit = async () => {
    if (!file) { setError(t('campus.resources.chooseFile')); return; }
    setBusy(true); setError(null);
    try {
      const doc = await apiUpload<DocumentMeta>('/documents', file, { kind: 'resource', label: form.title });
      await api('/campus/resources', { body: { course_code: form.course_code, term: form.term, type: form.type, title: form.title, description: form.description, content_text: form.content_text || undefined, documentId: doc.id, rights_confirmed: form.rights } });
      toast.success(t('campus.resources.uploadDone')); refreshAll('campus'); onClose();
      setForm({ course_code: '', term: '2026-1', type: 'notes', title: '', description: '', content_text: '', rights: false }); setFile(null);
    } catch (e) { setError(errorMessage(e)); } finally { setBusy(false); }
  };
  return (
    <Modal open={open} onClose={onClose} title={t('campus.resources.uploadTitle')} description={t('campus.resources.uploadHint')} footer={<><Button variant="ghost" onClick={onClose}>{t('common.cancel')}</Button><Button loading={busy} disabled={!form.rights || !file || form.title.length < 4 || form.course_code.length < 5} icon={<Upload className="h-4 w-4" />} onClick={() => void submit()}>{t('common.submit')}</Button></>}>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <Field label={t('campus.resources.course')} required hint="e.g. SWE 302"><Input value={form.course_code} onChange={(e) => setForm({ ...form, course_code: e.target.value })} placeholder="CIS 321" /></Field>
        <Field label={t('campus.resources.term')} required><Select value={form.term} onChange={(e) => setForm({ ...form, term: e.target.value })}>{TERMS.map((x) => <option key={x} value={x}>{x}</option>)}</Select></Field>
        <Field label={t('campus.resources.type')} required><Select value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value })}>{TYPES.map((x) => <option key={x} value={x}>{t(`campus.resources.types.${x}`)}</option>)}</Select></Field>
        <Field label={t('campus.resources.file')} required><input type="file" accept="application/pdf,image/png,image/jpeg,text/plain" onChange={(e) => setFile(e.target.files?.[0] ?? null)} className="block w-full text-sm file:me-3 file:rounded-lg file:border-0 file:bg-brand-500 file:px-3 file:py-2 file:text-sm file:font-medium file:text-white" /></Field>
        <Field label={t('campus.resources.title_field')} required className="sm:col-span-2"><Input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} /></Field>
        <Field label={t('campus.resources.description')} className="sm:col-span-2"><Textarea value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} className="min-h-[64px]" /></Field>
        <Field label={t('campus.resources.contentText')} className="sm:col-span-2"><Textarea value={form.content_text} onChange={(e) => setForm({ ...form, content_text: e.target.value })} className="min-h-[80px]" /></Field>
        <label className="flex items-start gap-2 text-sm sm:col-span-2"><input type="checkbox" checked={form.rights} onChange={(e) => setForm({ ...form, rights: e.target.checked })} className="mt-1 h-4 w-4 accent-brand-500" /><span>{t('campus.resources.rights')}</span></label>
        {error && <div className="sm:col-span-2"><Callout tone="danger">{error}</Callout></div>}
      </div>
    </Modal>
  );
}

export function ResourcesPage() {
  const { t, locale } = useI18n();
  const [params, setParams] = useSearchParams();
  const [qText, setQText] = useState(params.get('q') ?? '');
  const [debounced, setDebounced] = useState(qText);
  useEffect(() => { const id = setTimeout(() => setDebounced(qText), 250); return () => clearTimeout(id); }, [qText]);
  const scope = (params.get('mine') ? 'mine' : params.get('bookmarked') ? 'bookmarked' : 'all') as 'all' | 'mine' | 'bookmarked';
  const course = params.get('course') ?? '', term = params.get('term') ?? '', type = params.get('type') ?? '', sort = (params.get('sort') ?? 'helpful') as 'helpful' | 'newest' | 'downloads';
  const set = (patch: Record<string, string | null>) => { const p = new URLSearchParams(params); for (const [k, v] of Object.entries(patch)) { if (v) p.set(k, v); else p.delete(k); } setParams(p, { replace: true }); };
  const q = useQuery(() => api<ResourceList>('/campus/resources', { query: { q: debounced, course, term, type, sort, mine: scope === 'mine' ? 1 : undefined, bookmarked: scope === 'bookmarked' ? 1 : undefined } }), [debounced, course, term, type, sort, scope], { refreshOn: ['campus'] });
  const [preview, setPreview] = useState<Resource | null>(null);
  const [task, setTask] = useState<Resource | null>(null);
  const [report, setReport] = useState<Resource | null>(null);
  const [upload, setUpload] = useState(false);
  const facets = q.data?.facets;
  const items = useMemo(() => q.data?.items ?? [], [q.data]);
  return (
    <div>
      <PageHeader eyebrow={t('campus.hub.eyebrow')} title={t('campus.resources.title')} subtitle={t('campus.resources.subtitle')} actions={<Button icon={<Upload className="h-4 w-4" />} onClick={() => setUpload(true)}>{t('campus.resources.upload')}</Button>} />
      <Card className="mb-4 space-y-3">
        <div className="flex flex-col gap-3 md:flex-row md:items-center">
          <Input value={qText} onChange={(e) => setQText(e.target.value)} placeholder={t('campus.resources.searchPlaceholder')} aria-label={t('common.search')} className="md:flex-1" />
          <Tabs value={scope} onChange={(v) => set({ mine: v === 'mine' ? '1' : null, bookmarked: v === 'bookmarked' ? '1' : null })} items={[{ value: 'all', label: t('campus.resources.all') }, { value: 'bookmarked', label: t('campus.resources.bookmarked') }, { value: 'mine', label: t('campus.resources.mine') }]} />
        </div>
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-4">
          <Select value={course} onChange={(e) => set({ course: e.target.value || null })} aria-label={t('campus.resources.course')}><option value="">{t('campus.resources.course')}: {t('common.all')}</option>{facets?.courses.map((c) => <option key={c.course_code} value={c.course_code}>{c.course_code} ({c.n})</option>)}</Select>
          <Select value={term} onChange={(e) => set({ term: e.target.value || null })} aria-label={t('campus.resources.term')}><option value="">{t('campus.resources.term')}: {t('common.all')}</option>{facets?.terms.map((x) => <option key={x.term} value={x.term}>{locale === 'ar' ? x.label_ar : x.label}</option>)}</Select>
          <Select value={type} onChange={(e) => set({ type: e.target.value || null })} aria-label={t('campus.resources.type')}><option value="">{t('campus.resources.type')}: {t('common.all')}</option>{TYPES.map((x) => <option key={x} value={x}>{t(`campus.resources.types.${x}`)}</option>)}</Select>
          <Select value={sort} onChange={(e) => set({ sort: e.target.value })} aria-label={t('campus.resources.sort')}><option value="helpful">{t('campus.resources.sortHelpful')}</option><option value="newest">{t('campus.resources.sortNewest')}</option><option value="downloads">{t('campus.resources.sortDownloads')}</option></Select>
        </div>
      </Card>
      {q.loading && !q.data && <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">{[1, 2, 3, 4, 5, 6].map((i) => <Skeleton key={i} className="h-56" />)}</div>}
      {q.error ? <ErrorState error={q.error} onRetry={() => void q.refetch()} /> : null}
      {q.data && items.length === 0 && <EmptyState icon={<BookOpen className="h-6 w-6" />} title={t('campus.resources.noResults')} />}
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">{items.map((r) => <ResourceCard key={r.id} r={r} onPreview={setPreview} onTask={setTask} onReport={setReport} />)}</div>
      <PreviewModal resource={preview} onClose={() => setPreview(null)} onTask={(r) => { setPreview(null); setTask(r); }} />
      <StudyTaskModal resource={task} onClose={() => setTask(null)} />
      <ReportModal resource={report} onClose={() => setReport(null)} />
      <UploadModal open={upload} onClose={() => setUpload(false)} />
    </div>
  );
}
