import { Link, useParams } from 'react-router';
import { BookOpen, ListChecks, MapPin } from 'lucide-react';
import { useI18n } from '@/i18n';
import { api } from '@/lib/api';
import { useQuery } from '@/lib/useQuery';
import { weekdayName } from '@/lib/format';
import { PageHeader } from '@/components/ui/PageHeader';
import { Card, SectionTitle, Skeleton, ErrorState, StatusPill, Badge, Button, KeyValue } from '@/components/ui';
import { AcademicsNav } from '../components';
import { termLabel, type CourseDetail, type SectionView } from '../api';

function SectionList({ items }: { items: SectionView[] }) {
  const { t, l, locale } = useI18n();
  if (!items.length) return <div className="text-sm text-muted">{t('academics.course.noSections')}</div>;
  return (
    <ul className="space-y-2">
      {items.map((s) => (
        <li key={s.id} className="rounded-xl border border-line p-3 text-sm">
          <div className="flex items-center justify-between gap-2"><span className="font-semibold">sec {s.section_no} · {s.instructor}</span><Badge tone={s.seats_left === 0 ? 'danger' : s.seats_left <= 2 ? 'warn' : 'success'}>{t('academics.register.seats', { n: s.seats_left })} / {s.capacity}</Badge></div>
          <ul className="mt-1 space-y-0.5 text-xs text-muted">{s.meetings.map((m, i) => <li key={i} className="flex items-center justify-between gap-2"><span className="num">{weekdayName(m.day, locale)} {m.start}–{m.end}</span>{m.location && <Link to={`/campus/map?to=${m.location.id}`} className="inline-flex items-center gap-1 text-brand-600 hover:underline"><MapPin className="h-3 w-3" />{l(m.location.name_en, m.location.name_ar)}</Link>}</li>)}</ul>
        </li>
      ))}
    </ul>
  );
}

export function CoursePage() {
  const { code } = useParams();
  const { t, l, locale } = useI18n();
  const q = useQuery(() => api<CourseDetail>(`/academics/courses/${encodeURIComponent(code ?? '')}`), [code], { refreshOn: ['academics'] });
  if (q.error) return <div><AcademicsNav /><ErrorState error={q.error} onRetry={q.refetch} /></div>;
  if (!q.data) return <div><AcademicsNav /><Skeleton className="h-64" /></div>;
  const d = q.data;
  const c = d.course;
  return (
    <div>
      <PageHeader eyebrow={<Link to="/academics/plan" className="hover:underline">{t('academics.plan.title')}</Link>} title={`${c.code} · ${l(c.title_en, c.title_ar)}`} subtitle={`${c.credits} ${t('common.credits')} · ${t('academics.course.level')} ${c.level} · ${c.category} · ${c.source}`} actions={<><StatusPill status={d.status} /><Link to={d.links.resources}><Button size="sm" variant="outline" icon={<BookOpen className="h-4 w-4" />}>{t('academics.course.resources')}</Button></Link>{d.status === 'available' && <Link to={d.links.register}><Button size="sm" icon={<ListChecks className="h-4 w-4" />}>{t('academics.nav.register')}</Button></Link>}</>} />
      <AcademicsNav />
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <p className="text-sm">{c.description_en}</p>
          <SectionTitle className="mt-4">{t('academics.course.prereqs')}</SectionTitle>
          {c.rule.prereqs.length === 0 && c.rule.min_credits === 0 ? <div className="text-sm text-muted">{t('academics.course.noPrereqs')}</div> : (
            <div className="flex flex-wrap items-center gap-1.5 text-sm">
              {c.rule.prereqs.map((g, i) => <span key={i} className="flex items-center gap-1">{i > 0 && <span className="text-xs text-muted">AND</span>}<span className="rounded-lg border border-line px-2 py-0.5">{g.map((x, k) => <span key={x}>{k > 0 && <span className="mx-1 text-xs text-muted">OR</span>}<Link to={`/academics/courses/${encodeURIComponent(x)}`} className="font-semibold hover:text-brand-600">{x}</Link></span>)}</span></span>)}
              {c.rule.min_credits > 0 && <Badge tone="gold">{t('academics.course.minCredits', { n: c.rule.min_credits })}</Badge>}
            </div>
          )}
          {d.missing.length > 0 && <div className="mt-2 text-xs text-danger">{t('academics.course.missing')}: {d.missing.map((g) => g.join(' / ')).join(', ')}</div>}
          {d.credit_short > 0 && <div className="mt-1 text-xs text-danger">{t('academics.course.creditShort', { n: d.credit_short })}</div>}
          {d.chain.length > 1 && <div className="mt-2 text-xs text-muted">{t('academics.course.chain')}: {d.chain.map((g) => g.join('|')).join(' ← ')}</div>}
          {d.dependents.length > 0 && <><SectionTitle className="mt-4">{t('academics.course.unlocks')}</SectionTitle><div className="flex flex-wrap gap-1.5">{d.dependents.map((x) => <Link key={x} to={`/academics/courses/${encodeURIComponent(x)}`} className="rounded-md border border-line px-2 py-0.5 text-xs font-medium hover:border-brand-400">{x}</Link>)}</div></>}
          {d.transcript.length > 0 && <><SectionTitle className="mt-4">{t('academics.course.transcript')}</SectionTitle><KeyValue items={d.transcript.map((tr) => ({ k: termLabel(tr.term, locale), v: <span className="flex items-center gap-2"><StatusPill status={tr.status} />{tr.grade && <span className="num">{tr.grade}</span>}</span> }))} /></>}
        </Card>
        <div className="space-y-4">
          <Card><SectionTitle>{termLabel('2026-1', locale)}</SectionTitle><SectionList items={d.sections.current} /></Card>
          <Card><SectionTitle>{termLabel('2026-2', locale)}</SectionTitle><SectionList items={d.sections.next} /></Card>
        </div>
      </div>
    </div>
  );
}
