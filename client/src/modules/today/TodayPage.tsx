import { Link } from 'react-router';
import { CalendarClock, MapPin, ClipboardList, BookOpenCheck, Briefcase, Search, GraduationCap, FileText, Lock, ArrowRight, Sparkles, UserCheck, Compass, BadgeCheck } from 'lucide-react';
import clsx from 'clsx';
import { useI18n } from '@/i18n';
import { useSession } from '@/lib/session';
import { useQuery } from '@/lib/useQuery';
import { usePageTitle } from '@/lib/usePageTitle';
import { api } from '@/lib/api';
import { fmtTime, fmtDate, minutesLabel, weekdayName } from '@/lib/format';
import { Card, StatusPill, Skeleton, ErrorState, Progress, Badge, EmptyState, SectionTitle, SectionLink } from '@/components/ui';
import { AbsenceBar, AbsenceLegend } from '@/components/ui/AbsenceBar';
import { useEdgeFade } from '@/components/ui/useEdgeFade';
import type { CalendarEntry } from '@shared/types';

type Entry = CalendarEntry & { location_name_en?: string | null; location_name_ar?: string | null };
interface Pending { kind: string; id: string; title: string; status: string; link: string; params?: Record<string, string | number> }
interface TodayData {
  today: string; now: string; local: { hour: number; weekday: number; date: string };
  term: { id: string; label: { en: string; ar: string }; next: string; nextLabel: { en: string; ar: string } };
  user: { stage: string; level: number; program: { name_en: string; name_ar: string } | null; campus_id: string; roles: string[] };
  stats: { classesToday: number; tasksDue: number; overdueTasks: number; pending: number; unread: number; creditsEarned: number; creditsEnrolled: number; unexcusedAbsences: number; savedOpportunities: number };
  classes: Entry[];
  nextClass: Entry | null;
  upcoming: Entry[];
  pending: Pending[];
  tasks: Array<{ id: string; title: string; course_code: string | null; effort_min: number; deadline: string | null; scheduled_date: string | null; status: string; locked: boolean; progress: number }>;
  attendance: Array<{ course_code: string; absences: number; sessions: number; percent: number; level: 'ok' | 'warn' | 'danger' }>;
  lostFound: Array<{ id: string; public_id: string; item: string; status: string; collection_location_id: string | null; collection_location_en: string | null; collection_location_ar?: string | null }>;
  applications: Array<{ id: string; company: string; title: string; status: string; deadline: string | null }>;
  clubs: Array<{ id: string; name_en: string; name_ar: string; status: string }>;
  queues: Array<{ key: string; title: string; count: number; link: string }>;
  week: CalendarEntry[];
  policies: { absenceWarningPercent: number; absenceDenialPercent: number };
}

/** Riyadh-local calendar date of an ISO timestamp. */
const localDate = (iso: string) => new Date(new Date(iso).getTime() + 3 * 3600 * 1000).toISOString().slice(0, 10);
const addDays = (d: string, n: number) => { const x = new Date(`${d}T00:00:00Z`); x.setUTCDate(x.getUTCDate() + n); return x.toISOString().slice(0, 10); };
const weekdayOf = (d: string) => new Date(`${d}T00:00:00Z`).getUTCDay();

function Stat({ label, value, to }: { label: string; value: number; to: string }) {
  const cls = 'card-2 flex min-h-11 flex-col justify-between gap-1 p-3 transition hover:border-brand-400';
  if (to.startsWith('#')) {
    return (
      <a href={to} className={cls} onClick={(e) => { e.preventDefault(); const el = document.querySelector<HTMLElement>(to); el?.scrollIntoView({ block: 'start' }); el?.querySelector<HTMLElement>('h2')?.focus(); }}>
        <span className="text-xs font-medium leading-tight text-muted">{label}</span>
        <span className="num text-2xl font-bold leading-none">{value}</span>
      </a>
    );
  }
  return (
    <Link to={to} className={cls}>
      <span className="text-xs font-medium leading-tight text-muted">{label}</span>
      <span className="num text-2xl font-bold leading-none">{value}</span>
    </Link>
  );
}

function pendingTitle(p: Pending, t: (k: string, v?: Record<string, string | number>) => string): string {
  const v = p.params ?? {};
  switch (p.kind) {
    case 'enrollment': return typeof v.credits === 'number' ? t('today.pending.enrollment', { n: v.credits }) : p.title;
    case 'excuse': return v.type ? t('today.pending.excuse', { type: t(`academics.excuses.type.${v.type}`) }) : p.title;
    case 'study': return t('today.pending.study');
    case 'admission': return p.status === 'admitted' ? t('today.pending.admissionOffer') : t('today.pending.admission');
    case 'graduation': return t('today.pending.graduation');
    case 'email': return v.subject ? t('today.pending.email', { subject: String(v.subject) }) : p.title;
    default: return p.title;
  }
}

/** Rest of the week from tomorrow, so nothing repeats today's schedule. Teaching days without entries say so. */
function WeekAgenda({ entries, today }: { entries: CalendarEntry[]; today: string }) {
  const { t, locale } = useI18n();
  const days: string[] = [];
  for (let d = addDays(today, 1); days.length < 6 && weekdayOf(d) !== 0; d = addDays(d, 1)) days.push(d);
  const byDay = new Map<string, CalendarEntry[]>();
  for (const e of entries) { const d = localDate(e.start_at); if (d > today) { if (!byDay.has(d)) byDay.set(d, []); byDay.get(d)!.push(e); } }
  const shown = days.filter((d) => (byDay.get(d)?.length ?? 0) > 0 || weekdayOf(d) <= 4);
  if (!shown.length) return <p className="text-sm text-muted">{t('today.weekEmpty')}</p>;
  return (
    <ol className="space-y-3">
      {shown.map((d) => {
        const list = (byDay.get(d) ?? []).sort((a, b) => a.start_at.localeCompare(b.start_at));
        return (
          <li key={d}>
            <h3 className="mb-1 text-sm font-semibold">{weekdayName(weekdayOf(d), locale)} <span className="num font-normal text-muted">{fmtDate(d, locale, { year: undefined })}</span></h3>
            {list.length === 0 ? <p className="text-sm text-muted">{t('calendar.noClasses')}</p> : (
              <ul className="space-y-1">
                {list.slice(0, 4).map((e) => (
                  <li key={e.id}>
                    <Link to={e.link ?? '/calendar'} className="flex min-h-11 items-center gap-3 rounded-xl border border-line px-3 py-1.5 text-sm hover:border-brand-400">
                      <span className="num w-20 shrink-0 text-muted">{fmtTime(e.start_at, locale)}</span>
                      <span dir="auto" title={e.title} className="min-w-0 flex-1 truncate font-medium rtl:text-right">{e.title}</span>
                      {e.kind !== 'class' && <Badge tone={e.kind === 'interview' ? 'info' : e.kind === 'exam' ? 'danger' : 'gold'}>{t(`kind.${e.kind}`)}</Badge>}
                    </Link>
                  </li>
                ))}
                {list.length > 4 && <li><SectionLink to="/calendar" className="ms-0">{t('calendar.more', { n: list.length - 4 })}</SectionLink></li>}
              </ul>
            )}
          </li>
        );
      })}
    </ol>
  );
}

export function TodayPage() {
  const { t, locale, l } = useI18n();
  const { user, hasRole } = useSession();
  usePageTitle(t('nav.today'));
  const q = useQuery(() => api<TodayData>('/today'), [user?.id], { refreshOn: ['calendar', 'persona', 'clock'] });
  const quickRow = useEdgeFade<HTMLUListElement>();
  const d = q.data;
  const hour = d?.local.hour ?? 9;
  const greet = hour < 12 ? t('today.morning') : hour < 17 ? t('today.afternoon') : t('today.evening');
  const first = user ? l(user.name_en, user.name_ar).split(' ')[0] : '';
  const isWeekend = d ? d.local.weekday === 5 || d.local.weekday === 6 : false;
  const isStudent = hasRole('student');
  const isStaffOnly = !!user && !hasRole('student', 'applicant');

  // Quick actions: one entry per destination. The study planner is reached from the tasks card, not from here.
  const actions = [
    hasRole('applicant') && { to: '/journey/admission', icon: FileText, label: t('today.action.admission') },
    isStudent && { to: '/academics/register', icon: ClipboardList, label: t('today.action.register') },
    isStudent && { to: '/academics/attendance', icon: CalendarClock, label: t('today.action.excuse') },
    { to: '/campus/map', icon: MapPin, label: t('today.action.map') },
    { to: '/campus/lost-found', icon: Search, label: t('today.action.lost') },
    user?.stage === 'graduating' && { to: '/journey/graduation', icon: GraduationCap, label: t('today.action.graduation') }
  ].filter(Boolean) as Array<{ to: string; icon: typeof MapPin; label: string }>;

  const todays = d ? [...d.classes, ...d.upcoming.filter((u) => localDate(u.start_at) === d.today && u.kind !== 'class')].sort((a, b) => a.start_at.localeCompare(b.start_at)) : [];
  const worst = d?.attendance.slice().sort((a, b) => b.percent - a.percent)[0];
  const eventsSoon = d ? d.upcoming.filter((u) => localDate(u.start_at) > d.today && u.kind === 'event').length : 0;
  const queueTitle = (key: string, fallback: string) => { const k = `today.queue.${key}`; const v = t(k); return v === k ? fallback : v; };

  return (
    <div className="space-y-6">
      <header>
        {d && (
          <div className="mb-2 flex flex-wrap items-center gap-1.5">
            <Badge tone="gold">{l(d.term.label.en, d.term.label.ar)}</Badge>
            {d.user.program && <Badge tone="brand">{l(d.user.program.name_en, d.user.program.name_ar)}</Badge>}
            <Badge tone="neutral">{d.user.campus_id === 'khobar' ? t('shell.khobar') : t('shell.riyadh')}</Badge>
          </div>
        )}
        <h1 tabIndex={-1} className="text-3xl font-bold tracking-tight sm:text-4xl">{t('today.greeting', { greet, name: first })}</h1>
        <p className="mt-1 max-w-[70ch] text-sm text-muted">{d ? `${fmtDate(d.today, locale, { weekday: 'long' })} · ` : ''}{t('today.subtitle')}</p>
      </header>

      {actions.length > 0 && (
        <nav aria-label={t('today.quick')}>
          <ul ref={quickRow} className="scroll-row -mx-1 flex gap-2 overflow-x-auto px-1 py-0.5">
            {actions.map((a) => (
              <li key={a.to} className="shrink-0">
                <Link to={a.to} className="inline-flex min-h-11 items-center gap-2 whitespace-nowrap rounded-full border border-line bg-surface px-4 text-sm font-medium transition hover:border-brand-400">
                  <a.icon className="h-4 w-4 text-brand-600" aria-hidden />{a.label}
                </Link>
              </li>
            ))}
          </ul>
        </nav>
      )}

      {q.error ? <ErrorState error={q.error} onRetry={q.refetch} /> : null}
      {!d && !q.error && <div className="grid grid-cols-1 gap-4 md:grid-cols-2"><Skeleton className="h-48" /><Skeleton className="h-48" /></div>}

      {d && d.queues.length > 0 && (
        <section aria-labelledby="today-queues">
          <SectionTitle id="today-queues">{t('today.queues')}</SectionTitle>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {d.queues.map((qq) => (
              <Link key={qq.key} to={qq.link} className="card flex min-h-11 items-center justify-between p-4 transition hover:border-brand-400">
                <span className="font-medium">{queueTitle(qq.key, qq.title)}</span>
                <span className="num rounded-full bg-brand-500 px-2.5 py-0.5 text-sm font-bold text-ink-950">{qq.count}</span>
              </Link>
            ))}
          </div>
        </section>
      )}

      {d && (
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-[1.25fr_1fr]">
          <div className="space-y-6">
            {!isStaffOnly && (
              <Card as="section" aria-labelledby="today-schedule">
                <SectionTitle id="today-schedule" action={<SectionLink to="/academics/timetable">{t('today.timetable')}</SectionLink>}>{t('today.schedule')}</SectionTitle>
                {todays.length === 0 ? (
                  <EmptyState icon={<CalendarClock className="h-6 w-6" />} title={t('today.noClasses')} body={isWeekend ? t('today.weekend') : undefined} />
                ) : (
                  <ol className="relative space-y-2 border-s border-line ps-4">
                    {todays.map((c) => {
                      const isNext = d.nextClass?.id === c.id;
                      return (
                        <li key={c.id} className={clsx('relative rounded-xl border p-3', isNext ? 'border-brand-400 bg-brand-50/60 dark:bg-brand-900/20' : 'border-line')}>
                          <span aria-hidden className={clsx('absolute -start-[21px] top-4 h-2.5 w-2.5 rounded-full', isNext ? 'bg-brand-500' : c.end_at < d.now ? 'bg-line' : 'bg-gold-500')} />
                          <div className="flex flex-wrap items-center justify-between gap-2">
                            <div className="min-w-0">
                              <div className="num flex flex-wrap items-center gap-2 text-sm text-muted">{fmtTime(c.start_at, locale)} – {fmtTime(c.end_at, locale)} {isNext && <Badge tone="brand">{t('today.next')}</Badge>}{c.kind !== 'class' && <Badge tone="gold">{t(`kind.${c.kind}`)}</Badge>}</div>
                              <div className="font-semibold">{c.title}</div>
                            </div>
                            {c.location_id && <Link to={`/campus/map?to=${c.location_id}`} className="inline-flex min-h-11 items-center gap-1.5 rounded-xl border border-line px-3 text-sm hover:border-brand-400 sm:min-h-9"><MapPin className="h-4 w-4 text-brand-600" aria-hidden />{l(c.location_name_en ?? c.location_text ?? '', c.location_name_ar)}</Link>}
                          </div>
                        </li>
                      );
                    })}
                  </ol>
                )}
              </Card>
            )}

            <div className={clsx('grid gap-2', isStaffOnly ? 'grid-cols-1 sm:max-w-xs' : 'grid-cols-3')}>
              {!isStaffOnly && <Stat label={t('today.stat.classes')} value={d.stats.classesToday} to="/academics/timetable" />}
              {!isStaffOnly && <Stat label={t('today.stat.tasks')} value={d.stats.tasksDue} to="/academics/study" />}
              <Stat label={t('today.stat.pending')} value={d.stats.pending + (isStudent && d.stats.unexcusedAbsences ? 1 : 0)} to="#today-attention" />
            </div>

            <Card as="section" id="today-attention" aria-labelledby="today-attention-h" className="scroll-mt-20">
              <SectionTitle id="today-attention-h" action={<SectionLink to="/approvals">{t('nav.approvals')}</SectionLink>}>{t('today.attention')}</SectionTitle>
              {isStudent && d.stats.unexcusedAbsences > 0 && (
                <Link to="/academics/attendance" className="mb-2 flex min-h-11 items-center justify-between gap-3 rounded-xl border border-warn/40 bg-warn/10 p-3 text-sm transition hover:border-warn">
                  <span className="min-w-0 font-medium">{t('today.unexcused', { n: d.stats.unexcusedAbsences })}</span>
                  <ArrowRight className="h-4 w-4 shrink-0 text-muted rtl:rotate-180" aria-hidden />
                </Link>
              )}
              {d.pending.length === 0 && !(isStudent && d.stats.unexcusedAbsences > 0) ? <p className="flex items-center gap-2 text-sm text-muted"><Sparkles className="h-4 w-4 text-gold-700" aria-hidden />{t('today.caughtUp')}</p> : (
                <ul className="space-y-2">
                  {d.pending.map((p) => (
                    <li key={p.id}>
                      <Link to={p.link} className="flex min-h-11 items-center justify-between gap-3 rounded-xl border border-line p-3 text-sm transition hover:border-brand-400">
                        <span className="min-w-0 font-medium">{pendingTitle(p, t)}</span>
                        <span className="flex shrink-0 items-center gap-2"><StatusPill status={p.status} /><ArrowRight className="h-4 w-4 text-muted rtl:rotate-180" aria-hidden /></span>
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
            </Card>

            {isStudent && (
              <Card as="section" aria-labelledby="today-tasks">
                <SectionTitle id="today-tasks" action={<SectionLink to="/academics/study">{t('today.action.study')}</SectionLink>}>{t('today.tasks')}</SectionTitle>
                {d.stats.overdueTasks > 0 && <Link to="/academics/study?repair=missed" className="mb-3 flex min-h-11 items-center rounded-xl border border-warn/40 bg-warn/10 p-3 text-sm text-fg hover:border-warn">{t('today.overdue', { n: d.stats.overdueTasks })}</Link>}
                {d.tasks.length === 0 ? <p className="text-sm text-muted">{t('today.noTasks')}</p> : (
                  <ul className="divide-y divide-line">
                    {d.tasks.map((tk) => (
                      <li key={tk.id} className="flex items-center gap-3 py-2 text-sm">
                        {tk.locked ? <Lock className="h-4 w-4 shrink-0 text-gold-700" aria-label={t('calendar.fixed')} /> : <BookOpenCheck className="h-4 w-4 shrink-0 text-muted" aria-hidden />}
                        <span className="min-w-0 flex-1">
                          <span dir="auto" className="block truncate font-medium rtl:text-right">{tk.title}</span>
                          <span className="text-xs text-muted">{[tk.course_code, minutesLabel(tk.effort_min, locale), tk.scheduled_date ? fmtDate(tk.scheduled_date, locale, { weekday: 'short', year: undefined }) : t('status.unscheduled'), tk.deadline ? t('today.due', { date: fmtDate(tk.deadline, locale, { year: undefined }) }) : null].filter(Boolean).join(' · ')}</span>
                        </span>
                        <span className="w-16 shrink-0"><Progress label={tk.title} value={tk.progress} tone={tk.status === 'done' ? 'success' : 'brand'} /></span>
                      </li>
                    ))}
                  </ul>
                )}
              </Card>
            )}
          </div>

          <div className="space-y-6">
            {!isStaffOnly && (
              <Card as="section" aria-labelledby="today-week">
                <SectionTitle id="today-week" action={<SectionLink to="/calendar">{t('nav.calendar')}</SectionLink>}>{t('today.restOfWeek')}</SectionTitle>
                <WeekAgenda entries={d.week} today={d.today} />
              </Card>
            )}

            <Card as="section" aria-labelledby="today-more">
              <SectionTitle id="today-more">{t('today.more')}</SectionTitle>
              <ul className="divide-y divide-line">
                {isStudent && (
                  <li>
                    <Link to="/academics/attendance" className="flex min-h-11 items-start gap-3 py-3 hover:text-brand-600">
                      <UserCheck className="mt-0.5 h-5 w-5 shrink-0 text-muted" aria-hidden />
                      <span className="min-w-0 flex-1">
                        <span className="block font-medium">{t('today.attendance')}</span>
                        <span className="block text-sm text-muted">{worst ? t('today.attendanceWorst', { course: worst.course_code, p: String(worst.percent) }) : t('today.attendanceOk')}</span>
                        {worst && <AbsenceBar label={worst.course_code} percent={worst.percent} warn={d.policies.absenceWarningPercent} deny={d.policies.absenceDenialPercent} level={worst.level} className="mt-2 max-w-xs" />}
                        {worst && <AbsenceLegend className="mt-2" warn={d.policies.absenceWarningPercent} deny={d.policies.absenceDenialPercent} />}
                      </span>
                      <ArrowRight className="mt-0.5 h-4 w-4 shrink-0 text-muted rtl:rotate-180" aria-hidden />
                    </Link>
                  </li>
                )}
                <li>
                  <Link to="/campus" className="flex min-h-11 items-start gap-3 py-3 hover:text-brand-600">
                    <Compass className="mt-0.5 h-5 w-5 shrink-0 text-muted" aria-hidden />
                    <span className="min-w-0 flex-1">
                      <span className="block font-medium">{t('today.campus')}</span>
                      <span className="block text-sm text-muted">{[t('today.eventsSoon', { n: eventsSoon }), d.clubs.length ? t('today.clubsCount', { n: d.clubs.length }) : null].filter(Boolean).join(' · ')}</span>
                      {d.lostFound.slice(0, 1).map((lf) => (
                        <span key={lf.id} className="mt-1 flex flex-wrap items-center gap-2 text-sm">
                          <span className="font-mono text-gold-700">{lf.public_id}</span>
                          <StatusPill status={lf.status} />
                          {lf.collection_location_en && <span className="text-muted">{t('today.collectFrom')} {l(lf.collection_location_en, lf.collection_location_ar)}</span>}
                        </span>
                      ))}
                    </span>
                    <ArrowRight className="mt-0.5 h-4 w-4 shrink-0 text-muted rtl:rotate-180" aria-hidden />
                  </Link>
                </li>
                {isStudent && (
                  <li>
                    <Link to="/portfolio" className="flex min-h-11 items-start gap-3 py-3 hover:text-brand-600">
                      <BadgeCheck className="mt-0.5 h-5 w-5 shrink-0 text-muted" aria-hidden />
                      <span className="min-w-0 flex-1">
                        <span className="block font-medium">{t('nav.portfolio')}</span>
                        <span className="block text-sm text-muted">{t('today.portfolioBody')}</span>
                      </span>
                      <ArrowRight className="mt-0.5 h-4 w-4 shrink-0 text-muted rtl:rotate-180" aria-hidden />
                    </Link>
                  </li>
                )}
                {isStudent && (
                  <li>
                    <Link to="/career?tab=tracker" className="flex min-h-11 items-start gap-3 py-3 hover:text-brand-600">
                      <Briefcase className="mt-0.5 h-5 w-5 shrink-0 text-muted" aria-hidden />
                      <span className="min-w-0 flex-1">
                        <span className="block font-medium">{t('today.career')}</span>
                        <span className="block text-sm text-muted">{d.applications.length ? t('today.applicationsActive', { n: d.applications.length }) : t('today.savedCount', { n: d.stats.savedOpportunities })}</span>
                        {d.applications[0] && <span className="mt-1 flex flex-wrap items-center gap-2 text-sm"><span dir="auto" className="truncate">{d.applications[0].company} · {d.applications[0].title}</span><StatusPill status={d.applications[0].status} /></span>}
                      </span>
                      <ArrowRight className="mt-0.5 h-4 w-4 shrink-0 text-muted rtl:rotate-180" aria-hidden />
                    </Link>
                  </li>
                )}
              </ul>
            </Card>
          </div>
        </div>
      )}
    </div>
  );
}
