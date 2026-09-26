import { Link, useSearchParams } from 'react-router';
import { MapPin, Navigation } from 'lucide-react';
import { useI18n } from '@/i18n';
import { api } from '@/lib/api';
import { useQuery } from '@/lib/useQuery';
import { weekdayName, fmtDate } from '@/lib/format';
import { PageHeader } from '@/components/ui/PageHeader';
import { Card, SectionTitle, Skeleton, ErrorState, EmptyState, Select, Badge } from '@/components/ui';
import { AcademicsNav, WeekGrid, meetingsToBlocks } from '../components';
import { termLabel, type Timetable } from '../api';

export function TimetablePage() {
  const { t, l, locale } = useI18n();
  const [params, setParams] = useSearchParams();
  const term = params.get('term') ?? undefined;
  const q = useQuery(() => api<Timetable>('/academics/timetable', { query: { term } }), [term], { refreshOn: ['academics', 'calendar', 'persona'] });
  if (q.error) return <div><AcademicsNav /><ErrorState error={q.error} onRetry={q.refetch} /></div>;
  if (!q.data) return <div><AcademicsNav /><Skeleton className="h-96" /></div>;
  const d = q.data;
  const blocks = meetingsToBlocks(d.sections.map((s) => ({ id: s.id, code: s.course_code, meetings: s.meetings, to: s.meetings[0]?.location_id ? `/campus/map?to=${s.meetings[0].location_id}` : undefined })));
  return (
    <div>
      <PageHeader crumbs={[{ to: '/academics', label: t('nav.academics') }]} title={t('academics.timetable.title')} subtitle={`${l(d.term_label.en, d.term_label.ar)}${d.dates ? ` · ${fmtDate(d.dates.start, locale)} → ${fmtDate(d.dates.end, locale)}` : ''} · ${d.credits} ${t('common.credits')}`} actions={<Select aria-label={t('common.term')} value={d.term} onChange={(e) => setParams({ term: e.target.value })} className="!w-auto">{d.terms.map((x) => <option key={x} value={x}>{termLabel(x, locale)}</option>)}</Select>} />
      <AcademicsNav />
      {d.sections.length === 0 ? <EmptyState title={t('academics.timetable.empty')} body={t('academics.timetable.emptyBody')} action={<Link to="/academics/register" className="text-sm font-semibold text-brand-600 hover:underline">{t('academics.nav.register')}</Link>} /> : (
        <div className="grid grid-cols-1 gap-5 lg:grid-cols-4">
          <Card className="lg:col-span-3"><WeekGrid blocks={blocks} highlightDay={d.term === '2026-1' ? d.weekday : undefined} /></Card>
          <div className="space-y-3">
            <SectionTitle>{t('academics.timetable.sections')}</SectionTitle>
            {d.sections.map((s) => (
              <Card key={s.id} className="!p-3">
                <div className="flex items-start justify-between gap-2"><Link to={`/academics/courses/${encodeURIComponent(s.course_code)}`} className="inline-flex items-center touch:min-h-11 font-semibold hover:text-brand-600">{s.course_code}</Link><Badge tone="neutral">{s.credits} cr</Badge></div>
                <div className="text-xs text-muted">{l(s.title_en, s.title_ar)} · sec {s.section_no} · {s.instructor}</div>
                <ul className="mt-2 space-y-1 text-xs">{s.meetings.map((m, i) => <li key={i} className="flex items-center justify-between gap-2"><span className="num">{weekdayName(m.day, locale)} {m.start}–{m.end}</span>{m.location && <Link to={`/campus/map?to=${m.location.id}`} className="inline-flex items-center gap-1 text-brand-600 hover:underline touch:min-h-11"><MapPin className="h-3 w-3" />{l(m.location.name_en, m.location.name_ar)}</Link>}</li>)}</ul>
                {s.meetings[0]?.location && <Link to={`/campus/map?to=${s.meetings[0].location.id}`} className="mt-2 inline-flex items-center gap-1 text-xs font-semibold text-muted hover:text-brand-600 min-h-11"><Navigation className="h-3 w-3" />{t('common.route')}</Link>}
              </Card>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
