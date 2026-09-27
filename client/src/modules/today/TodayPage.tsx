import type { ReactNode } from 'react';
import { Link } from 'react-router';
import clsx from 'clsx';
import { CalendarClock, MapPin, ArrowRight, BookOpenCheck, CalendarHeart, UserCheck, PackageCheck, Briefcase, Bell, Inbox, Sparkles, TriangleAlert } from 'lucide-react';
import { useI18n } from '@/i18n';
import { useSession } from '@/lib/session';
import { useQuery } from '@/lib/useQuery';
import { usePageTitle } from '@/lib/usePageTitle';
import { api } from '@/lib/api';
import { fmtTime, fmtDate, minutesLabel } from '@/lib/format';
import { Skeleton, ErrorState, StatusPill } from '@/components/ui';
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
const minutesBetween = (a: string, b: string) => Math.round((new Date(b).getTime() - new Date(a).getTime()) / 60000);

function pendingTitle(p: Pending, t: (k: string, v?: Record<string, string | number>) => string): string {
  const v = p.params ?? {};
  switch (p.kind) {
    case 'enrollment': return typeof v.credits === 'number' ? t('today.pending.enrollment', { n: v.credits }) : p.title;
    case 'excuse': return v.type ? t('today.pending.excuse', { type: t(`academics.excuses.type.${v.type}`) }) : p.title;
    case 'study': return t('today.pending.study');
    case 'admission': return p.status === 'admitted' ? t('today.pending.admissionOffer') : t('today.pending.admission');
    case 'graduation': return t('today.pending.graduation');
    case 'email': return v.subject ? String(v.subject) : p.title; // the subject tells two hiring emails apart; the kind goes in the meta line
    default: return p.title;
  }
}

function Row({ to, icon: Icon, title, meta, tone, trailing }: { to: string; icon: typeof Bell; title: string; meta?: string | null; tone?: 'warn'; trailing?: ReactNode }) {
  // Titles wrap to two lines (full text on hover) so similar items stay distinguishable in a narrow column.
  return (
    <li>
      <Link to={to} className="group flex min-h-12 items-center gap-3 rounded-xl px-2 py-2 transition-colors hover:bg-line/40">
        <span className={clsx('grid h-9 w-9 shrink-0 place-items-center rounded-lg', tone === 'warn' ? 'bg-warn/15 text-warn' : 'bg-surface-2 text-muted')}><Icon className="h-4 w-4" aria-hidden /></span>
        <span className="min-w-0 flex-1">
          <span dir="auto" title={title} className="line-clamp-2 break-words text-sm font-medium leading-snug rtl:text-right">{title}</span>
          {meta && <span title={meta} className="block truncate text-xs text-muted">{meta}</span>}
        </span>
        {trailing}
        <ArrowRight className="h-4 w-4 shrink-0 text-muted opacity-0 transition-opacity group-hover:opacity-100 group-focus-visible:opacity-100 rtl:rotate-180" aria-hidden />
      </Link>
    </li>
  );
}

/** Today's classes and events as one calm timeline; the next one is the only thing that stands out. */
function TodayTimeline({ d, items }: { d: TodayData; items: Entry[] }) {
  const { t, l, locale } = useI18n();
  const weekend = d.local.weekday === 5 || d.local.weekday === 6;
  if (!items.length) {
    return (
      <div className="rounded-2xl border border-dashed border-line px-5 py-8 text-center">
        <CalendarClock className="mx-auto h-6 w-6 text-muted" aria-hidden />
        <p className="mt-2 font-medium">{t('today.noClasses')}</p>
        {weekend && <p className="mt-1 text-sm text-muted">{t('today.weekend')}</p>}
      </div>
    );
  }
  return (
    <ol className="space-y-1">
      {items.map((c) => {
        const next = d.nextClass?.id === c.id;
        const on = c.start_at <= d.now && c.end_at > d.now;
        const past = c.end_at <= d.now;
        const mins = minutesBetween(d.now, c.start_at);
        return (
          <li key={c.id} className={clsx('grid grid-cols-[4.5rem_minmax(0,1fr)] gap-3 rounded-2xl p-3 sm:grid-cols-[5.5rem_minmax(0,1fr)]', next || on ? 'bg-brand-500/10 ring-1 ring-brand-500/40' : past && 'opacity-55')}>
            <div className="num text-sm leading-tight">
              <div className="font-semibold">{fmtTime(c.start_at, locale)}</div>
              <div className="text-xs text-muted">{fmtTime(c.end_at, locale)}</div>
            </div>
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                <span dir="auto" className="font-semibold leading-snug rtl:text-right">{c.title}</span>
                {c.kind !== 'class' && <span className="text-xs font-medium text-gold-700 dark:text-gold-300">{t(`kind.${c.kind}`)}</span>}
              </div>
              <div className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-muted">
                {on ? <span className="font-medium text-brand-700 dark:text-brand-300">{t('today.onNow')}</span> : next && mins > 0 ? <span className="font-medium text-brand-700 dark:text-brand-300">{t('today.startsInLabel', { t: minutesLabel(mins, locale) })}</span> : null}
                {c.location_id && (
                  <Link to={`/campus/map?to=${c.location_id}`} className="inline-flex min-h-11 items-center gap-1 hover:text-brand-600 hover:underline sm:min-h-0">
                    <MapPin className="h-3.5 w-3.5" aria-hidden />{l(c.location_name_en ?? c.location_text ?? '', c.location_name_ar)}
                  </Link>
                )}
              </div>
            </div>
          </li>
        );
      })}
    </ol>
  );
}

export function TodayPage() {
  const { t, locale, l } = useI18n();
  const { user, hasRole, can } = useSession();
  usePageTitle(t('nav.today'));
  const q = useQuery(() => api<TodayData>('/today'), [user?.id], { refreshOn: ['calendar', 'persona', 'clock'] });
  const d = q.data;
  const hour = d?.local.hour ?? 9;
  const greet = hour < 12 ? t('today.morning') : hour < 17 ? t('today.afternoon') : t('today.evening');
  const first = user ? l(user.name_en, user.name_ar).split(' ')[0] : '';
  const isStudent = hasRole('student');
  const staffOnly = !!user && !hasRole('student', 'applicant');
  // Sections follow the role → capability matrix: no timetable for applicants or staff, campus tools for staff.
  const hasSchedule = can('academics');

  const todays = d ? [...d.classes, ...d.upcoming.filter((u) => localDate(u.start_at) === d.today && u.kind !== 'class')].sort((a, b) => a.start_at.localeCompare(b.start_at)) : [];

  // Inbox: only what needs an action, most urgent first; the full lists live in Approvals and Notifications.
  const inbox: Array<{ key: string; to: string; icon: typeof Bell; title: string; meta?: string | null; tone?: 'warn'; trailing?: ReactNode }> = [];
  if (d) {
    if (staffOnly) for (const qq of d.queues) { const k = `today.queue.${qq.key}`; const v = t(k); inbox.push({ key: `q-${qq.key}`, to: qq.link, icon: Inbox, title: v === k ? qq.title : v, trailing: <span className="num rounded-full bg-brand-500 px-2 py-0.5 text-xs font-bold text-ink-950">{qq.count}</span> }); }
    if (isStudent && d.stats.unexcusedAbsences > 0) inbox.push({ key: 'abs', to: '/academics/attendance', icon: TriangleAlert, title: t('today.inboxUnexcused', { n: d.stats.unexcusedAbsences }), meta: t('today.inboxUnexcusedMeta'), tone: 'warn' });
    for (const p of d.pending) inbox.push({ key: p.id, to: p.link, icon: p.kind === 'email' ? Bell : Inbox, title: pendingTitle(p, t), meta: p.kind === 'email' ? t('today.pending.emailMeta') : null, trailing: <StatusPill status={p.status} /> });
    if (d.stats.unread > 0) inbox.push({ key: 'unread', to: '/notifications', icon: Bell, title: t('today.unreadN', { n: d.stats.unread }) });
  }
  const inboxShown = inbox.slice(0, 4);

  // For you: at most three timely things, picked by urgency. Nothing here is a permanent link list.
  const forYou: typeof inbox = [];
  if (d && isStudent) {
    const task = d.tasks.find((tk) => tk.status !== 'done' && tk.deadline) ?? d.tasks.find((tk) => tk.status !== 'done');
    if (d.stats.overdueTasks > 0) forYou.push({ key: 'overdue', to: '/academics/study?repair=missed', icon: BookOpenCheck, title: t('today.fy.overdue', { n: d.stats.overdueTasks }), tone: 'warn' });
    else if (task) forYou.push({ key: `task-${task.id}`, to: '/academics/study', icon: BookOpenCheck, title: task.title, meta: [task.course_code, task.deadline ? t('today.due', { date: fmtDate(task.deadline, locale, { weekday: 'short', year: undefined }) }) : null].filter(Boolean).join(' · ') });
    const worst = d.attendance.filter((a) => a.level !== 'ok').sort((a, b) => b.percent - a.percent)[0];
    if (worst) forYou.push({ key: 'att', to: '/academics/attendance', icon: UserCheck, title: t('today.fy.attendance', { course: worst.course_code, p: String(worst.percent) }), tone: worst.level === 'danger' ? 'warn' : undefined });
    const lf = d.lostFound.find((x) => x.status === 'found' || x.collection_location_en);
    if (lf) forYou.push({ key: `lf-${lf.id}`, to: `/campus/lost-found/${lf.id}`, icon: PackageCheck, title: t('today.fy.collect', { item: lf.item }), meta: lf.collection_location_en ? `${t('today.collectFrom')} ${l(lf.collection_location_en, lf.collection_location_ar)}` : null });
    const event = d.upcoming.find((u) => u.kind === 'event' && localDate(u.start_at) > d.today);
    if (event) forYou.push({ key: `ev-${event.id}`, to: event.link ?? '/campus/events', icon: CalendarHeart, title: event.title, meta: `${t('today.fy.going')} · ${fmtDate(event.start_at, locale, { weekday: 'short', year: undefined })} ${fmtTime(event.start_at, locale)}` });
    const app = d.applications.find((a) => a.status === 'interview' || a.deadline);
    if (app) forYou.push({ key: `app-${app.id}`, to: '/career?tab=tracker', icon: Briefcase, title: `${app.company} · ${app.title}`, meta: t(`status.${app.status}`) });
  }
  const forYouShown = forYou.slice(0, 3);

  // Staff and applicants: the few places their work happens, from the same capability matrix as the menu.
  const tools: typeof inbox = [];
  if (!isStudent) {
    if (hasRole('security')) tools.push({ key: 'lf', to: '/staff/campus/lost-found', icon: PackageCheck, title: t('today.tool.lostFound'), meta: t('today.tool.lostFoundMeta') });
    if (can('staff')) tools.push({ key: 'desk', to: '/staff', icon: Inbox, title: t('today.tool.desk'), meta: t('today.tool.deskMeta') });
    if (can('journey')) tools.push({ key: 'journey', to: '/journey', icon: Sparkles, title: t('today.tool.journey'), meta: t('today.tool.journeyMeta') });
    if (can('map')) tools.push({ key: 'map', to: '/campus/map', icon: MapPin, title: t('today.tool.map'), meta: t('today.tool.mapMeta') });
    if (hasRole('security')) tools.push({ key: 'parking', to: '/campus/map?view=parking', icon: CalendarClock, title: t('today.tool.parking'), meta: t('today.tool.parkingMeta') });
    if (can('prereqs') && !can('staff')) tools.push({ key: 'programs', to: '/prereqs', icon: BookOpenCheck, title: t('today.tool.programs'), meta: t('today.tool.programsMeta') });
  }

  return (
    <div className="mx-auto max-w-5xl">
      <header className="mb-8">
        <h1 tabIndex={-1} className="text-3xl font-bold tracking-tight sm:text-4xl">{t('today.greeting', { greet, name: first })}</h1>
        {d ? <p className="mt-1 text-muted">{fmtDate(d.today, locale, { weekday: 'long', year: undefined })} · {l(d.term.label.en, d.term.label.ar)}</p> : <Skeleton className="mt-2 h-5 w-56" />}
      </header>

      {q.error ? <ErrorState error={q.error} onRetry={q.refetch} /> : null}
      {!d && !q.error && <div className="grid gap-8 md:grid-cols-2"><Skeleton className="h-64" /><Skeleton className="h-64" /></div>}

      {d && (
        // Phones: one column, schedule first. Tablets: schedule across the top, inbox and "for you" side by side.
        // Wide screens: the day on the left, what needs you on the right.
        <div className={clsx('grid grid-cols-1 gap-x-10 gap-y-8 md:grid-cols-2', hasSchedule && 'xl:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)]')}>
          {hasSchedule && (
            <section aria-labelledby="today-h" className="md:col-span-2 xl:col-span-1 xl:row-span-2">
              <div className="mb-3 flex items-baseline justify-between gap-3">
                <h2 id="today-h" className="text-lg font-semibold">{t('today.schedule')}</h2>
                <Link to="/academics/timetable" className="inline-flex min-h-11 items-center text-sm font-medium text-brand-600 hover:underline sm:min-h-0">{t('today.timetable')}</Link>
              </div>
              <TodayTimeline d={d} items={todays} />
            </section>
          )}

          <section aria-labelledby="inbox-h" className="min-w-0">
            <div className="mb-2 flex items-baseline justify-between gap-3">
              <h2 id="inbox-h" className="text-lg font-semibold">{staffOnly ? t('today.queues') : t('today.inbox')}</h2>
              {inbox.length > inboxShown.length && <Link to="/approvals" className="inline-flex min-h-11 items-center text-sm font-medium text-brand-600 hover:underline sm:min-h-0">{t('today.seeAll', { n: inbox.length })}</Link>}
            </div>
            {inboxShown.length === 0
              ? <p className="flex items-center gap-2 px-2 py-2 text-sm text-muted"><Sparkles className="h-4 w-4 text-gold-700" aria-hidden />{t('today.caughtUp')}</p>
              : <ul>{inboxShown.map(({ key, ...r }) => <Row key={key} {...r} />)}</ul>}
          </section>

          {isStudent && forYouShown.length > 0 && (
            <section aria-labelledby="foryou-h" className="min-w-0">
              <h2 id="foryou-h" className="mb-2 text-lg font-semibold">{t('today.forYou')}</h2>
              <ul>{forYouShown.map(({ key, ...r }) => <Row key={key} {...r} />)}</ul>
            </section>
          )}

          {!isStudent && tools.length > 0 && (
            <section aria-labelledby="tools-h" className="min-w-0">
              <h2 id="tools-h" className="mb-2 text-lg font-semibold">{t('today.tools')}</h2>
              <ul>{tools.map(({ key, ...r }) => <Row key={key} {...r} />)}</ul>
            </section>
          )}
        </div>
      )}
    </div>
  );
}
