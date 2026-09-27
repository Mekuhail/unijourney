import { useMemo, useState } from 'react';
import { Link } from 'react-router';
import clsx from 'clsx';
import { ChevronDown, GraduationCap, ListChecks } from 'lucide-react';
import { useI18n } from '@/i18n';
import { api } from '@/lib/api';
import { useQuery } from '@/lib/useQuery';
import { PageHeader } from '@/components/ui/PageHeader';
import { Skeleton, ErrorState, ButtonLink } from '@/components/ui';
import { AcademicsNav } from '../components';
import { termLabel, type DegreePlan, type PlanCourse } from '../api';

const STATUS_TONE: Record<string, string> = { completed: 'border-success/40 bg-success/10', equivalent: 'border-gold-500/60 bg-gold-100/60 dark:bg-gold-700/20', enrolled: 'border-brand-500/50 bg-brand-500/10', planned: 'border-info/40 bg-info/10', available: 'border-line bg-surface', blocked: 'border-line bg-line/40' };
const DOT: Record<string, string> = { completed: '#1f8a5b', equivalent: '#c8975b', enrolled: '#f0762b', planned: '#2f6fdb', available: '#8f857b', blocked: '#b3a89c' };
const DONE = new Set(['completed', 'equivalent']);

/** Status is always a word next to the dot, never colour alone. */
function StatusText({ status }: { status: string }) {
  const { t } = useI18n();
  return <span className="inline-flex items-center gap-1 text-xs font-semibold"><span className="h-1.5 w-1.5 rounded-full" style={{ background: DOT[status] }} aria-hidden />{t(`status.${status}`)}</span>;
}

function KindChip({ kind }: { kind: 'general' | 'major' }) {
  const { t } = useI18n();
  return <span className={clsx('rounded-md px-1.5 py-0.5 text-xs font-semibold', kind === 'general' ? 'bg-gold-500/20 text-gold-700' : 'bg-brand-500/15 text-brand-700 dark:text-brand-300')}>{t(`academics.plan.kind.${kind}`)}</span>;
}

/** A fixed course or a filled elective slot: tap to see status, reasons and links right under it. */
function CourseRow({ c, open, onToggle }: { c: PlanCourse; open: boolean; onToggle: () => void }) {
  const { t, l, locale } = useI18n();
  return (
    <li className={clsx('rounded-xl border text-sm', STATUS_TONE[c.status] ?? STATUS_TONE.available, open && 'ring-2 ring-brand-500')}>
      <button type="button" onClick={onToggle} aria-expanded={open} className="block w-full p-2.5 text-start">
        <span className="flex items-center justify-between gap-2">
          <span className="font-semibold">{c.code}</span>
          <span className="num text-xs text-muted">{c.credits} {t('common.credits')}</span>
        </span>
        <span className="block text-xs text-muted" dir="auto">{l(c.title_en, c.title_ar)}</span>
        <span className="mt-1.5 flex flex-wrap items-center gap-1.5">
          <StatusText status={c.status} />
          {c.elective_kind && <KindChip kind={c.elective_kind} />}
          {c.grade && <span className="num rounded bg-line/70 px-1 text-xs">{c.grade}</span>}
          {c.term && <span className="num text-xs text-muted">{termLabel(c.term, locale)}</span>}
        </span>
      </button>
      {open && (
        <div className="border-t border-line/70 px-2.5 pb-2.5 pt-2 text-xs">
          {c.status === 'blocked' && c.reasons.length > 0 && <p className="text-danger">{c.reasons.join('; ')}</p>}
          {c.elective_kind && <p className="text-muted">{t('academics.plan.fillsSlot', { slot: l(c.slot_label_en ?? '', c.slot_label_ar) })}</p>}
          <div className="mt-1 flex flex-wrap gap-x-3">
            <Link to={`/academics/courses/${encodeURIComponent(c.code!)}`} className="inline-flex min-h-11 items-center font-semibold text-brand-600 hover:underline sm:min-h-0">{t('academics.plan.courseDetails')}</Link>
            <Link to={`/prereqs?course=${encodeURIComponent(c.code!)}`} className="inline-flex min-h-11 items-center font-semibold text-brand-600 hover:underline sm:min-h-0">{t('academics.plan.showChain')}</Link>
            <Link to={`/campus/resources?course=${encodeURIComponent(c.code!)}`} className="inline-flex min-h-11 items-center font-semibold text-brand-600 hover:underline sm:min-h-0">{t('academics.course.resources')}</Link>
          </div>
        </div>
      )}
    </li>
  );
}

/** An open elective slot: dashed, labelled by kind, and it opens its options in place. */
function ElectiveSlot({ c, open, onToggle, nextTerm }: { c: PlanCourse; open: boolean; onToggle: () => void; nextTerm: string }) {
  const { t, l, locale } = useI18n();
  const options = c.options ?? [];
  const eligible = options.filter((o) => o.status === 'available');
  return (
    <li className={clsx('rounded-xl border border-dashed text-sm', c.elective_kind === 'general' ? 'border-gold-500/70' : 'border-brand-500/60', open && 'ring-2 ring-brand-500')}>
      <button type="button" onClick={onToggle} aria-expanded={open} className="block w-full p-2.5 text-start">
        <span className="flex items-center justify-between gap-2">
          <span className="font-semibold" dir="auto">{l(c.slot_label_en ?? c.title_en, c.slot_label_ar ?? c.title_ar)}</span>
          <span className="num text-xs text-muted">{c.credits} {t('common.credits')}</span>
        </span>
        <span className="mt-1 flex flex-wrap items-center gap-1.5">
          {c.elective_kind && <KindChip kind={c.elective_kind} />}
          <span className="text-xs text-muted">{t('academics.plan.slotOpen')}</span>
          <span className="inline-flex items-center gap-0.5 text-xs font-semibold text-brand-600">{eligible.length ? t('academics.plan.chooseN', { n: eligible.length }) : t('academics.plan.noCandidates')}<ChevronDown className={clsx('h-3.5 w-3.5 transition-transform', open && 'rotate-180')} aria-hidden /></span>
        </span>
      </button>
      {open && (
        <div className="border-t border-line/70 px-2.5 pb-2 pt-1">
          <p className="py-1 text-xs text-muted">{t(c.elective_kind === 'general' ? 'academics.plan.generalHelp' : 'academics.plan.majorHelp')}</p>
          <ul className="divide-y divide-line/70">
            {options.map((o) => (
              <li key={o.code} className="py-2">
                <div className="flex items-start justify-between gap-2">
                  <span className="min-w-0"><span className="font-semibold">{o.code}</span> <span className="text-muted" dir="auto">{l(o.title_en, o.title_ar)}</span></span>
                  <StatusText status={o.status} />
                </div>
                {o.status === 'blocked' && o.reasons.length > 0 && <p className="text-xs text-danger">{o.reasons.join('; ')}</p>}
                <div className="flex flex-wrap gap-x-3 text-xs">
                  <Link to={`/academics/courses/${encodeURIComponent(o.code)}`} className="inline-flex min-h-11 items-center font-semibold text-brand-600 hover:underline sm:min-h-0">{t('academics.plan.courseDetails')}</Link>
                  {o.next_term && <Link to={`/academics/register?course=${encodeURIComponent(o.code)}`} className="inline-flex min-h-11 items-center font-semibold text-brand-600 hover:underline sm:min-h-0">{t('academics.plan.addToBasket', { term: termLabel(nextTerm, locale) })}</Link>}
                </div>
              </li>
            ))}
          </ul>
        </div>
      )}
    </li>
  );
}

export function PlanPage() {
  const { t, l } = useI18n();
  const [open, setOpen] = useState<string | null>(null);
  const [showDone, setShowDone] = useState<Set<number>>(new Set());
  const q = useQuery(() => api<DegreePlan>('/academics/plan'), [], { refreshOn: ['academics', 'persona'] });
  const years = useMemo(() => {
    if (!q.data) return [];
    const by = new Map<number, DegreePlan['terms']>();
    for (const tm of q.data.terms) by.set(tm.year, [...(by.get(tm.year) ?? []), tm]);
    return [...by.entries()].map(([year, terms]) => {
      const courses = terms.flatMap((x) => x.courses);
      return { year, terms, done: courses.every((c) => c.code && DONE.has(c.status)), current: courses.some((c) => c.status === 'enrolled'), credits: courses.reduce((s, c) => s + c.credits, 0) };
    });
  }, [q.data]);
  const header = <PageHeader crumbs={[{ to: '/academics', label: t('nav.academics') }]} title={t('academics.plan.title')} subtitle={q.data ? `${l(q.data.program.en, q.data.program.ar)} · ${t('academics.plan.subtitle')}` : t('academics.plan.subtitle')}
    actions={<><ButtonLink to="/academics/requirements" variant="outline" size="sm" icon={<ListChecks className="h-4 w-4" />}>{t('academics.req.title')}</ButtonLink><ButtonLink to="/journey/graduation" variant="ghost" size="sm" icon={<GraduationCap className="h-4 w-4" />}>{t('academics.plan.graduation')}</ButtonLink></>} />;
  if (q.error) return <div>{header}<AcademicsNav /><ErrorState error={q.error} onRetry={q.refetch} /></div>;
  if (!q.data) return <div>{header}<AcademicsNav /><Skeleton className="h-64" /></div>;
  const d = q.data;
  const toggle = (key: string) => setOpen((o) => (o === key ? null : key));
  return (
    <div>
      {header}
      <AcademicsNav />
      <p className="mb-5 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted">
        {Object.keys(DOT).map((k) => <StatusText key={k} status={k} />)}
        <span className="inline-flex items-center gap-1.5"><span className="h-3 w-5 rounded border border-dashed border-muted" aria-hidden />{t('academics.plan.legendSlot')}</span>
      </p>
      <div className="space-y-8">
        {years.map((y) => {
          const collapsed = y.done && !showDone.has(y.year);
          return (
            <section key={y.year} aria-labelledby={`year-${y.year}`}>
              <div className="mb-3 flex flex-wrap items-center gap-x-3 gap-y-1">
                <h2 id={`year-${y.year}`} className="text-lg font-semibold">{t('academics.plan.year', { n: y.year })}</h2>
                {y.current && <span className="rounded-md bg-brand-500/15 px-1.5 py-0.5 text-xs font-semibold text-brand-700 dark:text-brand-300">{t('academics.plan.thisYear')}</span>}
                {y.done && <span className="text-sm text-muted">{t('academics.plan.yearDone', { n: y.credits })}</span>}
                {y.done && (
                  <button type="button" aria-expanded={!collapsed} onClick={() => setShowDone((s) => { const n = new Set(s); if (n.has(y.year)) n.delete(y.year); else n.add(y.year); return n; })} className="inline-flex min-h-11 items-center gap-1 text-sm font-medium text-brand-600 hover:underline sm:min-h-0">
                    {collapsed ? t('academics.plan.showYear') : t('academics.plan.hideYear')}<ChevronDown className={clsx('h-4 w-4 transition-transform', !collapsed && 'rotate-180')} aria-hidden />
                  </button>
                )}
              </div>
              {!collapsed && (
                <div className="grid gap-4 md:grid-cols-2">
                  {y.terms.map((term) => (
                    <div key={`${term.year}-${term.sem}`} className="rounded-2xl border border-line p-3">
                      <div className="mb-2 flex items-center justify-between px-1">
                        <h3 className="text-sm font-semibold">{l(term.label_en, term.label_ar)}</h3>
                        <span className="num text-xs text-muted">{term.courses.reduce((s, c) => s + c.credits, 0)} {t('common.credits')}</span>
                      </div>
                      <ul className="space-y-2">
                        {term.courses.map((c, i) => {
                          const key = c.code ?? `${term.year}-${term.sem}-${i}`;
                          return c.code
                            ? <CourseRow key={key} c={c} open={open === key} onToggle={() => toggle(key)} />
                            : <ElectiveSlot key={key} c={c} open={open === key} onToggle={() => toggle(key)} nextTerm={d.next_term.id} />;
                        })}
                      </ul>
                    </div>
                  ))}
                </div>
              )}
            </section>
          );
        })}
      </div>
    </div>
  );
}
