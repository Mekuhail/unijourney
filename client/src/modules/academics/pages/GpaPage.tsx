import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import clsx from 'clsx';
import { AlertTriangle, ArrowDown, ArrowUp, Check, Copy, ExternalLink, Info, Plus, RotateCcw, Trash2, X, XCircle } from 'lucide-react';
import { useI18n } from '@/i18n';
import { api, ApiError, errorMessage } from '@/lib/api';
import { useQuery } from '@/lib/useQuery';
import { useToast } from '@/components/ui/toast';
import { fmtDate } from '@/lib/format';
import { PageHeader } from '@/components/ui/PageHeader';
import { Button, ConfirmDialog, ErrorState, Input, Select, Skeleton, Tabs } from '@/components/ui';
import {
  computeGpa, estimateCourse, neededOnRemaining, requiredAverage, roundGpa, targetStatus,
  type ComponentCategory, type CourseEstimate, type CourseInput, type GradeComponent, type GradePolicy, type GradeRow, type ScholarshipPolicy, type TargetStatus
} from '@shared/gpa';
import { AcademicsNav } from '../components';

// ---------------------------------------------------------------- data (mirrors GET /academics/gpa)
interface OfficialRow extends GradeRow { title_en: string; title_ar: string }
interface GpaData {
  policy: GradePolicy;
  sources: Array<{ label_en: string; label_ar: string; url: string }>;
  scholarship: ScholarshipPolicy;
  markers: Array<{ id: string; min_gpa: number; label_en: string; label_ar: string; url: string }>;
  official: { rows: OfficialRow[]; gpa: number | null; gpaCredits: number; earnedCredits: number; excluded: Array<{ course_code: string; term: string; grade: string | null; reason: string }>; byTerm: Array<{ term: string; label: { en: string; ar: string }; gpa: number | null; gpaCredits: number }> };
  current: { term: string; label: { en: string; ar: string }; courses: Array<{ code: string; title_en: string; title_ar: string; credits: number }> };
  upcoming: Array<{ id: string; label: { en: string; ar: string } }>;
  remainingCredits: number | null;
  plan: { doc: PlanDoc | null; version: number; updated_at: string } | null;
}
type CurrentCourse = CourseInput & { target?: string | null };
interface FutureCourse { id: string; code: string | null; title: string; credits: number; grade: string | null; passFail: boolean; repeatOf: string | null }
interface Scenario { id: string; name: string; terms: Array<{ id: string; label: string; courses: FutureCourse[] }> }
interface PlanDoc {
  current: { term: string; courses: CurrentCourse[] };
  scenarios: Scenario[];
  activeScenario: string | null;
  target: { kind: 'none' | 'scholarship' | 'marker' | 'custom'; categoryId: string | null; gpa: number | null };
  settings: { repeat: 'all' | 'latest' | 'highest'; rounding: 'round' | 'truncate'; headroom: number };
  dismissed: string[];
}

const uid = () => Math.random().toString(36).slice(2, 10);
const CATEGORIES: ComponentCategory[] = ['midterm', 'quiz', 'assignment', 'project', 'lab', 'presentation', 'participation', 'final', 'other'];
const fmt = (x: number | null | undefined, d = 2) => (x === null || x === undefined || !Number.isFinite(x) ? '—' : x.toFixed(d));
const pct = (x: number | null | undefined) => (x === null || x === undefined ? '—' : `${Number.isInteger(x) ? x : x.toFixed(1)}%`);
const numOrNull = (v: string) => { if (v.trim() === '') return null; const n = Number(v); return Number.isFinite(n) ? n : null; };

function blankDoc(d: GpaData): PlanDoc {
  return {
    current: { term: d.current.term, courses: d.current.courses.map((c) => ({ id: uid(), code: c.code, title: c.title_en, credits: c.credits, mode: 'none', finalGrade: null, finalPercent: null, components: [], assumeRemaining: null, passFail: false, target: null })) },
    scenarios: [{ id: uid(), name: 'Plan A', terms: [{ id: uid(), label: d.upcoming[0]?.label.en ?? 'Next semester', courses: [] }] }],
    activeScenario: null,
    target: { kind: 'none', categoryId: null, gpa: null },
    settings: { repeat: d.policy.repeat, rounding: d.policy.rounding, headroom: 0.1 },
    dismissed: []
  };
}

// ---------------------------------------------------------------- persistence: autosave with version checks
type SaveState = 'idle' | 'saving' | 'saved' | 'error' | 'conflict';
function usePlan(d: GpaData | null, reload: () => void) {
  const [doc, setDoc] = useState<PlanDoc | null>(null);
  const [save, setSave] = useState<SaveState>('idle');
  const version = useRef(0);
  const dirty = useRef(false);
  const timer = useRef<number | undefined>(undefined);
  useEffect(() => {
    if (!d) return;
    version.current = d.plan?.version ?? 0;
    const saved = d.plan?.doc;
    setDoc(saved ? { ...blankDoc(d), ...saved, activeScenario: saved.activeScenario ?? saved.scenarios[0]?.id ?? null } : ((b) => ({ ...b, activeScenario: b.scenarios[0].id }))(blankDoc(d)));
    setSave(saved ? 'saved' : 'idle');
  }, [d]);
  const flush = useCallback(async (next: PlanDoc) => {
    setSave('saving');
    try {
      const r = await api<{ version: number }>('/academics/gpa', { method: 'PUT', body: { doc: next, version: version.current } });
      version.current = r.version;
      dirty.current = false;
      setSave('saved');
    } catch (e) {
      setSave(e instanceof ApiError && e.status === 409 ? 'conflict' : 'error');
    }
  }, []);
  const update = useCallback((fn: (p: PlanDoc) => PlanDoc) => {
    setDoc((prev) => {
      if (!prev) return prev;
      const next = fn(prev);
      dirty.current = true;
      window.clearTimeout(timer.current);
      timer.current = window.setTimeout(() => void flush(next), 700);
      return next;
    });
  }, [flush]);
  useEffect(() => () => window.clearTimeout(timer.current), []);
  const retry = () => { if (doc) void flush(doc); };
  return { doc, update, save, retry, reload };
}

// ---------------------------------------------------------------- small pieces
function Kind({ kind }: { kind: 'official' | 'estimate' | 'whatif' }) {
  const { t } = useI18n();
  return (
    <span className={clsx('inline-flex items-center rounded-md px-1.5 py-0.5 text-xs font-semibold',
      kind === 'official' ? 'bg-fg/10 text-fg' : kind === 'estimate' ? 'border border-dashed border-brand-500 text-brand-700 dark:text-brand-300' : 'border border-dotted border-gold-500 text-gold-700')}>
      {t(`gpa.kind.${kind}`)}
    </span>
  );
}

function IssueLine({ tone, children }: { tone: 'error' | 'warn' | 'info'; children: ReactNode }) {
  const Icon = tone === 'error' ? XCircle : tone === 'warn' ? AlertTriangle : Info;
  return <p className={clsx('flex items-start gap-1.5 text-sm', tone === 'error' ? 'text-danger' : tone === 'warn' ? 'text-warn' : 'text-muted')}><Icon className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />{children}</p>;
}

// ---------------------------------------------------------------- this term: one course
function ComponentRow({ c, i, n, onChange, onMove, onRemove }: { c: GradeComponent; i: number; n: number; onChange: (c: GradeComponent) => void; onMove: (d: -1 | 1) => void; onRemove: () => void }) {
  const { t } = useI18n();
  const marks = c.percent === null && (c.earned !== null || c.max !== null);
  const [byMarks, setByMarks] = useState(marks);
  const label = c.name || t('gpa.comp.unnamed');
  return (
    <li className="grid grid-cols-[minmax(0,1fr)_auto] gap-x-2 gap-y-2 border-t border-line py-3 first:border-t-0 sm:grid-cols-[minmax(0,1.4fr)_8.5rem_5.5rem_minmax(0,1.3fr)_auto] sm:items-center">
      <Input aria-label={t('gpa.comp.name')} value={c.name} onChange={(e) => onChange({ ...c, name: e.target.value })} maxLength={60} dir="auto" className="col-span-2 sm:col-span-1" />
      <Select aria-label={`${t('gpa.comp.type')}: ${label}`} value={c.category} onChange={(e) => onChange({ ...c, category: e.target.value as ComponentCategory })}>
        {CATEGORIES.map((k) => <option key={k} value={k}>{t(`gpa.cat.${k}`)}</option>)}
      </Select>
      <div className="flex items-center gap-1">
        <Input aria-label={`${t('gpa.comp.weight')}: ${label}`} inputMode="decimal" value={c.weight ?? ''} onChange={(e) => onChange({ ...c, weight: numOrNull(e.target.value) })} className="!w-full text-end" />
        <span className="text-sm text-muted" aria-hidden>%</span>
      </div>
      <div className="col-span-2 flex min-w-0 items-center gap-1 sm:col-span-1">
        {byMarks ? (
          <>
            <Input aria-label={`${t('gpa.comp.earned')}: ${label}`} inputMode="decimal" value={c.earned ?? ''} onChange={(e) => onChange({ ...c, earned: numOrNull(e.target.value), percent: null })} className="min-w-0 text-end" placeholder="—" />
            <span className="text-muted" aria-hidden>/</span>
            <Input aria-label={`${t('gpa.comp.max')}: ${label}`} inputMode="decimal" value={c.max ?? ''} onChange={(e) => onChange({ ...c, max: numOrNull(e.target.value), percent: null })} className="min-w-0 text-end" placeholder="—" />
          </>
        ) : (
          <>
            <Input aria-label={`${t('gpa.comp.percent')}: ${label}`} inputMode="decimal" value={c.percent ?? ''} onChange={(e) => onChange({ ...c, percent: numOrNull(e.target.value), earned: null, max: null })} className="min-w-0 text-end" placeholder={t('gpa.comp.notYet')} />
            <span className="text-sm text-muted" aria-hidden>%</span>
          </>
        )}
        <button type="button" onClick={() => { setByMarks((v) => !v); onChange({ ...c, earned: null, max: null, percent: null }); }} className="shrink-0 rounded-lg px-2 py-1 text-xs font-medium text-brand-600 hover:underline touch:min-h-11">
          {byMarks ? t('gpa.comp.usePercent') : t('gpa.comp.useMarks')}
        </button>
      </div>
      <div className="col-start-2 row-start-2 flex items-center justify-end gap-0.5 sm:col-start-auto sm:row-start-auto">
        <Button size="icon" variant="ghost" aria-label={t('gpa.comp.up', { name: label })} disabled={i === 0} onClick={() => onMove(-1)}><ArrowUp className="h-4 w-4" /></Button>
        <Button size="icon" variant="ghost" aria-label={t('gpa.comp.down', { name: label })} disabled={i === n - 1} onClick={() => onMove(1)}><ArrowDown className="h-4 w-4" /></Button>
        <Button size="icon" variant="ghost" aria-label={t('gpa.comp.remove', { name: label })} onClick={onRemove}><Trash2 className="h-4 w-4" /></Button>
      </div>
    </li>
  );
}

function CourseEstimateText({ e, c, policy }: { e: CourseEstimate; c: CurrentCourse; policy: GradePolicy }) {
  const { t } = useI18n();
  const lines: ReactNode[] = [];
  for (const is of e.issues) {
    if (is.code === 'weights_over') lines.push(<IssueLine key="over" tone="error">{t('gpa.issue.over', { n: is.total })}</IssueLine>);
    if (is.code === 'weights_under') lines.push(<IssueLine key="under" tone="warn">{t('gpa.issue.under', { n: is.total, left: Math.round((100 - is.total) * 100) / 100 })}</IssueLine>);
    if (is.code === 'missing_weight') lines.push(<IssueLine key="miss" tone="warn">{t('gpa.issue.missingWeight', { names: is.names.join(', ') })}</IssueLine>);
    if (is.code === 'score_over_max') lines.push(<IssueLine key="max" tone="warn">{t('gpa.issue.overMax', { names: is.names.join(', ') })}</IssueLine>);
    if (is.code === 'invalid_max') lines.push(<IssueLine key="inv" tone="error">{t('gpa.issue.invalidMax', { names: is.names.join(', ') })}</IssueLine>);
    if (is.code === 'unknown_grade') lines.push(<IssueLine key="unk" tone="error">{t('gpa.issue.unknownGrade', { g: is.grade })}</IssueLine>);
  }
  const need = c.mode === 'components' && c.target ? neededOnRemaining(c, c.target, policy) : null;
  return (
    <div className="space-y-1.5">
      {c.mode === 'components' && e.status !== 'invalid' && (
        <p className="text-sm">
          {e.soFar !== null
            ? t('gpa.est.soFar', { p: pct(e.soFar), w: pct(e.gradedWeight) })
            : t('gpa.est.nothingYet')}
          {e.projected !== null && <> {t(e.assumption === 'custom' ? 'gpa.est.projectedCustom' : 'gpa.est.projected', { p: pct(e.projected), l: e.letter ?? '—', a: pct(c.assumeRemaining) })}</>}
          {e.min !== null && e.max !== null && e.status === 'partial' && <span className="text-muted"> {t('gpa.est.range', { min: pct(e.min), max: pct(e.max), lmin: letterOf(e.min, policy), lmax: letterOf(e.max, policy) })}</span>}
        </p>
      )}
      {need && need.state !== 'unknown' && (
        <p className={clsx('text-sm', need.state === 'impossible' ? 'text-danger' : need.state === 'secured' ? 'text-success' : 'text-fg')}>
          {need.state === 'secured' ? t('gpa.need.secured', { l: c.target! }) : need.state === 'impossible' ? t('gpa.need.impossible', { l: c.target! }) : t('gpa.need.possible', { l: c.target!, p: pct(need.percent), w: pct(100 - e.gradedWeight) })}
        </p>
      )}
      {lines}
    </div>
  );
}
const letterOf = (p: number, policy: GradePolicy) => { for (const b of policy.bands) if (p >= b.min) return b.letter; return 'F'; };

const TYPICAL: Array<[string, ComponentCategory, number]> = [['Midterm', 'midterm', 30], ['Quizzes', 'quiz', 10], ['Project', 'project', 20], ['Final exam', 'final', 40]];

function CurrentCourseEditor({ c, policy, onChange }: { c: CurrentCourse; policy: GradePolicy; onChange: (c: CurrentCourse) => void }) {
  const { t } = useI18n();
  const e = estimateCourse(c, policy);
  const [open, setOpen] = useState(c.mode !== 'none');
  const letters = Object.keys(policy.points).filter((l) => l !== 'DN');
  const setComp = (i: number, comp: GradeComponent) => onChange({ ...c, components: c.components.map((x, k) => (k === i ? comp : x)) });
  const move = (i: number, d: -1 | 1) => { const list = [...c.components]; const [x] = list.splice(i, 1); list.splice(i + d, 0, x); onChange({ ...c, components: list }); };
  const headId = `gpa-course-${c.id}`;
  const summary = c.mode === 'none' ? t('gpa.est.none') : e.status === 'invalid' ? t('gpa.est.invalid') : e.letter ? `${e.letter}${e.projected !== null ? ` · ${pct(e.projected)}` : ''}` : t('gpa.est.none');
  return (
    <section aria-labelledby={headId} className="border-b border-line py-4 last:border-b-0">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
        <button type="button" aria-expanded={open} aria-controls={`${headId}-body`} onClick={() => setOpen((v) => !v)} className="min-w-0 flex-1 text-start">
          <h3 id={headId} className="font-semibold"><span className="num">{c.code}</span> <span dir="auto" className="font-normal text-muted">{c.title}</span></h3>
        </button>
        <label className="flex items-center gap-2 text-sm text-muted">
          {t('gpa.credits')}
          <Input inputMode="decimal" value={c.credits} onChange={(ev) => onChange({ ...c, credits: numOrNull(ev.target.value) ?? 0 })} className="!w-16 text-end" />
        </label>
        <span className={clsx('num min-w-24 text-end text-sm font-semibold', e.status === 'invalid' ? 'text-danger' : c.mode === 'none' || !e.letter ? 'text-muted' : 'text-fg')}>
          {c.mode !== 'none' && e.letter && <Kind kind="estimate" />} {summary}
        </span>
      </div>
      {open && (
        <div id={`${headId}-body`} className="mt-3 space-y-3">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-sm text-muted">{t('gpa.mode')}</span>
            {(['components', 'final', 'none'] as const).map((m) => (
              <button key={m} type="button" aria-pressed={c.mode === m} onClick={() => onChange({ ...c, mode: m })}
                className={clsx('min-h-9 rounded-lg px-3 text-sm font-medium touch:min-h-11', c.mode === m ? 'bg-surface-2 text-fg ring-1 ring-line' : 'text-muted hover:text-fg')}>
                {t(`gpa.mode.${m}`)}
              </button>
            ))}
            <label className="ms-auto flex items-center gap-2 text-sm text-muted">
              <input type="checkbox" checked={c.passFail} onChange={(ev) => onChange({ ...c, passFail: ev.target.checked })} className="h-4 w-4 accent-[var(--color-brand-500)]" />
              {t('gpa.passFail')}
            </label>
          </div>
          {c.mode === 'final' && (
            <div className="flex flex-wrap items-end gap-3">
              <label className="text-sm">
                <span className="mb-1 block font-medium">{t('gpa.final.letter')}</span>
                <Select value={c.finalGrade ?? ''} onChange={(ev) => onChange({ ...c, finalGrade: ev.target.value || null, finalPercent: ev.target.value ? null : c.finalPercent })}>
                  <option value="">{t('gpa.final.pick')}</option>
                  {(c.passFail ? ['P', 'F'] : letters).map((l) => <option key={l} value={l}>{l}{policy.points[l] !== undefined && !c.passFail ? ` · ${policy.points[l]}` : ''}</option>)}
                </Select>
              </label>
              <span className="pb-3 text-sm text-muted">{t('gpa.or')}</span>
              <label className="text-sm">
                <span className="mb-1 block font-medium">{t('gpa.final.percent')}</span>
                <Input inputMode="decimal" value={c.finalPercent ?? ''} onChange={(ev) => onChange({ ...c, finalPercent: numOrNull(ev.target.value), finalGrade: null })} className="!w-24 text-end" />
              </label>
            </div>
          )}
          {c.mode === 'components' && (
            <>
              {c.components.length === 0 ? (
                <div className="rounded-xl border border-dashed border-line p-4 text-sm">
                  <p className="text-muted">{t('gpa.comp.empty')}</p>
                  <div className="mt-2 flex flex-wrap gap-2">
                    <Button size="sm" variant="outline" onClick={() => onChange({ ...c, components: TYPICAL.map(([name, category, weight]) => ({ id: uid(), name, category, weight, earned: null, max: null, percent: null })) })}>{t('gpa.comp.typical')}</Button>
                    <Button size="sm" variant="ghost" icon={<Plus className="h-4 w-4" />} onClick={() => onChange({ ...c, components: [{ id: uid(), name: '', category: 'other', weight: null, earned: null, max: null, percent: null }] })}>{t('gpa.comp.add')}</Button>
                  </div>
                </div>
              ) : (
                <>
                  <div className="hidden grid-cols-[minmax(0,1.4fr)_8.5rem_5.5rem_minmax(0,1.3fr)_auto] gap-2 text-xs font-medium text-muted sm:grid" aria-hidden>
                    <span>{t('gpa.comp.name')}</span><span>{t('gpa.comp.type')}</span><span>{t('gpa.comp.weight')}</span><span>{t('gpa.comp.score')}</span><span className="w-[7.5rem]" />
                  </div>
                  <ul>{c.components.map((comp, i) => <ComponentRow key={comp.id} c={comp} i={i} n={c.components.length} onChange={(x) => setComp(i, x)} onMove={(d) => move(i, d)} onRemove={() => onChange({ ...c, components: c.components.filter((_, k) => k !== i) })} />)}</ul>
                  <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
                    <Button size="sm" variant="ghost" icon={<Plus className="h-4 w-4" />} onClick={() => onChange({ ...c, components: [...c.components, { id: uid(), name: '', category: 'other', weight: null, earned: null, max: null, percent: null }] })}>{t('gpa.comp.add')}</Button>
                    <span className={clsx('num text-sm', e.weightTotal > 100 ? 'font-semibold text-danger' : e.weightTotal < 100 ? 'text-warn' : 'text-muted')}>{t('gpa.comp.total', { n: e.weightTotal })}</span>
                  </div>
                </>
              )}
              <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-sm">
                <label className="flex items-center gap-2">
                  <span className="text-muted">{t('gpa.assume')}</span>
                  <Select value={c.assumeRemaining === null ? 'same' : 'custom'} onChange={(ev) => onChange({ ...c, assumeRemaining: ev.target.value === 'same' ? null : e.soFar !== null ? Math.round(e.soFar) : 75 })} className="!w-auto">
                    <option value="same">{t('gpa.assume.same')}</option>
                    <option value="custom">{t('gpa.assume.custom')}</option>
                  </Select>
                </label>
                {c.assumeRemaining !== null && (
                  <label className="flex items-center gap-1"><span className="sr-only">{t('gpa.assume.custom')}</span><Input inputMode="decimal" value={c.assumeRemaining} onChange={(ev) => onChange({ ...c, assumeRemaining: Math.min(100, Math.max(0, numOrNull(ev.target.value) ?? 0)) })} className="!w-20 text-end" /><span className="text-muted">%</span></label>
                )}
                <label className="flex items-center gap-2">
                  <span className="text-muted">{t('gpa.courseTarget')}</span>
                  <Select value={c.target ?? ''} onChange={(ev) => onChange({ ...c, target: ev.target.value || null })} className="!w-auto">
                    <option value="">{t('gpa.courseTarget.none')}</option>
                    {policy.bands.filter((b) => b.letter !== 'F').map((b) => <option key={b.letter} value={b.letter}>{b.letter} ({b.min}%+)</option>)}
                  </Select>
                </label>
              </div>
            </>
          )}
          {c.mode !== 'none' && <CourseEstimateText e={e} c={c} policy={policy} />}
        </div>
      )}
    </section>
  );
}

// ---------------------------------------------------------------- future scenarios
function ScenarioEditor({ doc, d, policy, update }: { doc: PlanDoc; d: GpaData; policy: GradePolicy; update: (fn: (p: PlanDoc) => PlanDoc) => void }) {
  const { t } = useI18n();
  const [confirm, setConfirm] = useState<'reset' | 'delete' | null>(null);
  const sc = doc.scenarios.find((s) => s.id === doc.activeScenario) ?? doc.scenarios[0];
  const letters = Object.keys(policy.points).filter((x) => x !== 'DN');
  const repeatable = [...new Set(d.official.rows.filter((r) => r.grade && policy.points[r.grade] !== undefined).map((r) => r.course_code))].sort();
  const setScenario = (fn: (s: Scenario) => Scenario) => update((p) => ({ ...p, scenarios: p.scenarios.map((s) => (s.id === sc.id ? fn(s) : s)) }));
  const setCourse = (ti: number, ci: number, patch: Partial<FutureCourse>) => setScenario((s) => ({ ...s, terms: s.terms.map((tm, k) => (k === ti ? { ...tm, courses: tm.courses.map((c, j) => (j === ci ? { ...c, ...patch } : c)) } : tm)) }));
  const nextLabel = (s: Scenario) => d.upcoming[s.terms.length]?.label.en ?? `${t('gpa.term')} ${s.terms.length + 1}`;
  if (!sc) return null;
  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end gap-2">
        <label className="text-sm">
          <span className="mb-1 block font-medium">{t('gpa.scenario')}</span>
          <Select value={sc.id} onChange={(e) => update((p) => ({ ...p, activeScenario: e.target.value }))} className="!w-auto !min-w-40">
            {doc.scenarios.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
          </Select>
        </label>
        <label className="text-sm">
          <span className="mb-1 block font-medium">{t('gpa.scenario.name')}</span>
          <Input value={sc.name} maxLength={60} onChange={(e) => setScenario((s) => ({ ...s, name: e.target.value || s.name }))} className="!w-44" dir="auto" />
        </label>
        <div className="flex flex-wrap gap-1">
          <Button size="sm" variant="ghost" icon={<Plus className="h-4 w-4" />} disabled={doc.scenarios.length >= 6} onClick={() => update((p) => { const n: Scenario = { id: uid(), name: `Plan ${String.fromCharCode(65 + p.scenarios.length)}`, terms: [{ id: uid(), label: d.upcoming[0]?.label.en ?? 'Next semester', courses: [] }] }; return { ...p, scenarios: [...p.scenarios, n], activeScenario: n.id }; })}>{t('gpa.scenario.new')}</Button>
          <Button size="sm" variant="ghost" icon={<Copy className="h-4 w-4" />} disabled={doc.scenarios.length >= 6} onClick={() => update((p) => { const n: Scenario = JSON.parse(JSON.stringify(sc)); n.id = uid(); n.name = `${sc.name} (${t('gpa.scenario.copy')})`; return { ...p, scenarios: [...p.scenarios, n], activeScenario: n.id }; })}>{t('gpa.scenario.duplicate')}</Button>
          <Button size="sm" variant="ghost" icon={<RotateCcw className="h-4 w-4" />} onClick={() => setConfirm('reset')}>{t('gpa.scenario.reset')}</Button>
          <Button size="sm" variant="ghost" icon={<Trash2 className="h-4 w-4" />} disabled={doc.scenarios.length <= 1} onClick={() => setConfirm('delete')}>{t('gpa.scenario.delete')}</Button>
        </div>
      </div>
      <p className="text-sm text-muted">{t('gpa.scenario.help')}</p>

      {sc.terms.map((tm, ti) => (
        <section key={tm.id} aria-label={tm.label} className="rounded-2xl border border-dotted border-gold-500/70 p-4">
          <div className="mb-2 flex flex-wrap items-center gap-2">
            <Input aria-label={t('gpa.term.name')} value={tm.label} maxLength={40} onChange={(e) => setScenario((s) => ({ ...s, terms: s.terms.map((x, k) => (k === ti ? { ...x, label: e.target.value } : x)) }))} className="!w-48 font-semibold" dir="auto" />
            <Kind kind="whatif" />
            <Button size="sm" variant="ghost" className="ms-auto" icon={<X className="h-4 w-4" />} onClick={() => setScenario((s) => ({ ...s, terms: s.terms.filter((_, k) => k !== ti) }))}>{t('gpa.term.remove')}</Button>
          </div>
          {tm.courses.length === 0 && <p className="py-2 text-sm text-muted">{t('gpa.term.empty')}</p>}
          <ul>
            {tm.courses.map((c, ci) => (
              <li key={c.id} className="grid grid-cols-2 gap-2 border-t border-line py-2 first:border-t-0 sm:grid-cols-[minmax(0,1.6fr)_5rem_7rem_minmax(0,1fr)_auto] sm:items-center">
                <Input aria-label={t('gpa.future.course')} value={c.title} placeholder={t('gpa.future.coursePh')} maxLength={120} onChange={(e) => setCourse(ti, ci, { title: e.target.value })} className="col-span-2 sm:col-span-1" dir="auto" />
                <label className="flex items-center gap-1"><span className="sr-only">{t('gpa.credits')}</span><Input inputMode="decimal" aria-label={`${t('gpa.credits')}: ${c.title || t('gpa.future.course')}`} value={c.credits} onChange={(e) => setCourse(ti, ci, { credits: numOrNull(e.target.value) ?? 0 })} className="text-end" /><span className="text-xs text-muted">{t('gpa.cr')}</span></label>
                <Select aria-label={`${t('gpa.future.grade')}: ${c.title || t('gpa.future.course')}`} value={c.passFail ? 'P' : c.grade ?? ''} onChange={(e) => setCourse(ti, ci, e.target.value === 'P' ? { passFail: true, grade: 'P' } : { passFail: false, grade: e.target.value || null })}>
                  <option value="">{t('gpa.future.noGrade')}</option>
                  {letters.map((x) => <option key={x} value={x}>{x}</option>)}
                  <option value="P">{t('gpa.future.pass')}</option>
                </Select>
                <Select aria-label={`${t('gpa.future.repeat')}: ${c.title || t('gpa.future.course')}`} value={c.repeatOf ?? ''} onChange={(e) => setCourse(ti, ci, { repeatOf: e.target.value || null })}>
                  <option value="">{t('gpa.future.newCourse')}</option>
                  {repeatable.map((code) => <option key={code} value={code}>{t('gpa.future.repeats', { code })}</option>)}
                </Select>
                <Button size="icon" variant="ghost" aria-label={t('gpa.future.remove', { name: c.title || t('gpa.future.course') })} onClick={() => setScenario((s) => ({ ...s, terms: s.terms.map((x, k) => (k === ti ? { ...x, courses: x.courses.filter((_, j) => j !== ci) } : x)) }))}><Trash2 className="h-4 w-4" /></Button>
              </li>
            ))}
          </ul>
          <div className="mt-2 flex flex-wrap gap-2">
            <Button size="sm" variant="ghost" icon={<Plus className="h-4 w-4" />} disabled={tm.courses.length >= 12} onClick={() => setScenario((s) => ({ ...s, terms: s.terms.map((x, k) => (k === ti ? { ...x, courses: [...x.courses, { id: uid(), code: null, title: '', credits: 3, grade: null, passFail: false, repeatOf: null }] } : x)) }))}>{t('gpa.future.add')}</Button>
            {tm.courses.length === 0 && <Button size="sm" variant="outline" onClick={() => setScenario((s) => ({ ...s, terms: s.terms.map((x, k) => (k === ti ? { ...x, courses: Array.from({ length: 5 }, (_, j) => ({ id: uid(), code: null, title: `${t('gpa.future.exampleCourse')} ${j + 1}`, credits: 3, grade: 'B+', passFail: false, repeatOf: null })) } : x)) }))}>{t('gpa.future.example')}</Button>}
          </div>
        </section>
      ))}
      <Button variant="outline" size="sm" icon={<Plus className="h-4 w-4" />} disabled={sc.terms.length >= 8} onClick={() => setScenario((s) => ({ ...s, terms: [...s.terms, { id: uid(), label: nextLabel(s), courses: [] }] }))}>{t('gpa.term.add')}</Button>
      <ConfirmDialog open={confirm !== null} onClose={() => setConfirm(null)} danger={confirm === 'delete'}
        title={confirm === 'delete' ? t('gpa.scenario.deleteTitle', { name: sc.name }) : t('gpa.scenario.resetTitle', { name: sc.name })}
        body={confirm === 'delete' ? t('gpa.scenario.deleteBody') : t('gpa.scenario.resetBody')}
        confirmLabel={confirm === 'delete' ? t('gpa.scenario.delete') : t('gpa.scenario.reset')}
        onConfirm={() => {
          if (confirm === 'delete') update((p) => { const rest = p.scenarios.filter((s) => s.id !== sc.id); return { ...p, scenarios: rest, activeScenario: rest[0]?.id ?? null }; });
          else setScenario((s) => ({ ...s, terms: [{ id: uid(), label: d.upcoming[0]?.label.en ?? 'Next semester', courses: [] }] }));
          setConfirm(null);
        }} />
    </div>
  );
}

// ---------------------------------------------------------------- forecasts
function useForecast(d: GpaData | null, doc: PlanDoc | null) {
  return useMemo(() => {
    if (!d || !doc) return null;
    const policy: GradePolicy = { ...d.policy, repeat: doc.settings.repeat, rounding: doc.settings.rounding };
    const official: GradeRow[] = d.official.rows.map(({ course_code, term, credits, grade, status }) => ({ course_code, term, credits, grade, status, source: 'official' }));
    const estimates = doc.current.courses.map((c) => ({ c, e: estimateCourse(c, policy) }));
    const estimateRows: GradeRow[] = estimates.filter(({ c, e }) => e.letter && e.status !== 'invalid' && c.credits >= 0).map(({ c, e }) => ({ course_code: c.code || c.id, term: doc.current.term, credits: c.credits, grade: c.passFail ? (e.letter === 'F' ? 'F' : 'P') : e.letter, status: 'estimate', source: 'estimate' }));
    const missing = estimates.filter(({ c, e }) => !(e.letter && e.status !== 'invalid') && c.credits > 0).map(({ c }) => c.code);
    const sc = doc.scenarios.find((s) => s.id === doc.activeScenario) ?? doc.scenarios[0] ?? null;
    const scenarioRows: GradeRow[] = [];
    let futureCredits = 0, ungraded = 0;
    sc?.terms.forEach((tm, ti) => tm.courses.forEach((c) => {
      if (!c.passFail && c.credits > 0) futureCredits += c.credits;
      if (!c.grade) { ungraded += 1; return; }
      scenarioRows.push({ course_code: c.repeatOf ?? c.code ?? `plan-${c.id}`, term: `plan-${String(ti).padStart(2, '0')}`, credits: c.credits, grade: c.passFail ? 'P' : c.grade, status: 'scenario', source: 'scenario' });
    }));
    const termEstimate = computeGpa(estimateRows, policy);
    const afterTerm = computeGpa([...official, ...estimateRows], policy);
    const afterPlan = computeGpa([...official, ...estimateRows, ...scenarioRows], policy);
    const target = doc.target.kind === 'none' ? null : doc.target.gpa;
    const projected = scenarioRows.length ? afterPlan : estimateRows.length ? afterTerm : null;
    const basis: 'official' | 'term' | 'plan' = scenarioRows.length ? 'plan' : estimateRows.length ? 'term' : 'official';
    const projectedGpa = projected?.raw ?? computeGpa(official, policy).raw;
    const status: TargetStatus | null = target !== null && projectedGpa !== null ? targetStatus(projectedGpa, target, doc.settings.headroom, policy) : null;
    const known = { points: afterTerm.points, credits: afterTerm.gpaCredits };
    const need = target !== null ? requiredAverage(known, futureCredits, target, policy.scale) : null;
    const needRemaining = target !== null && d.remainingCredits ? requiredAverage(known, Math.max(0, d.remainingCredits - doc.current.courses.reduce((s, c) => s + (c.passFail ? 0 : c.credits), 0)), target, policy.scale) : null;
    return { policy, estimates, termEstimate, afterTerm, afterPlan, projectedGpa, basis, status, target, need, needRemaining, futureCredits, ungraded, missing, scenario: sc, estimateCount: estimateRows.length };
  }, [d, doc]);
}

function nearestLetter(avg: number, policy: GradePolicy) {
  const entries = Object.entries(policy.points).filter(([l]) => l !== 'DN').sort((a, b) => b[1] - a[1]);
  const at = entries.find(([, p]) => p <= avg + 1e-9);
  const above = [...entries].reverse().find(([, p]) => p >= avg - 1e-9);
  if (!at) return entries[entries.length - 1][0];
  if (Math.abs(at[1] - avg) < 0.005 || !above || above[0] === at[0]) return at[0];
  return `${at[0]}–${above[0]}`;
}

// ---------------------------------------------------------------- page
export function GpaPage() {
  const { t, l, locale } = useI18n();
  const toast = useToast();
  const q = useQuery(() => api<GpaData>('/academics/gpa'), [], { refreshOn: ['academics', 'persona'] });
  const d = q.data;
  const { doc, update, save, retry } = usePlan(d, () => void q.refetch());
  const f = useForecast(d, doc);
  const [tab, setTab] = useState<'term' | 'future' | 'how'>('term');
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [confirmWipe, setConfirmWipe] = useState(false);

  // One nudge per status and target: shown once, dismissible, and back only when something changes.
  const alertKey = f?.status && f.target !== null ? `${f.status}:${f.target}` : null;
  const showNudge = !!alertKey && !!doc && !doc.dismissed.includes(alertKey) && f?.basis !== 'official';

  if (q.error) return <div><PageHeader crumbs={[{ to: '/academics', label: t('nav.academics') }]} title={t('gpa.title')} /><AcademicsNav /><ErrorState error={q.error} onRetry={q.refetch} /></div>;
  if (!d || !doc || !f) return <div><PageHeader crumbs={[{ to: '/academics', label: t('nav.academics') }]} title={t('gpa.title')} subtitle={t('gpa.subtitle')} /><AcademicsNav /><Skeleton className="h-24" /><Skeleton className="mt-4 h-72" /></div>;

  const sch = d.scholarship;
  const targetValue = doc.target.kind === 'scholarship' ? doc.target.categoryId ?? '' : doc.target.kind === 'marker' ? `m:${doc.target.categoryId}` : doc.target.kind;
  const setTarget = (v: string) => {
    if (v === 'none') update((p) => ({ ...p, target: { kind: 'none', categoryId: null, gpa: null } }));
    else if (v === 'custom') update((p) => ({ ...p, target: { kind: 'custom', categoryId: null, gpa: p.target.gpa ?? 3.5 } }));
    else if (v.startsWith('m:')) { const m = d.markers.find((x) => `m:${x.id}` === v)!; update((p) => ({ ...p, target: { kind: 'marker', categoryId: m.id, gpa: m.min_gpa } })); }
    else { const c = sch.categories.find((x) => x.id === v)!; update((p) => ({ ...p, target: { kind: 'scholarship', categoryId: c.id, gpa: c.min_gpa } })); }
  };
  const targetName = doc.target.kind === 'scholarship' ? t('gpa.target.category', { d: sch.categories.find((c) => c.id === doc.target.categoryId)?.discount ?? '', g: fmt(doc.target.gpa) })
    : doc.target.kind === 'marker' ? l(d.markers.find((m) => m.id === doc.target.categoryId)?.label_en ?? '', d.markers.find((m) => m.id === doc.target.categoryId)?.label_ar) : t('gpa.target.customName', { g: fmt(doc.target.gpa) });
  const gap = f.projectedGpa !== null && f.target !== null ? roundGpa(f.projectedGpa, f.policy) - f.target : null;
  const basisText = t(`gpa.basis.${f.basis}`, { n: f.estimateCount, plan: f.scenario?.name ?? '' });
  const statusText = f.status ? t(`gpa.status.${f.status}`) : null;
  const nudgeText = f.status && gap !== null ? t(`gpa.nudge.${f.status}`, { g: fmt(roundGpa(f.projectedGpa!, f.policy)), t: fmt(f.target), d: fmt(Math.abs(gap)), name: targetName }) : '';
  const saveText = { idle: t('gpa.save.idle'), saving: t('gpa.save.saving'), saved: t('gpa.save.saved'), error: t('gpa.save.error'), conflict: t('gpa.save.conflict') }[save];

  return (
    <div>
      <PageHeader crumbs={[{ to: '/academics', label: t('nav.academics') }]} title={t('gpa.title')} subtitle={t('gpa.subtitle')}
        actions={<span role="status" className={clsx('flex items-center gap-2 text-sm', save === 'error' || save === 'conflict' ? 'text-danger' : 'text-muted')}>
          {saveText}
          {save === 'error' && <Button size="sm" variant="outline" onClick={retry}>{t('common.retry')}</Button>}
          {save === 'conflict' && <Button size="sm" variant="outline" onClick={() => void q.refetch()}>{t('gpa.save.reload')}</Button>}
        </span>} />
      <AcademicsNav />

      {/* Three figures, kept visibly apart: the transcript, this term's estimate, and the forecast. */}
      <section aria-labelledby="gpa-summary-h" className="mb-6">
        <h2 id="gpa-summary-h" className="sr-only">{t('gpa.summary')}</h2>
        <dl className="grid grid-cols-1 divide-y divide-line rounded-2xl border border-line sm:grid-cols-3 sm:divide-x sm:divide-y-0 rtl:sm:divide-x-reverse">
          <div className="p-4">
            <dt className="flex items-center gap-2 text-sm text-muted"><Kind kind="official" />{t('gpa.official')}</dt>
            <dd className="num mt-1 text-3xl font-bold tracking-tight">{fmt(d.official.gpa)}</dd>
            <dd className="text-sm text-muted">{t('gpa.official.meta', { gpa: d.official.gpaCredits, earned: d.official.earnedCredits })}</dd>
          </div>
          <div className="p-4">
            <dt className="flex items-center gap-2 text-sm text-muted"><Kind kind="estimate" />{t('gpa.thisTerm', { term: l(d.current.label.en, d.current.label.ar) })}</dt>
            <dd className="num mt-1 text-3xl font-bold tracking-tight">{fmt(f.termEstimate.gpa)}</dd>
            <dd className="text-sm text-muted">{f.estimateCount ? t('gpa.thisTerm.meta', { n: f.estimateCount, total: doc.current.courses.length }) : t('gpa.thisTerm.none')}</dd>
          </div>
          <div className="p-4">
            <dt className="flex items-center gap-2 text-sm text-muted"><Kind kind="whatif" />{t('gpa.forecast')}</dt>
            <dd className="num mt-1 text-3xl font-bold tracking-tight">{f.basis === 'official' ? '—' : fmt(roundGpa(f.projectedGpa!, f.policy))}</dd>
            <dd className="text-sm text-muted">{basisText}</dd>
          </div>
        </dl>
      </section>

      {/* Target: scholarship category, a published GPA line, or a custom number. */}
      <section aria-labelledby="gpa-target-h" className="mb-8">
        <div className="flex flex-wrap items-end gap-3">
          <label className="text-sm">
            <span id="gpa-target-h" className="mb-1 block font-semibold">{t('gpa.target')}</span>
            <Select value={targetValue} onChange={(e) => setTarget(e.target.value)} className="!w-auto !min-w-64">
              <option value="none">{t('gpa.target.none')}</option>
              <optgroup label={l(sch.name_en, sch.name_ar)}>
                {sch.categories.map((c) => <option key={c.id} value={c.id}>{t('gpa.target.category', { d: c.discount, g: c.min_gpa.toFixed(2) })}</option>)}
              </optgroup>
              <optgroup label={t('gpa.target.other')}>
                {d.markers.map((m) => <option key={m.id} value={`m:${m.id}`}>{`${m.min_gpa.toFixed(2)} · ${l(m.label_en, m.label_ar).split(' (')[0]}`}</option>)}
                <option value="custom">{t('gpa.target.custom')}</option>
              </optgroup>
            </Select>
          </label>
          {doc.target.kind === 'custom' && (
            <label className="text-sm">
              <span className="mb-1 block font-medium">{t('gpa.target.customLabel')}</span>
              <Input inputMode="decimal" value={doc.target.gpa ?? ''} onChange={(e) => update((p) => ({ ...p, target: { ...p.target, gpa: Math.min(4, Math.max(0, numOrNull(e.target.value) ?? 0)) } }))} className="!w-24 text-end" />
            </label>
          )}
          {f.status && (
            <div className="relative">
              <button type="button" aria-expanded={detailsOpen} aria-controls="gpa-status-details" onClick={() => setDetailsOpen((v) => !v)}
                className={clsx('inline-flex min-h-11 items-center gap-2 rounded-xl px-3 text-sm font-semibold ring-1', f.status === 'on_track' ? 'text-success ring-success/40' : f.status === 'close' ? 'text-warn ring-warn/40' : 'text-danger ring-danger/40')}>
                {f.status === 'on_track' ? <Check className="h-4 w-4" aria-hidden /> : <AlertTriangle className="h-4 w-4" aria-hidden />}
                {statusText} · <span className="num">{fmt(roundGpa(f.projectedGpa!, f.policy))}</span>
              </button>
            </div>
          )}
        </div>
        {(showNudge || detailsOpen) && f.status && (
          <div id="gpa-status-details" role={showNudge && !detailsOpen ? 'status' : undefined} className="mt-3 max-w-2xl rounded-xl bg-surface-2 p-4 text-sm">
            <div className="flex items-start gap-3">
              <div className="min-w-0 flex-1 space-y-1.5">
                <p className="font-semibold">{nudgeText}</p>
                <p className="text-muted">{t('gpa.assumptions', { basis: basisText })}{f.missing.length ? ` ${t('gpa.assumptions.missing', { list: f.missing.join(', ') })}` : ''}</p>
                <p className="text-muted">{t('gpa.notDecision')}</p>
              </div>
              <Button size="icon" variant="ghost" aria-label={t('gpa.dismiss')} onClick={() => { setDetailsOpen(false); if (alertKey) update((p) => ({ ...p, dismissed: [...p.dismissed.filter((x) => x !== alertKey), alertKey].slice(-50) })); }}><X className="h-4 w-4" /></Button>
            </div>
          </div>
        )}
        {doc.target.kind === 'scholarship' && (
          <p className="mt-2 max-w-3xl text-sm text-muted">
            <a href={sch.url} target="_blank" rel="noreferrer noopener" className="font-medium text-brand-600 hover:underline">{l(sch.name_en, sch.name_ar)}<ExternalLink className="ms-1 inline h-3 w-3" aria-hidden /></a>
            {' · '}{t('gpa.checked', { date: fmtDate(sch.checked, locale) })}{sch.effective ? '' : ` · ${t('gpa.noEffective')}`}. {l(sch.note_en, sch.note_ar)}
          </p>
        )}
        {f.target !== null && f.need && (
          <p className="mt-3 max-w-3xl text-sm">
            {f.need.state === 'no_credits' ? t('gpa.need.noCredits')
              : f.need.state === 'secured' ? t('gpa.need.cumSecured', { n: f.futureCredits, t: fmt(f.target) })
              : f.need.state === 'impossible' ? t('gpa.need.cumImpossible', { n: f.futureCredits, t: fmt(f.target), a: fmt(f.need.average) })
              : t('gpa.need.cumPossible', { n: f.futureCredits, t: fmt(f.target), a: fmt(f.need.average), l: nearestLetter(f.need.average!, f.policy) })}
            {f.need.range && f.need.state !== 'no_credits' && <span className="text-muted"> {t('gpa.need.range', { lo: fmt(roundGpa(f.need.range[0], f.policy)), hi: fmt(roundGpa(f.need.range[1], f.policy)) })}</span>}
            {f.needRemaining && f.needRemaining.state !== 'no_credits' && d.remainingCredits !== null && (
              <span className="block text-muted">{t(`gpa.need.remaining.${f.needRemaining.state}`, { n: Math.max(0, d.remainingCredits - doc.current.courses.reduce((s, c) => s + (c.passFail ? 0 : c.credits), 0)), a: fmt(f.needRemaining.average), t: fmt(f.target) })}</span>
            )}
          </p>
        )}
      </section>

      <Tabs value={tab} onChange={setTab} label={t('gpa.sections')} className="mb-4 w-fit"
        items={[{ value: 'term', label: t('gpa.tab.term') }, { value: 'future', label: t('gpa.tab.future') }, { value: 'how', label: t('gpa.tab.how') }]} />

      {tab === 'term' && (
        <section aria-label={t('gpa.tab.term')}>
          <p className="mb-2 max-w-3xl text-sm text-muted">{t('gpa.term.help')}</p>
          {doc.current.courses.length === 0 ? <p className="py-6 text-muted">{t('gpa.term.noCourses')}</p> : (
            <div>{doc.current.courses.map((c, i) => <CurrentCourseEditor key={c.id} c={c} policy={f.policy} onChange={(nc) => update((p) => ({ ...p, current: { ...p.current, courses: p.current.courses.map((x, k) => (k === i ? nc : x)) } }))} />)}</div>
          )}
        </section>
      )}

      {tab === 'future' && <ScenarioEditor doc={doc} d={d} policy={f.policy} update={update} />}

      {tab === 'how' && (
        <section aria-label={t('gpa.tab.how')} className="max-w-3xl space-y-6 text-sm">
          <div>
            <h3 className="mb-1 text-base font-semibold">{t('gpa.how.formula')}</h3>
            <p className="num rounded-xl bg-surface-2 p-3" dir="ltr">GPA = Σ (grade points × credits) ÷ Σ credits</p>
            <p className="mt-2 text-muted">{t('gpa.how.excluded')}</p>
          </div>
          <div>
            <h3 className="mb-2 text-base font-semibold">{l(d.policy.name_en, d.policy.name_ar)}</h3>
            <table className="w-full max-w-md text-start">
              <thead><tr className="text-muted"><th scope="col" className="py-1 text-start font-medium">{t('gpa.how.letter')}</th><th scope="col" className="py-1 text-start font-medium">{t('gpa.how.marks')}</th><th scope="col" className="py-1 text-start font-medium">{t('gpa.how.points')}</th></tr></thead>
              <tbody className="num">
                {d.policy.bands.map((b, i) => <tr key={b.letter} className="border-t border-line"><td className="py-1 font-semibold">{b.letter}</td><td className="py-1">{i === 0 ? `${b.min}–100` : `${b.min}–${d.policy.bands[i - 1].min - 1}`}</td><td className="py-1">{d.policy.points[b.letter]}</td></tr>)}
              </tbody>
            </table>
            <p className="mt-2 text-muted">{l(d.policy.source_en, d.policy.source_ar)}</p>
            <ul className="mt-1 space-y-1">{d.sources.map((s) => <li key={s.url}><a href={s.url} target="_blank" rel="noreferrer noopener" className="font-medium text-brand-600 hover:underline">{l(s.label_en, s.label_ar)}<ExternalLink className="ms-1 inline h-3 w-3" aria-hidden /></a></li>)}</ul>
          </div>
          <div className="grid gap-4 sm:grid-cols-3">
            <label><span className="mb-1 block font-medium">{t('gpa.how.repeat')}</span>
              <Select value={doc.settings.repeat} onChange={(e) => update((p) => ({ ...p, settings: { ...p.settings, repeat: e.target.value as PlanDoc['settings']['repeat'] } }))}>
                {(['all', 'latest', 'highest'] as const).map((r) => <option key={r} value={r}>{t(`gpa.how.repeat.${r}`)}{r === d.policy.repeat ? ` (${t('gpa.how.yu')})` : ''}</option>)}
              </Select></label>
            <label><span className="mb-1 block font-medium">{t('gpa.how.rounding')}</span>
              <Select value={doc.settings.rounding} onChange={(e) => update((p) => ({ ...p, settings: { ...p.settings, rounding: e.target.value as PlanDoc['settings']['rounding'] } }))}>
                <option value="round">{t('gpa.how.round')}</option><option value="truncate">{t('gpa.how.truncate')}</option>
              </Select></label>
            <label><span className="mb-1 block font-medium">{t('gpa.how.headroom')}</span>
              <Select value={String(doc.settings.headroom)} onChange={(e) => update((p) => ({ ...p, settings: { ...p.settings, headroom: Number(e.target.value) } }))}>
                {[0.05, 0.1, 0.2].map((x) => <option key={x} value={x}>{x.toFixed(2)}</option>)}
              </Select></label>
          </div>
          {(doc.settings.repeat !== d.policy.repeat || doc.settings.rounding !== d.policy.rounding) && <IssueLine tone="warn">{t('gpa.how.differs')}</IssueLine>}
          <div>
            <h3 className="mb-1 text-base font-semibold">{t('gpa.how.byTerm')}</h3>
            <ul className="num divide-y divide-line">{d.official.byTerm.map((x) => <li key={x.term} className="flex justify-between py-1.5"><span>{l(x.label.en, x.label.ar)}</span><span>{fmt(x.gpa)} <span className="text-muted">· {t('gpa.how.credits', { n: x.gpaCredits })}</span></span></li>)}</ul>
            {d.official.excluded.length > 0 && <p className="mt-2 text-muted">{t('gpa.how.notCounted', { list: d.official.excluded.map((x) => `${x.course_code} (${x.grade ?? '—'})`).join(', ') })}</p>}
          </div>
          <div className="border-t border-line pt-4">
            <h3 className="mb-1 text-base font-semibold">{t('gpa.privacy')}</h3>
            <p className="text-muted">{t('gpa.privacy.body')}</p>
            <Button className="mt-2" variant="outline" icon={<Trash2 className="h-4 w-4" />} onClick={() => setConfirmWipe(true)}>{t('gpa.privacy.delete')}</Button>
          </div>
        </section>
      )}
      <ConfirmDialog open={confirmWipe} onClose={() => setConfirmWipe(false)} danger title={t('gpa.privacy.deleteTitle')} body={t('gpa.privacy.deleteBody')} confirmLabel={t('gpa.privacy.delete')}
        onConfirm={async () => { try { await api('/academics/gpa', { method: 'DELETE' }); setConfirmWipe(false); toast.success(t('gpa.privacy.deleted')); void q.refetch(); } catch (e) { toast.error(t('common.error'), errorMessage(e)); } }} />
    </div>
  );
}
