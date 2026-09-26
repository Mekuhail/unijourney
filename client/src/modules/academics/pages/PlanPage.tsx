import { useMemo, useState } from 'react';
import { Link } from 'react-router';
import clsx from 'clsx';
import { GraduationCap, Info } from 'lucide-react';
import { useI18n } from '@/i18n';
import { api } from '@/lib/api';
import { useQuery } from '@/lib/useQuery';
import { PageHeader } from '@/components/ui/PageHeader';
import { Card, SectionTitle, Skeleton, ErrorState, Progress, Badge, Callout, Tabs, Button, ButtonLink } from '@/components/ui';
import { AcademicsNav } from '../components';
import { termLabel, type DegreePlan, type PlanCourse } from '../api';

const STATUS_TONE: Record<string, string> = { completed: 'border-success/40 bg-success/10', equivalent: 'border-gold-500/60 bg-gold-100/60 dark:bg-gold-700/20', enrolled: 'border-brand-500/50 bg-brand-500/10', planned: 'border-info/40 bg-info/10', available: 'border-line bg-surface', blocked: 'border-dashed border-line bg-line/40' };
const DOT: Record<string, string> = { completed: '#1f8a5b', equivalent: '#c8975b', enrolled: '#f0762b', planned: '#2f6fdb', available: '#8f857b', blocked: '#d9cfc4' };

function CoursePill({ c, onSelect, selected }: { c: PlanCourse; onSelect: (code: string | null) => void; selected: boolean }) {
  const { t, l } = useI18n();
  const body = (
    <div className={clsx('rounded-xl border p-2.5 text-sm transition', STATUS_TONE[c.status] ?? STATUS_TONE.available, selected && 'ring-2 ring-brand-500', c.code && 'hover:border-brand-400')}>
      <div className="flex items-center justify-between gap-2">
        <span className="font-semibold">{c.code ?? l(c.slot_label_en ?? c.title_en, c.slot_label_ar ?? c.title_ar)}</span>
        <span className="num text-xs text-muted">{c.credits} {t('common.credits')}</span>
      </div>
      <div className="truncate text-xs text-muted">{c.code ? l(c.title_en, c.title_ar) : c.candidates?.length ? t('academics.plan.candidates', { n: c.candidates.length }) : t('academics.plan.noCandidates')}</div>
      <div className="mt-1.5 flex flex-wrap items-center gap-1">
        <span className="inline-flex items-center gap-1 text-xs font-semibold"><span className="h-1.5 w-1.5 rounded-full" style={{ background: DOT[c.status] }} />{t(`status.${c.status}`)}</span>
        {c.grade && <span className="num rounded bg-line/70 px-1 text-xs">{c.grade}</span>}
        {c.term && <span className="num text-xs text-muted">{termLabel(c.term, 'en')}</span>}
        {c.status === 'blocked' && c.reasons.length > 0 && <span className="text-xs text-danger">{c.reasons.join('; ')}</span>}
      </div>
    </div>
  );
  return c.code ? <button type="button" className="block w-full text-start" onClick={() => onSelect(selected ? null : c.code)} aria-pressed={selected}>{body}</button> : <div>{body}</div>;
}

function PrereqGraph({ plan, selected, onSelect }: { plan: DegreePlan; selected: string | null; onSelect: (c: string | null) => void }) {
  const { t } = useI18n();
  const layout = useMemo(() => {
    const pos = new Map<string, { x: number; y: number; status: string }>();
    const colW = 118, rowH = 34;
    plan.terms.forEach((term, ci) => { let ri = 0; for (const c of term.courses) if (c.code) { pos.set(c.code, { x: 60 + ci * colW, y: 30 + ri * rowH, status: c.status }); ri++; } });
    const w = 60 + plan.terms.length * colW, h = 30 + Math.max(...plan.terms.map((tm) => tm.courses.length)) * rowH + 10;
    return { pos, w, h, colW };
  }, [plan]);
  const related = useMemo(() => {
    const set = new Set<string>();
    if (!selected) return set;
    const up = (c: string) => { for (const e of plan.graph.edges) if (e.to === c && !set.has(e.from)) { set.add(e.from); up(e.from); } };
    const down = (c: string) => { for (const e of plan.graph.edges) if (e.from === c && !set.has(e.to)) { set.add(e.to); down(e.to); } };
    up(selected); down(selected); set.add(selected);
    return set;
  }, [selected, plan]);
  return (
    <div className="overflow-x-auto">
      <svg width={layout.w} height={layout.h} role="img" aria-label={t('academics.plan.graphAria')} className="min-w-full">
        {plan.terms.map((term, ci) => <text key={ci} x={60 + ci * layout.colW} y={14} fontSize={10} fill="var(--muted)" fontWeight={600}>Y{term.year}S{term.sem}</text>)}
        {plan.graph.edges.map((e, i) => {
          const a = layout.pos.get(e.from), b = layout.pos.get(e.to);
          if (!a || !b) return null;
          const hi = selected ? related.has(e.from) && related.has(e.to) : false;
          const x1 = a.x + 96, y1 = a.y + 10, x2 = b.x, y2 = b.y + 10;
          return <path key={i} d={`M${x1},${y1} C${x1 + 40},${y1} ${x2 - 40},${y2} ${x2},${y2}`} fill="none" stroke={hi ? 'var(--accent)' : 'var(--line)'} strokeWidth={hi ? 2 : 1} strokeDasharray={e.alt ? '4 3' : undefined} opacity={selected && !hi ? 0.35 : 1} />;
        })}
        {[...layout.pos.entries()].map(([code, p]) => {
          const dim = selected && !related.has(code);
          return (
            <g key={code} transform={`translate(${p.x},${p.y})`} onClick={() => onSelect(selected === code ? null : code)} style={{ cursor: 'pointer' }} opacity={dim ? 0.35 : 1} role="button" aria-label={code}>
              <rect width={96} height={22} rx={7} fill="var(--surface)" stroke={selected === code ? 'var(--accent)' : DOT[p.status]} strokeWidth={selected === code ? 2 : 1.4} />
              <circle cx={10} cy={11} r={4} fill={DOT[p.status]} />
              <text x={20} y={15} fontSize={10.5} fontWeight={600} fill="var(--fg)">{code}</text>
            </g>
          );
        })}
      </svg>
    </div>
  );
}

export function PlanPage() {
  const { t, l } = useI18n();
  const [selected, setSelected] = useState<string | null>(null);
  const [view, setView] = useState<'map' | 'graph' | 'audit'>('map');
  const q = useQuery(() => api<DegreePlan>('/academics/plan'), [], { refreshOn: ['academics', 'persona'] });
  if (q.error) return <div><AcademicsNav /><ErrorState error={q.error} onRetry={q.refetch} /></div>;
  if (!q.data) return <div><AcademicsNav /><Skeleton className="h-64" /></div>;
  const d = q.data;
  const a = d.audit;
  const sel = selected ? d.terms.flatMap((x) => x.courses).find((c) => c.code === selected) : null;
  return (
    <div>
      <PageHeader crumbs={[{ to: '/academics', label: t('nav.academics') }]} title={t('academics.plan.title')} subtitle={`${l(d.program.en, d.program.ar)} · ${t('academics.plan.subtitle')}`} actions={<ButtonLink to="/journey/graduation" variant="outline" size="sm" icon={<GraduationCap className="h-4 w-4" />}>{t('academics.plan.graduation')}</ButtonLink>} />
      <AcademicsNav />
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <Tabs value={view} onChange={setView} items={[{ value: 'map', label: t('academics.plan.map') }, { value: 'graph', label: t('academics.plan.graph') }, { value: 'audit', label: t('academics.plan.audit') }]} />
        <div className="flex flex-wrap gap-2 text-xs">{Object.entries(DOT).map(([k, c]) => <span key={k} className="inline-flex items-center gap-1"><span className="h-2 w-2 rounded-full" style={{ background: c }} />{t(`status.${k}`)}</span>)}</div>
      </div>
      {sel && (
        <Callout tone="info" title={`${sel.code} · ${l(sel.title_en, sel.title_ar)}`}>
          <div className="flex flex-wrap items-center gap-3 text-sm">
            <span>{t(`status.${sel.status}`)}{sel.reasons.length ? ` · ${sel.reasons.join('; ')}` : ''}</span>
            <Link to={`/academics/courses/${encodeURIComponent(sel.code!)}`} className="font-semibold text-brand-600 hover:underline">{t('academics.plan.courseDetails')}</Link>
            <Link to={`/campus/resources?course=${encodeURIComponent(sel.code!)}`} className="font-semibold text-brand-600 hover:underline">{t('academics.course.resources')}</Link>
          </div>
        </Callout>
      )}
      {view === 'map' && (
        <div className="mt-4 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {d.terms.map((term) => (
            <Card key={`${term.year}-${term.sem}`} className="!p-4">
              <div className="mb-2 flex items-center justify-between"><span className="text-sm font-semibold">{l(term.label_en, term.label_ar)}</span><span className="num text-xs text-muted">{term.courses.reduce((s, c) => s + c.credits, 0)} {t('common.credits')}</span></div>
              <div className="space-y-2">{term.courses.map((c, i) => <CoursePill key={c.code ?? `${term.year}${term.sem}${i}`} c={c} selected={selected === c.code} onSelect={setSelected} />)}</div>
            </Card>
          ))}
        </div>
      )}
      {view === 'graph' && (
        <Card className="mt-4">
          <div className="mb-2 flex items-center gap-2 text-xs text-muted"><Info className="h-3.5 w-3.5" />{t('academics.plan.graphHint')}</div>
          <PrereqGraph plan={d} selected={selected} onSelect={setSelected} />
        </Card>
      )}
      {view === 'audit' && (
        <div className="mt-4 grid gap-4 lg:grid-cols-3">
          <div className="space-y-3 lg:col-span-2">
            {a.buckets.map((b) => (
              <Card key={b.id} className="!p-4">
                <div className="flex items-center justify-between gap-3">
                  <div><div className="font-semibold">{l(b.label_en, b.label_ar)}</div><div className="text-xs text-muted">{t('academics.plan.bucketLine', { earned: b.earned_credits, inProgress: b.in_progress_credits, required: b.required_credits })}</div></div>
                  <Badge tone={b.remaining_credits === 0 ? 'success' : b.remaining_credits <= b.in_progress_credits ? 'info' : 'warn'}>{b.remaining_credits === 0 ? t('academics.plan.met') : t('academics.plan.remaining', { n: b.remaining_credits })}</Badge>
                </div>
                <Progress label={l(b.label_en, b.label_ar)} value={b.earned_credits} max={Math.max(1, b.required_credits)} tone={b.remaining_credits === 0 ? 'success' : 'brand'} className="mt-2" />
                <div className="mt-2 flex flex-wrap gap-1">{b.courses.map((c) => <span key={c.code} className={clsx('rounded-md border px-1.5 py-0.5 text-xs font-medium', STATUS_TONE[c.status === 'missing' ? 'blocked' : c.status] ?? 'border-line')} title={c.title_en}>{c.code}{c.grade ? ` · ${c.grade}` : ''}</span>)}</div>
              </Card>
            ))}
          </div>
          <div className="space-y-3">
            <Card>
              <SectionTitle>{t('academics.plan.summary')}</SectionTitle>
              <div className="grid grid-cols-2 gap-3 text-center">
                <div className="card-2 p-3"><div className="num text-2xl font-bold text-success">{a.earned}</div><div className="text-xs text-muted">{t('status.completed')}</div></div>
                <div className="card-2 p-3"><div className="num text-2xl font-bold text-brand-600">{a.in_progress}</div><div className="text-xs text-muted">{t('status.enrolled')}</div></div>
                <div className="card-2 p-3"><div className="num text-2xl font-bold text-info">{a.planned}</div><div className="text-xs text-muted">{t('status.planned')}</div></div>
                <div className="card-2 p-3"><div className="num text-2xl font-bold">{a.remaining}</div><div className="text-xs text-muted">{t('academics.plan.toGo')}</div></div>
              </div>
              <div className="mt-3 text-xs text-muted">{t('academics.plan.neverCounted')}</div>
              {a.estimate && <div className="mt-2 text-xs text-muted">{t('academics.overview.estimate', { terms: a.estimate.terms_remaining })} ({termLabel(a.estimate.earliest_completion_term, 'en')}).</div>}
            </Card>
            {a.unmet.length > 0 && (
              <Card>
                <SectionTitle>{t('academics.plan.unmet')}</SectionTitle>
                <ul className="space-y-2 text-sm">{a.unmet.map((u) => <li key={u.bucket} className="flex items-start justify-between gap-2"><span>{u.bucket}</span><span className="num text-xs text-muted">{u.remaining_credits} {t('common.credits')}{u.suggestions.length ? ` · ${u.suggestions.join(', ')}` : ''}</span></li>)}</ul>
              </Card>
            )}
            <Card>
              <SectionTitle>{t('academics.plan.nextTermEligible')}</SectionTitle>
              <div className="flex flex-wrap gap-1">{d.next_term.eligibility.filter((e) => e.eligible).map((e) => <Link key={e.code} to={`/academics/register?course=${encodeURIComponent(e.code)}`} className="inline-flex items-center touch:min-h-11 rounded-md border border-line px-2.5 py-0.5 text-xs font-medium hover:border-brand-400">{e.code}</Link>)}</div>
              <Link to="/academics/register" className="inline-flex min-h-11 items-center text-sm mt-3 font-semibold text-brand-600 hover:underline">{t('academics.overview.planNext', { term: termLabel(d.next_term.id, 'en') })}</Link>
            </Card>
          </div>
        </div>
      )}
    </div>
  );
}
