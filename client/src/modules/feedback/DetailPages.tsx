import { useState } from 'react';
import { Link, useParams } from 'react-router';
import { ThumbsUp, Clock, Users, CheckCircle2 } from 'lucide-react';
import { useI18n } from '@/i18n';
import { api } from '@/lib/api';
import { useQuery } from '@/lib/useQuery';
import { PageHeader } from '@/components/ui/PageHeader';
import { Badge, Button, Card, ErrorState, Skeleton } from '@/components/ui';
import type { CourseDetail, InstructorDetail, Mine } from './types';
import { TEACHING_KPIS } from './types';
import { ActionsList, FeedbackForm, IndexRing, KpiList, NotEnough, ThemesCard } from './components';

function Facts({ n, rate, recommend, hours }: { n: number; rate: number | null; recommend: number | null; hours?: number | null }) {
  const { t } = useI18n();
  return (
    <ul className="grid grid-cols-2 gap-3 text-sm sm:grid-cols-4">
      <li className="flex items-center gap-2"><Users className="h-4 w-4 shrink-0 text-muted" aria-hidden /><span>{t('fb.responses', { n })}</span></li>
      {rate !== null && <li className="flex items-center gap-2"><CheckCircle2 className="h-4 w-4 shrink-0 text-muted" aria-hidden /><span>{t('fb.responseRate', { n: rate })}</span></li>}
      {recommend !== null && <li className="flex items-center gap-2"><ThumbsUp className="h-4 w-4 shrink-0 text-muted" aria-hidden /><span>{t('fb.recommend', { n: recommend })}</span></li>}
      {hours != null && <li className="flex items-center gap-2"><Clock className="h-4 w-4 shrink-0 text-muted" aria-hidden /><span>{t('fb.hours', { n: hours })}</span></li>}
    </ul>
  );
}

export function CourseFeedbackPage() {
  const { code = '' } = useParams();
  const { t, l } = useI18n();
  const q = useQuery(() => api<CourseDetail>(`/feedback/courses/${encodeURIComponent(code)}`), [code], { refreshOn: ['feedback'] });
  const mine = useQuery(() => api<Mine>('/feedback/mine'), [], { refreshOn: ['feedback'] });
  const [rating, setRating] = useState(false);
  const d = q.data;
  if (q.loading && !d) return <div className="space-y-4"><Skeleton className="h-24" /><Skeleton className="h-72" /></div>;
  if (q.error) return <ErrorState error={q.error} onRetry={() => void q.refetch()} />;
  if (!d) return null;
  const a = d.aggregate;
  const eligible = d.mine.find((m) => m.status === 'pending') ?? d.mine.find((m) => m.status === 'submitted') ?? null;
  const existing = eligible?.response_id ? mine.data?.responses.find((r) => r.id === eligible.response_id) ?? null : null;
  return (
    <div>
      <PageHeader crumbs={[{ to: '/feedback', label: t('fb.title') }, { to: '/feedback?tab=courses', label: t('fb.tab.courses') }]} crumbLabel={d.code}
        title={`${d.code} · ${l(d.title_en, d.title_ar)}`}
        subtitle={`${t(`fb.collegeName.${d.college}`)} · ${t('fb.anonNote', { min: d.min_responses })}`}
        actions={eligible ? (eligible.status === 'pending' ? <Button onClick={() => setRating(true)}>{t('fb.rateThis')}</Button> : <Button variant="outline" onClick={() => setRating(true)}>{t('fb.youRated')} · {t('fb.edit')}</Button>) : undefined} />

      <Card className="mb-6 flex flex-wrap items-center gap-6">
        <IndexRing value={a.index} label={t('fb.courseIndex')} />
        <div className="min-w-0 flex-1 space-y-3">
          <Facts n={a.n} rate={d.response_rate} recommend={a.recommend} hours={a.hours} />
          <p className="text-xs text-muted">{t('fb.bands')}</p>
        </div>
      </Card>

      {!a.enough ? <NotEnough n={a.n} min={d.min_responses} /> : (
        <div className="space-y-6">
          <section aria-labelledby="kpi-h" className="card p-4">
            <h2 id="kpi-h" className="font-semibold">{t('fb.kpis')}</h2>
            <p className="text-xs text-muted">{t('fb.kpisBody')}</p>
            <KpiList agg={a} kpis={d.kpis} bench={d.benchmark} trend={d.trend} />
            <p className="mt-2 text-xs text-muted">{t('fb.trend')}: {d.trend.map((p) => `${l(p.label_en, p.label_ar)} (${p.index ?? t('fb.trendGap', { min: d.min_responses })})`).join(' → ')}</p>
          </section>
          <ThemesCard agg={a} />
          <ActionsList actions={d.actions} />
          {d.by_instructor.length > 0 && (
            <section aria-labelledby="byi-h" className="card p-4">
              <h2 id="byi-h" className="mb-2 font-semibold">{t('fb.byInstructor')}</h2>
              <ul className="divide-y divide-line">
                {d.by_instructor.map((i) => (
                  <li key={i.slug}>
                    <Link to={`/feedback/instructors/${i.slug}`} className="flex min-h-11 flex-wrap items-center gap-3 py-3 hover:text-brand-600">
                      <span className="min-w-0 flex-1 font-medium">{l(i.name_en, i.name_ar)}</span>
                      <span className="text-xs text-muted">{t('fb.responses', { n: i.n })}</span>
                      <span className="num text-lg font-bold">{i.index ?? '–'}</span>
                    </Link>
                  </li>
                ))}
              </ul>
            </section>
          )}
        </div>
      )}
      <p className="mt-6 text-xs text-muted">{t('fb.demoNote')}</p>
      {eligible && rating && <FeedbackForm target={eligible} existing={existing} open onClose={() => setRating(false)} onDone={() => { void q.refetch(); void mine.refetch(); }} />}
    </div>
  );
}

export function InstructorFeedbackPage() {
  const { slug = '' } = useParams();
  const { t, l } = useI18n();
  const q = useQuery(() => api<InstructorDetail>(`/feedback/instructors/${slug}`), [slug], { refreshOn: ['feedback'] });
  const d = q.data;
  if (q.loading && !d) return <div className="space-y-4"><Skeleton className="h-24" /><Skeleton className="h-72" /></div>;
  if (q.error) return <ErrorState error={q.error} onRetry={() => void q.refetch()} />;
  if (!d) return null;
  const a = d.aggregate;
  const focus = TEACHING_KPIS.filter((k) => a.kpis[k].band === 'focus');
  return (
    <div>
      <PageHeader crumbs={[{ to: '/feedback', label: t('fb.title') }, { to: '/feedback?tab=instructors', label: t('fb.tab.instructors') }]} title={l(d.name_en, d.name_ar)} subtitle={`${t(`fb.collegeName.${d.college}`)} · ${t('fb.anonNote', { min: d.min_responses })}`} meta={focus.length ? <>{focus.map((k) => <Badge key={k} tone="gold">{t(`fb.kpi.${k}`)} · {t('fb.band.focus')}</Badge>)}</> : undefined} />
      <Card className="mb-6 flex flex-wrap items-center gap-6">
        <IndexRing value={a.index} label={t('fb.index')} />
        <div className="min-w-0 flex-1 space-y-3">
          <Facts n={a.n} rate={d.response_rate} recommend={a.recommend} />
          <p className="text-xs text-muted">{t('fb.bands')}</p>
        </div>
      </Card>
      {!a.enough ? <NotEnough n={a.n} min={d.min_responses} /> : (
        <div className="space-y-6">
          <section aria-labelledby="kpi-h" className="card p-4">
            <h2 id="kpi-h" className="font-semibold">{t('fb.kpis')}</h2>
            <p className="text-xs text-muted">{t('fb.kpisBody')}</p>
            <KpiList agg={a} kpis={d.kpis} bench={d.benchmark} trend={d.trend} />
          </section>
          <ThemesCard agg={a} />
          <ActionsList actions={d.actions} />
        </div>
      )}
      <section aria-labelledby="courses-h" className="card mt-6 p-4">
        <h2 id="courses-h" className="mb-2 font-semibold">{t('fb.coursesTaught')}</h2>
        <ul className="divide-y divide-line">
          {d.courses.map((c) => (
            <li key={c.code}>
              <Link to={`/feedback/courses/${encodeURIComponent(c.code)}`} className="flex min-h-11 flex-wrap items-center gap-3 py-3 hover:text-brand-600">
                <span className="num w-20 shrink-0 font-semibold">{c.code}</span>
                <span className="min-w-0 flex-1 truncate text-sm">{l(c.title_en, c.title_ar)}</span>
                <span className="text-xs text-muted">{t('fb.responses', { n: c.n })}</span>
                {c.enough ? <span className="num text-lg font-bold">{c.index}</span> : <span className="text-xs text-muted">{t('fb.notEnough')}</span>}
              </Link>
            </li>
          ))}
        </ul>
      </section>
      <p className="mt-6 text-xs text-muted">{t('fb.demoNote')}</p>
    </div>
  );
}
