import { Link } from 'react-router';
import { GraduationCap, BookOpen, UserX, ListTodo, ArrowRight, Sparkles } from 'lucide-react';
import clsx from 'clsx';
import { useI18n } from '@/i18n';
import { api } from '@/lib/api';
import { useQuery } from '@/lib/useQuery';
import { useTheme } from '@/lib/theme';
import { fmtTime, weekdayName, fmtDate } from '@/lib/format';
import { PageHeader } from '@/components/ui/PageHeader';
import { Card, SectionTitle, Skeleton, ErrorState, EmptyState, Progress, StatusPill, Badge, Button } from '@/components/ui';
import GradientText from '@/components/reactbits/GradientText';
import SpotlightCard from '@/components/reactbits/SpotlightCard';
import { AcademicsNav, StatTile } from '../components';
import type { Overview } from '../api';

export function OverviewPage() {
  const { t, l, locale } = useI18n();
  const { reducedMotion, resolved } = useTheme();
  const q = useQuery(() => api<Overview>('/academics/overview'), [], { refreshOn: ['academics', 'calendar', 'persona'] });
  if (q.error) return <div><AcademicsNav /><ErrorState error={q.error} onRetry={q.refetch} /></div>;
  if (!q.data) return <div><AcademicsNav /><div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">{[0, 1, 2, 3].map((i) => <Skeleton key={i} className="h-28" />)}</div></div>;
  const d = q.data;
  const first = l(d.student.name_en, d.student.name_ar).split(' ')[0];
  const pct = Math.round((d.credits.earned / Math.max(1, d.credits.required)) * 100);
  const byDay = new Map<number, Overview['week']['entries']>();
  for (const e of d.week.entries) { const wd = new Date(new Date(e.start_at).getTime() + 3 * 3600e3).getUTCDay(); if (!byDay.has(wd)) byDay.set(wd, []); byDay.get(wd)!.push(e); }
  return (
    <div>
      <PageHeader eyebrow={t('nav.academics')} title={t('academics.overview.hello', { name: first })} subtitle={d.student.program ? `${l(d.student.program.en, d.student.program.ar)} · ${t('academics.overview.level', { level: d.student.level })} · ${l(d.term.label.en, d.term.label.ar)}` : t('academics.overview.noProgram')} />
      <AcademicsNav />
      <section className={clsx('relative mb-6 overflow-hidden rounded-3xl border border-line p-6', resolved === 'dark' ? 'bg-gradient-to-br from-brand-900/40 via-surface to-surface' : 'bg-gradient-to-br from-brand-50 via-surface to-gold-100/40')}>
        <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
          <div>
            <div className="text-xs font-semibold uppercase tracking-[0.14em] text-brand-600">{t('academics.overview.degreeProgress')}</div>
            <div className="mt-1 text-3xl font-bold">{reducedMotion ? <span>{pct}%</span> : <GradientText colors={['#f0762b', '#c8975b', '#f0762b']} animationSpeed={6} className="!mx-0">{pct}%</GradientText>}<span className="ms-2 text-base font-medium text-muted">{t('academics.overview.ofCredits', { earned: d.credits.earned, required: d.credits.required })}</span></div>
            <Progress value={d.credits.earned} max={d.credits.required} className="mt-3 max-w-md" />
            {d.credits.estimate && <div className="mt-2 text-xs text-muted">{t('academics.overview.estimate', { terms: d.credits.estimate.terms_remaining })} · {d.credits.estimate.assumptions}</div>}
          </div>
          <div className="flex flex-wrap gap-2">
            <Link to="/academics/plan"><Button variant="outline" size="sm" icon={<GraduationCap className="h-4 w-4" />}>{t('academics.nav.plan')}</Button></Link>
            <Link to="/academics/register"><Button size="sm" icon={<Sparkles className="h-4 w-4" />}>{t('academics.overview.planNext', { term: l(d.term.next.label.en, d.term.next.label.ar) })}</Button></Link>
          </div>
        </div>
      </section>
      <div className="mb-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatTile value={d.credits.earned} label={t('academics.overview.creditsEarned')} hint={t('academics.overview.creditsRemaining', { n: d.credits.remaining })} icon={<GraduationCap className="h-4 w-4" />} to="/academics/plan" />
        <StatTile value={d.credits.in_progress} label={t('academics.overview.creditsInProgress')} hint={l(d.term.label.en, d.term.label.ar)} icon={<BookOpen className="h-4 w-4" />} tone="info" to="/academics/timetable" />
        <StatTile value={d.attendance.courses.reduce((s, c) => s + c.counts.absent, 0)} label={t('academics.overview.absences')} hint={d.attendance.unexcused ? t('academics.overview.unexcused', { n: d.attendance.unexcused }) : t('academics.overview.allExcused')} icon={<UserX className="h-4 w-4" />} tone={d.attendance.unexcused ? 'warn' : 'success'} to="/academics/attendance" />
        <StatTile value={d.tasks.due_soon} label={t('academics.overview.tasksDue')} hint={d.tasks.overdue ? t('academics.overview.overdue', { n: d.tasks.overdue }) : t('academics.overview.onTrack')} icon={<ListTodo className="h-4 w-4" />} tone={d.tasks.overdue ? 'danger' : 'gold'} to="/academics/study" />
      </div>
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <SectionTitle>{t('academics.overview.nextActions')}</SectionTitle>
          {d.nextActions.length === 0 ? <EmptyState title={t('academics.overview.noActions')} /> : (
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              {d.nextActions.map((a, i) => (
                <Link key={i} to={a.link} className="block">
                  <SpotlightCard className="!rounded-2xl !border-line !bg-surface !p-4 h-full transition hover:!border-brand-400" spotlightColor="rgba(240, 118, 43, 0.18)">
                    <div className="flex items-start justify-between gap-2">
                      <Badge tone={a.tone === 'danger' ? 'danger' : a.tone === 'warn' ? 'warn' : a.tone === 'success' ? 'success' : 'info'} dot>{t(`academics.action.${a.kind}`)}</Badge>
                      <ArrowRight className="h-4 w-4 shrink-0 text-muted rtl:rotate-180" />
                    </div>
                    <div className="mt-2 font-semibold">{a.title}</div>
                    <div className="mt-1 text-sm text-muted">{a.body}</div>
                  </SpotlightCard>
                </Link>
              ))}
            </div>
          )}
          <SectionTitle className="mt-6" action={<Link to="/academics/timetable" className="text-xs font-semibold text-brand-600 hover:underline">{t('academics.overview.fullTimetable')}</Link>}>{t('academics.overview.thisWeek')}</SectionTitle>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-5">
            {[0, 1, 2, 3, 4].map((wd) => {
              const list = byDay.get(wd) ?? [];
              return (
                <div key={wd} className="card-2 p-2">
                  <div className="mb-1 text-xs font-semibold text-muted">{weekdayName(wd, locale)}</div>
                  {list.length === 0 && <div className="text-[11px] text-muted">{t('academics.overview.free')}</div>}
                  <ul className="space-y-1">{list.map((e) => <li key={e.id} className={clsx('rounded-lg border px-1.5 py-1 text-[11px]', e.kind === 'exam' ? 'border-danger/40 bg-danger/10' : 'border-line bg-surface')}><span className="num text-muted">{fmtTime(e.start_at, locale)}</span> <span className="font-medium">{e.title.split(' · ')[0]}</span></li>)}</ul>
                </div>
              );
            })}
          </div>
        </div>
        <div className="space-y-4">
          <Card>
            <SectionTitle>{t('academics.overview.attendanceByCourse')}</SectionTitle>
            <ul className="space-y-3">
              {d.attendance.courses.map((c) => (
                <li key={c.course_code}>
                  <div className="flex items-center justify-between text-sm"><Link to="/academics/attendance" className="font-semibold hover:text-brand-600">{c.course_code}</Link><span className={clsx('num text-xs', c.level === 'denial' ? 'text-danger' : c.level === 'warning' ? 'text-warn' : 'text-muted')}>{c.absence_percent}% · {c.counts.absent}/{c.total}</span></div>
                  <Progress value={c.absence_percent} max={d.attendance.policy.denial.value} tone={c.level === 'denial' ? 'danger' : c.level === 'warning' ? 'warn' : 'success'} className="mt-1 h-1.5" />
                </li>
              ))}
            </ul>
            <div className="mt-3 text-[11px] text-muted">{t('academics.attendance.policyNote', { warn: d.attendance.policy.warning.value, deny: d.attendance.policy.denial.value })} · {d.attendance.policy.warning.provenance}</div>
          </Card>
          <Card>
            <SectionTitle action={<Link to="/academics/excuses" className="text-xs font-semibold text-brand-600 hover:underline">{t('common.view')}</Link>}>{t('academics.nav.excuses')}</SectionTitle>
            {d.excuses.items.length === 0 ? <div className="text-sm text-muted">{t('academics.excuses.none')}</div> : (
              <ul className="space-y-2 text-sm">{d.excuses.items.map((e) => <li key={e.id} className="flex items-center justify-between gap-2"><Link to={`/academics/excuses/${e.id}`} className="truncate hover:text-brand-600">{e.sessions.map((s) => `${s.course_code} ${fmtDate(s.session_date, locale)}`).join(', ')}</Link><StatusPill status={e.status} /></li>)}</ul>
            )}
          </Card>
          {d.proposals.latest && (
            <Card>
              <SectionTitle>{t('academics.register.latestProposal')}</SectionTitle>
              <div className="flex items-center justify-between text-sm"><span>{l(d.proposals.latest.term_label.en, d.proposals.latest.term_label.ar)} · {d.proposals.latest.credits} {t('common.credits')}</span><StatusPill status={d.proposals.latest.status} /></div>
              <Link to={`/academics/register?proposal=${d.proposals.latest.id}`} className="mt-2 inline-block text-xs font-semibold text-brand-600 hover:underline">{t('common.open')}</Link>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}
