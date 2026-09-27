import { Link } from 'react-router';
import clsx from 'clsx';
import { useI18n } from '@/i18n';
import { api } from '@/lib/api';
import { useQuery } from '@/lib/useQuery';
import { PageHeader } from '@/components/ui/PageHeader';
import { Skeleton, ErrorState, Progress } from '@/components/ui';
import { AcademicsNav } from '../components';
import { termLabel, type DegreePlan } from '../api';

const CHIP: Record<string, string> = { completed: 'border-success/40 bg-success/10', equivalent: 'border-gold-500/60 bg-gold-100/60 dark:bg-gold-700/20', enrolled: 'border-brand-500/50 bg-brand-500/10', planned: 'border-info/40 bg-info/10', missing: 'border-dashed border-line' };
const GROUPS: Array<{ key: string; cats: string[] }> = [
  { key: 'core', cats: ['core', 'major', 'gen', 'orientation'] },
  { key: 'general', cats: ['hss_elective'] },
  { key: 'major', cats: ['major_elective'] }
];

/** Graduation requirements (the degree audit), kept apart from the semester plan. */
export function RequirementsPage() {
  const { t, l, locale } = useI18n();
  const q = useQuery(() => api<DegreePlan>('/academics/plan'), [], { refreshOn: ['academics', 'persona'] });
  const header = <PageHeader crumbs={[{ to: '/academics', label: t('nav.academics') }, { to: '/academics/plan', label: t('academics.plan.title') }]} title={t('academics.req.title')} subtitle={t('academics.req.subtitle')} />;
  if (q.error) return <div>{header}<AcademicsNav /><ErrorState error={q.error} onRetry={q.refetch} /></div>;
  if (!q.data) return <div>{header}<AcademicsNav /><Skeleton className="h-64" /></div>;
  const d = q.data, a = d.audit;
  const eligible = d.next_term.eligibility.filter((e) => e.eligible);
  return (
    <div>
      {header}
      <AcademicsNav />
      <dl className="mb-8 grid grid-cols-2 divide-line rounded-2xl border border-line sm:grid-cols-4 sm:divide-x rtl:sm:divide-x-reverse">
        {[['earned', a.earned, 'text-success'], ['inProgress', a.in_progress, 'text-brand-600'], ['planned', a.planned, 'text-info'], ['remaining', a.remaining, 'text-fg']].map(([k, v, c]) => (
          <div key={k as string} className="p-4"><dt className="text-sm text-muted">{t(`academics.req.${k}`)}</dt><dd className={clsx('num mt-1 text-2xl font-bold', c as string)}>{v as number}</dd></div>
        ))}
      </dl>
      <p className="-mt-5 mb-8 text-sm text-muted">{t('academics.plan.neverCounted')}{a.estimate ? ` ${t('academics.overview.estimate', { terms: a.estimate.terms_remaining })} (${termLabel(a.estimate.earliest_completion_term, locale)}).` : ''}</p>

      <div className="grid gap-10 lg:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]">
        <section aria-labelledby="req-buckets-h">
          <h2 id="req-buckets-h" className="mb-3 text-lg font-semibold">{t('academics.req.buckets')}</h2>
          <ul className="divide-y divide-line">
            {a.buckets.map((b) => (
              <li key={b.id} className="py-4">
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <h3 className="font-semibold">{l(b.label_en, b.label_ar)}</h3>
                  <span className={clsx('text-sm font-semibold', b.remaining_credits === 0 ? 'text-success' : 'text-muted')}>{b.remaining_credits === 0 ? t('academics.plan.met') : t('academics.plan.remaining', { n: b.remaining_credits })}</span>
                </div>
                <p className="text-xs text-muted">{t('academics.plan.bucketLine', { earned: b.earned_credits, inProgress: b.in_progress_credits, required: b.required_credits })}</p>
                <Progress label={l(b.label_en, b.label_ar)} value={b.earned_credits} max={Math.max(1, b.required_credits)} tone={b.remaining_credits === 0 ? 'success' : 'brand'} className="mt-2" />
                <div className="mt-2 flex flex-wrap gap-1">{b.courses.map((c) => <span key={c.code} className={clsx('rounded-md border px-1.5 py-0.5 text-xs font-medium', CHIP[c.status] ?? 'border-line')} title={`${c.title_en} · ${t(`status.${c.status === 'missing' ? 'blocked' : c.status}`)}`}>{c.code}{c.grade ? ` · ${c.grade}` : ''}</span>)}</div>
              </li>
            ))}
          </ul>
        </section>
        <div className="space-y-8">
          {a.unmet.length > 0 && (
            <section aria-labelledby="req-unmet-h">
              <h2 id="req-unmet-h" className="mb-2 text-lg font-semibold">{t('academics.plan.unmet')}</h2>
              <ul className="space-y-2 text-sm">{a.unmet.map((u) => <li key={u.bucket}><span className="font-medium">{u.bucket}</span> <span className="num text-muted">· {u.remaining_credits} {t('common.credits')}{u.suggestions.length ? ` · ${u.suggestions.join(', ')}` : ''}</span></li>)}</ul>
            </section>
          )}
          <section aria-labelledby="req-next-h">
            <h2 id="req-next-h" className="mb-2 text-lg font-semibold">{t('academics.req.nextTerm', { term: termLabel(d.next_term.id, locale) })}</h2>
            {GROUPS.map((g) => {
              const list = eligible.filter((e) => g.cats.includes(e.category));
              if (!list.length) return null;
              return (
                <div key={g.key} className="mb-4">
                  <h3 className="mb-1 text-sm font-semibold text-muted">{t(`academics.req.group.${g.key}`)}</h3>
                  <div className="flex flex-wrap gap-1">{list.map((e) => <Link key={e.code} to={`/academics/register?course=${encodeURIComponent(e.code)}`} className="inline-flex min-h-9 items-center rounded-md border border-line px-2.5 text-xs font-medium hover:border-brand-400 touch:min-h-11">{e.code}</Link>)}</div>
                </div>
              );
            })}
            <Link to="/academics/register" className="inline-flex min-h-11 items-center text-sm font-semibold text-brand-600 hover:underline">{t('academics.overview.planNext', { term: termLabel(d.next_term.id, locale) })}</Link>
          </section>
        </div>
      </div>
    </div>
  );
}
