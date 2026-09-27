import type { Role } from './types';

/**
 * Role → capability matrix. The single source for what each persona can reach: the side menu, the phone bottom bar,
 * the account menu, Today's shortcuts, the default landing page, client route guards and server endpoint guards all
 * derive from it. Mixed roles get the union. Hiding a link is never the authorization: the server checks the same
 * capability on every student-only endpoint.
 */
export type Capability =
  | 'today'
  | 'calendar'
  | 'approvals'
  | 'academics' //  Overview, timetable, course pages
  | 'degreePlan' //  Degree plan and the requirement check
  | 'registration' //  Basket, section comparison, classmate coordination
  | 'attendance' //  Attendance and exact-session excuses
  | 'study' //  Study planner
  | 'gpa' //  GPA planner
  | 'prereqs' //  Prerequisite map (public curriculum information)
  | 'resources' //  Learning resources
  | 'campusLife' //  Clubs and events
  | 'community' //  Student community
  | 'map' //  Campus map and parking
  | 'lostFound' //  Lost & found
  | 'portfolio'
  | 'career'
  | 'competitions'
  | 'journey' //  Admission → graduation journey
  | 'feedback' //  Rate courses, ask for help
  | 'feedbackKpis' //  Course and instructor KPI pages
  | 'studentCard'
  | 'staff'; //  Staff queues

const STUDENT: Capability[] = ['today', 'calendar', 'approvals', 'academics', 'degreePlan', 'registration', 'attendance', 'study', 'gpa', 'prereqs', 'resources', 'campusLife', 'community', 'map', 'lostFound', 'portfolio', 'career', 'competitions', 'journey', 'feedback', 'feedbackKpis', 'studentCard'];
const STAFF_BASE: Capability[] = ['today', 'calendar', 'approvals', 'map', 'staff'];

export const ROLE_CAPABILITIES: Record<Role, Capability[]> = {
  student: STUDENT,
  // Applicants explore programmes and follow their application; campus tools are open to visitors too.
  applicant: ['today', 'approvals', 'journey', 'prereqs', 'map', 'feedback'],
  // Security works the lost & found desk and campus operations; no academic or career pages.
  security: [...STAFF_BASE, 'lostFound'],
  // Reviewers and the registrar follow course-quality KPIs from the quality desk.
  reviewer: [...STAFF_BASE, 'prereqs', 'feedbackKpis'],
  registrar: [...STAFF_BASE, 'prereqs', 'feedbackKpis'],
  admission_officer: [...STAFF_BASE, 'prereqs'],
  // Club leads are students; the role only adds the club queue.
  club_lead: ['staff', 'campusLife'],
  operator: ['today', 'calendar', 'approvals', 'map']
};

export function capabilitiesOf(roles: readonly Role[]): Set<Capability> {
  const out = new Set<Capability>();
  for (const r of roles) for (const c of ROLE_CAPABILITIES[r] ?? []) out.add(c);
  return out;
}

export function can(roles: readonly Role[] | null | undefined, cap: Capability): boolean {
  return !!roles && roles.some((r) => (ROLE_CAPABILITIES[r] ?? []).includes(cap));
}

/** Where a persona lands after sign-in (and from "/"). Applicants start with their application journey. */
export function landingFor(roles: readonly Role[] | null | undefined): string {
  if (roles?.length === 1 && roles[0] === 'applicant') return '/journey';
  return '/today';
}

/** Which capability a client route needs. The first matching prefix wins; unlisted routes are open to everyone signed in. */
export const ROUTE_CAPABILITY: Array<[prefix: string, cap: Capability]> = [
  ['/academics/register', 'registration'],
  ['/academics/attendance', 'attendance'],
  ['/academics/excuses', 'attendance'],
  ['/academics/study', 'study'],
  ['/academics/gpa', 'gpa'],
  ['/academics/plan', 'degreePlan'],
  ['/academics/requirements', 'degreePlan'],
  ['/academics', 'academics'],
  ['/prereqs', 'prereqs'],
  ['/campus/resources', 'resources'],
  ['/campus/community', 'community'],
  ['/campus/map', 'map'],
  ['/campus/lost-found', 'lostFound'],
  ['/campus/card', 'studentCard'],
  ['/campus', 'campusLife'],
  ['/portfolio', 'portfolio'],
  ['/career', 'career'],
  ['/competitions', 'competitions'],
  ['/journey', 'journey'],
  ['/feedback/courses', 'feedbackKpis'],
  ['/feedback/instructors', 'feedbackKpis'],
  ['/feedback', 'feedback'],
  ['/staff', 'staff'],
  ['/calendar', 'calendar'],
  ['/approvals', 'approvals'],
  ['/today', 'today']
];

export function capabilityForPath(path: string): Capability | null {
  for (const [prefix, cap] of ROUTE_CAPABILITY) if (path === prefix || path.startsWith(`${prefix}/`)) return cap;
  return null;
}
