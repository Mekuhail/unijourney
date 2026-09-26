import { Link } from 'react-router';
import { motion } from 'motion/react';
import { CalendarClock, MapPin, ClipboardList, BookOpenCheck, Compass, Briefcase, Search, GraduationCap, FileText, Lock, ArrowRight, Sparkles, Users, Bell } from 'lucide-react';
import clsx from 'clsx';
import { useI18n } from '@/i18n';
import { useSession } from '@/lib/session';
import { useTheme } from '@/lib/theme';
import { useQuery } from '@/lib/useQuery';
import { api } from '@/lib/api';
import { fmtTime, fmtDate, minutesLabel } from '@/lib/format';
import { Card, StatusPill, Skeleton, ErrorState, Progress, Badge, EmptyState, SectionTitle } from '@/components/ui';
import { WeekCalendar } from '@/pages/CalendarPage';
import CountUp from '@/components/reactbits/CountUp';
import Aurora from '@/components/reactbits/Aurora';
import ShinyText from '@/components/reactbits/ShinyText';
import SpotlightCard from '@/components/reactbits/SpotlightCard';
import type { CalendarEntry } from '@shared/types';

interface TodayData {
  today: string; now: string; local: { hour: number; weekday: number; date: string };
  term: { id: string; label: { en: string; ar: string }; next: string; nextLabel: { en: string; ar: string } };
  user: { stage: string; level: number; program: { name_en: string; name_ar: string } | null; campus_id: string; roles: string[] };
  stats: { classesToday: number; tasksDue: number; overdueTasks: number; pending: number; unread: number; creditsEarned: number; creditsEnrolled: number; unexcusedAbsences: number; savedOpportunities: number };
  classes: Array<CalendarEntry & { location_name_en?: string | null; location_name_ar?: string | null }>;
  nextClass: (CalendarEntry & { location_name_en?: string | null }) | null;
  upcoming: Array<CalendarEntry & { location_name_en?: string | null; location_name_ar?: string | null }>;
  pending: Array<{ kind: string; id: string; title: string; status: string; link: string }>;
  tasks: Array<{ id: string; title: string; course_code: string | null; effort_min: number; deadline: string | null; scheduled_date: string | null; status: string; locked: boolean; progress: number }>;
  attendance: Array<{ course_code: string; absences: number; sessions: number; percent: number; level: 'ok' | 'warn' | 'danger' }>;
  lostFound: Array<{ id: string; public_id: string; item: string; status: string; collection_location_id: string | null; collection_location_en: string | null }>;
  applications: Array<{ id: string; company: string; title: string; status: string; deadline: string | null }>;
  clubs: Array<{ id: string; name_en: string; name_ar: string; status: string }>;
  queues: Array<{ key: string; title: string; count: number; link: string }>;
  week: CalendarEntry[];
  policies: { absenceWarningPercent: number; absenceDenialPercent: number };
}

function Stat({ label, value, to, accent }: { label: string; value: number; to: string; accent?: string }) {
  return (
    <Link to={to} className="card-2 group flex flex-col gap-1 p-4 transition hover:border-brand-400">
      <span className="text-[11px] font-semibold uppercase tracking-[0.12em] text-muted">{label}</span>
      <span className={clsx('num text-3xl font-bold', accent)}><CountUp to={value} duration={1.2} /></span>
    </Link>
  );
}

export function TodayPage() {
  const { t, locale, l } = useI18n();
  const { user, hasRole } = useSession();
  const { reducedMotion, resolved } = useTheme();
  const q = useQuery(() => api<TodayData>('/today'), [user?.id], { refreshOn: ['calendar', 'persona', 'clock'] });
  const d = q.data;
  const hour = d?.local.hour ?? 9;
  const greet = hour < 12 ? t('today.morning') : hour < 17 ? t('today.afternoon') : t('today.evening');
  const first = user ? l(user.name_en, user.name_ar).split(' ')[0] : '';
  const isWeekend = d ? d.local.weekday === 5 || d.local.weekday === 6 : false;
  const isStaffOnly = !!user && !hasRole('student', 'applicant');

  const actions = [
    hasRole('applicant') && { to: '/journey/admission', icon: FileText, label: t('today.action.admission') },
    hasRole('student') && { to: '/academics/register', icon: ClipboardList, label: t('today.action.register') },
    hasRole('student') && { to: '/academics/attendance', icon: CalendarClock, label: t('today.action.excuse') },
    hasRole('student') && { to: '/academics/study', icon: BookOpenCheck, label: t('today.action.study') },
    { to: '/campus/map', icon: MapPin, label: t('today.action.map') },
    { to: '/campus/lost-found', icon: Search, label: t('today.action.lost') },
    hasRole('student') && { to: '/career', icon: Briefcase, label: t('today.action.career') },
    user?.stage === 'graduating' && { to: '/journey/graduation', icon: GraduationCap, label: t('today.action.graduation') }
  ].filter(Boolean) as Array<{ to: string; icon: typeof MapPin; label: string }>;

  return (
    <div className="space-y-6">
      {/* Hero */}
      <section className="relative overflow-hidden rounded-[1.75rem] border border-line bg-ink-900 p-6 text-white sm:p-8">
        {!reducedMotion && (
          <div className="absolute inset-0 opacity-70" aria-hidden>
            <Aurora colorStops={['#F0762B', '#C8975B', '#2F6FDB']} amplitude={0.9} blend={0.6} speed={0.6} />
          </div>
        )}
        <div className="absolute inset-0 bg-gradient-to-t from-ink-950/90 via-ink-950/40 to-transparent" aria-hidden />
        <div className="relative">
          <div className="flex flex-wrap items-center gap-2 text-xs">
            <Badge tone="gold">{d ? (locale === 'ar' ? d.term.label.ar : d.term.label.en) : '…'}</Badge>
            {d?.user.program && <Badge tone="brand">{l(d.user.program.name_en, d.user.program.name_ar)}</Badge>}
            {user && <Badge tone="neutral" className="!bg-white/10 !text-white">{user.campus_id === 'khobar' ? 'Khobar' : 'Riyadh'} · {user.stage}</Badge>}
          </div>
          <h1 className="mt-3 text-3xl font-bold tracking-tight sm:text-4xl">{greet}, {first}</h1>
          <div className="mt-1 text-sm text-white/80">
            <ShinyText text={d ? `${fmtDate(d.today, locale, { weekday: 'long' })} · ${t('today.subtitle')}` : t('today.subtitle')} speed={3} color={resolved === 'dark' ? '#d9cfc4' : '#f3eee8'} shineColor="#ffd9bf" className="!text-sm" />
          </div>
          {d && (
            <div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
              {[
                { label: t('today.stat.classes'), value: d.stats.classesToday, to: '/academics/timetable' },
                { label: t('today.stat.tasks'), value: d.stats.tasksDue, to: '/academics/study' },
                { label: t('today.stat.pending'), value: d.stats.pending, to: '/approvals' },
                { label: t('today.stat.credits'), value: d.stats.creditsEarned, to: '/academics/plan' },
                { label: t('today.stat.enrolled'), value: d.stats.creditsEnrolled, to: '/academics/timetable' },
                { label: t('today.stat.unread'), value: d.stats.unread, to: '/notifications' }
              ].map((s) => (
                <Link key={s.label} to={s.to} className="rounded-2xl border border-white/15 bg-white/10 p-3 backdrop-blur transition hover:bg-white/15">
                  <div className="text-[10px] font-semibold uppercase tracking-[0.12em] text-white/70">{s.label}</div>
                  <div className="num text-2xl font-bold"><CountUp to={s.value} duration={1} /></div>
                </Link>
              ))}
            </div>
          )}
        </div>
      </section>

      {q.error ? <ErrorState error={q.error} onRetry={q.refetch} /> : null}
      {!d && !q.error && <div className="grid grid-cols-1 gap-4 md:grid-cols-2"><Skeleton className="h-48" /><Skeleton className="h-48" /></div>}

      {d && d.queues.length > 0 && (
        <section>
          <SectionTitle>{t('today.queues')}</SectionTitle>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {d.queues.map((qq) => (
              <Link key={qq.key} to={qq.link} className="card flex items-center justify-between p-4 transition hover:border-brand-400">
                <span className="font-medium">{qq.title}</span>
                <span className="num rounded-full bg-brand-500 px-2.5 py-0.5 text-sm font-bold text-white">{qq.count}</span>
              </Link>
            ))}
          </div>
        </section>
      )}

      {d && (
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-[1.2fr_1fr]">
          <div className="space-y-6">
            {!isStaffOnly && (
              <Card>
                <SectionTitle action={<Link to="/academics/timetable" className="text-xs font-medium text-brand-600 hover:underline">{t('common.view')} →</Link>}>{t('today.schedule')}</SectionTitle>
                {d.classes.length === 0 && d.upcoming.filter((u) => u.start_at.slice(0, 10) === d.today).length === 0 ? (
                  <EmptyState icon={<CalendarClock className="h-6 w-6" />} title={t('today.noClasses')} body={isWeekend ? t('today.weekend') : undefined} />
                ) : (
                  <ol className="relative space-y-2 border-s border-line ps-4">
                    {[...d.classes, ...d.upcoming.filter((u) => u.start_at.slice(0, 10) === d.today && u.kind !== 'class')].sort((a, b) => a.start_at.localeCompare(b.start_at)).map((c) => {
                      const isNext = d.nextClass?.id === c.id;
                      return (
                        <li key={c.id} className={clsx('relative rounded-xl border p-3', isNext ? 'border-brand-400 bg-brand-50/60 dark:bg-brand-900/20' : 'border-line')}>
                          <span className={clsx('absolute -start-[21px] top-4 h-2.5 w-2.5 rounded-full', isNext ? 'bg-brand-500' : c.end_at < d.now ? 'bg-line' : 'bg-gold-500')} />
                          <div className="flex flex-wrap items-center justify-between gap-2">
                            <div>
                              <div className="num text-xs text-muted">{fmtTime(c.start_at, locale)} – {fmtTime(c.end_at, locale)} {isNext && <Badge tone="brand" className="ms-1">{t('today.next')}</Badge>}</div>
                              <div className="font-semibold">{c.title}</div>
                            </div>
                            {c.location_id && <Link to={`/campus/map?to=${c.location_id}`} className="inline-flex items-center gap-1 rounded-lg border border-line px-2 py-1 text-xs hover:border-brand-400"><MapPin className="h-3.5 w-3.5 text-brand-500" />{l(c.location_name_en ?? c.location_text ?? '', c.location_name_ar)}</Link>}
                          </div>
                        </li>
                      );
                    })}
                  </ol>
                )}
              </Card>
            )}

            <Card>
              <SectionTitle action={<Link to="/approvals" className="text-xs font-medium text-brand-600 hover:underline">{t('nav.approvals')} →</Link>}>{t('today.attention')}</SectionTitle>
              {d.pending.length === 0 ? <div className="flex items-center gap-2 text-sm text-muted"><Sparkles className="h-4 w-4 text-gold-500" />{t('today.caughtUp')}</div> : (
                <ul className="space-y-2">
                  {d.pending.map((p) => (
                    <li key={p.id}>
                      <Link to={p.link} className="flex items-center justify-between gap-3 rounded-xl border border-line p-3 text-sm transition hover:border-brand-400">
                        <span className="font-medium">{p.title}</span>
                        <span className="flex items-center gap-2"><StatusPill status={p.status} /><ArrowRight className="h-4 w-4 text-muted rtl:rotate-180" /></span>
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
            </Card>

            {hasRole('student') && (
              <Card>
                <SectionTitle action={<Link to="/academics/study" className="text-xs font-medium text-brand-600 hover:underline">{t('today.action.study')} →</Link>}>{t('today.tasks')}</SectionTitle>
                {d.stats.overdueTasks > 0 && <Link to="/academics/study?repair=missed" className="mb-3 block rounded-xl border border-warn/40 bg-warn/10 p-3 text-sm text-fg hover:border-warn">{t('today.overdue', { n: d.stats.overdueTasks })}</Link>}
                {d.tasks.length === 0 ? <div className="text-sm text-muted">{t('today.noTasks')}</div> : (
                  <ul className="divide-y divide-line">
                    {d.tasks.map((tk) => (
                      <li key={tk.id} className="flex items-center gap-3 py-2 text-sm">
                        {tk.locked ? <Lock className="h-4 w-4 text-gold-500" /> : <BookOpenCheck className="h-4 w-4 text-muted" />}
                        <span className="min-w-0 flex-1">
                          <span className="block truncate font-medium">{tk.title}</span>
                          <span className="text-xs text-muted">{tk.course_code ?? ''} · {minutesLabel(tk.effort_min, locale)} · {tk.scheduled_date ? fmtDate(tk.scheduled_date, locale) : t('status.unscheduled')}{tk.deadline ? ` · due ${fmtDate(tk.deadline, locale)}` : ''}</span>
                        </span>
                        <span className="w-16"><Progress value={tk.progress} tone={tk.status === 'done' ? 'success' : 'brand'} /></span>
                      </li>
                    ))}
                  </ul>
                )}
              </Card>
            )}
          </div>

          <div className="space-y-6">
            <section>
              <SectionTitle>{t('today.quick')}</SectionTitle>
              <div className="grid grid-cols-2 gap-3">
                {actions.map((a, i) => (
                  <motion.div key={a.to} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.05 * i }}>
                    <Link to={a.to} className="block h-full">
                      <SpotlightCard className="!rounded-2xl !border-line !bg-surface !p-4 h-full transition hover:border-brand-400" spotlightColor="rgba(240, 118, 43, 0.25)">
                        <a.icon className="mb-2 h-5 w-5 text-brand-500" />
                        <div className="text-sm font-semibold">{a.label}</div>
                      </SpotlightCard>
                    </Link>
                  </motion.div>
                ))}
              </div>
            </section>

            {hasRole('student') && d.attendance.length > 0 && (
              <Card>
                <SectionTitle action={<Link to="/academics/attendance" className="text-xs font-medium text-brand-600 hover:underline">{t('common.view')} →</Link>}>{t('today.attendance')}</SectionTitle>
                <ul className="space-y-2">
                  {d.attendance.map((a) => (
                    <li key={a.course_code} className="text-sm">
                      <div className="flex justify-between"><span className="font-medium">{a.course_code}</span><span className="num text-muted">{a.absences}/{a.sessions} · {a.percent}%</span></div>
                      <Progress value={a.percent} max={d.policies.absenceDenialPercent} tone={a.level === 'danger' ? 'danger' : a.level === 'warn' ? 'warn' : 'success'} className="mt-1" />
                    </li>
                  ))}
                </ul>
                <div className="mt-2 text-[11px] text-muted">Warning at {d.policies.absenceWarningPercent}% · denial at {d.policies.absenceDenialPercent}% (demo policy)</div>
              </Card>
            )}

            <Card>
              <SectionTitle action={<Link to="/campus" className="text-xs font-medium text-brand-600 hover:underline">{t('common.view')} →</Link>}>{t('today.campus')}</SectionTitle>
              <div className="space-y-3 text-sm">
                {d.upcoming.length > 0 && (
                  <div>
                    <div className="mb-1 text-xs font-semibold uppercase tracking-wide text-muted">{t('today.upcoming')}</div>
                    <ul className="space-y-1.5">
                      {d.upcoming.slice(0, 4).map((u) => (
                        <li key={u.id}><Link to={u.link ?? '/calendar'} className="flex items-center justify-between gap-2 rounded-lg border border-line px-2.5 py-1.5 hover:border-brand-400"><span className="truncate"><Badge tone={u.kind === 'interview' ? 'info' : u.kind === 'exam' ? 'danger' : 'gold'} className="me-2">{u.kind}</Badge>{u.title}</span><span className="num shrink-0 text-xs text-muted">{fmtDate(u.start_at, locale, { weekday: 'short' })}</span></Link></li>
                      ))}
                    </ul>
                  </div>
                )}
                {d.lostFound.length > 0 && (
                  <div>
                    <div className="mb-1 text-xs font-semibold uppercase tracking-wide text-muted">{t('today.lostFound')}</div>
                    {d.lostFound.map((lf) => (
                      <Link key={lf.id} to={`/campus/lost-found/${lf.id}`} className="mb-1.5 flex items-center justify-between gap-2 rounded-lg border border-line px-2.5 py-1.5 hover:border-brand-400">
                        <span className="truncate"><span className="font-mono text-xs text-gold-700">{lf.public_id}</span> · {lf.item}{lf.collection_location_en && <span className="text-muted"> · {t('today.collectFrom')} {lf.collection_location_en}</span>}</span>
                        <StatusPill status={lf.status} />
                      </Link>
                    ))}
                  </div>
                )}
                {d.clubs.length > 0 && (
                  <div className="flex flex-wrap items-center gap-1.5"><Users className="h-4 w-4 text-muted" />{d.clubs.map((c) => <Link key={c.id} to={`/campus/clubs/${c.id}`}><Badge tone={c.status === 'active' ? 'success' : 'warn'}>{l(c.name_en, c.name_ar)}</Badge></Link>)}</div>
                )}
                {d.upcoming.length === 0 && d.lostFound.length === 0 && d.clubs.length === 0 && <div className="text-muted">{t('common.empty')}</div>}
              </div>
            </Card>

            {hasRole('student') && (
              <Card>
                <SectionTitle action={<Link to="/career" className="text-xs font-medium text-brand-600 hover:underline">{t('common.view')} →</Link>}>{t('today.career')}</SectionTitle>
                {d.applications.length === 0 ? <div className="text-sm text-muted">{d.stats.savedOpportunities} {t('today.saved')}</div> : (
                  <ul className="space-y-1.5 text-sm">
                    {d.applications.map((a) => (
                      <li key={a.id}><Link to={`/career/applications/${a.id}`} className="flex items-center justify-between gap-2 rounded-lg border border-line px-2.5 py-1.5 hover:border-brand-400"><span className="truncate"><span className="font-medium">{a.company}</span> · {a.title}</span><StatusPill status={a.status} /></Link></li>
                    ))}
                  </ul>
                )}
              </Card>
            )}
          </div>
        </div>
      )}

      {d && !isStaffOnly && (
        <section>
          <SectionTitle action={<Link to="/calendar" className="text-xs font-medium text-brand-600 hover:underline">{t('nav.calendar')} →</Link>}>{t('today.week')}</SectionTitle>
          <WeekCalendar entries={d.week} anchor={d.today} compact />
        </section>
      )}

      <div className="flex items-center justify-between rounded-2xl border border-dashed border-gold-500/50 bg-gold-100/40 p-4 text-sm dark:bg-gold-700/10">
        <span className="flex items-center gap-2"><Bell className="h-4 w-4 text-gold-700" />Judges: a guided six-minute walkthrough lives in the demo panel.</span>
        <Link to="/demo?tour=1" className="font-semibold text-brand-600 hover:underline">{t('today.tour')} →</Link>
      </div>
    </div>
  );
}
