import { Sun, GraduationCap, Users, Briefcase, Route, ShieldCheck, FlaskConical, GitBranch, Map as MapIcon, BookOpen, PackageSearch, Trophy, BadgeCheck, MessageSquareHeart, MessagesSquare, type LucideIcon } from 'lucide-react';
import type { Role } from '@shared/types';
import { can, type Capability } from '@shared/access';

/**
 * `match` decides the active item when several items share a URL prefix: Campus Life (clubs, events, digital card),
 * Campus map, Learning resources and Lost & found all live under /campus/* but are separate destinations.
 */
export interface NavItem { to: string; key: string; icon: LucideIcon; cap: Capability; match?: (path: string) => boolean }
export interface NavGroup { key: string | null; items: NavItem[] }

const under = (...prefixes: string[]) => (path: string) => prefixes.some((p) => path === p || path.startsWith(`${p}/`));

export const TODAY: NavItem = { to: '/today', key: 'nav.today', icon: Sun, cap: 'today' };
export const ACADEMICS: NavItem = { to: '/academics', key: 'nav.academics', icon: GraduationCap, cap: 'academics' };
export const PREREQS: NavItem = { to: '/prereqs', key: 'nav.prereqs', icon: GitBranch, cap: 'prereqs' };
export const RESOURCES: NavItem = { to: '/campus/resources', key: 'nav.resources', icon: BookOpen, cap: 'resources', match: under('/campus/resources') };
export const CAMPUS_LIFE: NavItem = { to: '/campus', key: 'nav.campus', icon: Users, cap: 'campusLife', match: (p) => p === '/campus' || under('/campus/clubs', '/campus/events', '/campus/card')(p) };
export const COMMUNITY: NavItem = { to: '/campus/community', key: 'nav.community', icon: MessagesSquare, cap: 'community', match: under('/campus/community') };
export const MAP: NavItem = { to: '/campus/map', key: 'nav.map', icon: MapIcon, cap: 'map', match: under('/campus/map') };
export const LOST_FOUND: NavItem = { to: '/campus/lost-found', key: 'nav.lostFound', icon: PackageSearch, cap: 'lostFound', match: under('/campus/lost-found') };
export const PORTFOLIO: NavItem = { to: '/portfolio', key: 'nav.portfolio', icon: BadgeCheck, cap: 'portfolio' };
export const CAREER: NavItem = { to: '/career', key: 'nav.career', icon: Briefcase, cap: 'career' };
export const COMPETITIONS: NavItem = { to: '/competitions', key: 'nav.competitions', icon: Trophy, cap: 'competitions' };
export const JOURNEY: NavItem = { to: '/journey', key: 'nav.journey', icon: Route, cap: 'journey' };
export const FEEDBACK: NavItem = { to: '/feedback', key: 'nav.feedback', icon: MessageSquareHeart, cap: 'feedback' };

export const STAFF_NAV: NavItem = { to: '/staff', key: 'nav.staff', icon: ShieldCheck, cap: 'staff' };
export const DEMO_NAV: NavItem = { to: '/demo', key: 'nav.demo', icon: FlaskConical, cap: 'today' };

/** Side menu, grouped so the destinations stay scannable. Items and whole groups a role cannot use are left out. */
const NAV_GROUPS: NavGroup[] = [
  { key: null, items: [TODAY] },
  { key: 'nav.group.work', items: [STAFF_NAV] },
  { key: 'nav.group.study', items: [ACADEMICS, PREREQS, RESOURCES] },
  { key: 'nav.group.campus', items: [CAMPUS_LIFE, COMMUNITY, MAP, LOST_FOUND] },
  { key: 'nav.group.future', items: [PORTFOLIO, CAREER, COMPETITIONS, JOURNEY] },
  { key: 'nav.group.help', items: [FEEDBACK] }
];

/** Club leads are students first: their club queue sits with the demo panel under "More" rather than at the top. */
export function sideNavFor(roles: readonly Role[] | undefined, demoMode: boolean): NavGroup[] {
  const r = roles ?? [];
  const student = can(r, 'academics');
  const groups = NAV_GROUPS
    .filter((g) => !(student && g.key === 'nav.group.work'))
    .map((g) => ({ ...g, items: g.items.filter((it) => can(r, it.cap)) }))
    .filter((g) => g.items.length);
  const more: NavItem[] = [];
  if (student && can(r, 'staff')) more.push(STAFF_NAV);
  if (demoMode) more.push(DEMO_NAV);
  if (more.length) groups.push({ key: 'nav.group.more', items: more });
  return groups;
}

/** Phone bottom bar: up to five of the most frequent destinations this role can use; the rest live in the menu. */
export function bottomNavFor(roles: readonly Role[] | undefined): NavItem[] {
  const r = roles ?? [];
  const staffOnly = can(r, 'staff') && !can(r, 'academics');
  const order = staffOnly ? [TODAY, STAFF_NAV, MAP, LOST_FOUND, PREREQS] : [TODAY, ACADEMICS, JOURNEY, CAMPUS_LIFE, MAP, CAREER, PREREQS];
  // Students reach their journey from Today; it only earns a tab when Academics is not available (applicants).
  return order.filter((it) => can(r, it.cap) && !(it === JOURNEY && can(r, 'academics'))).slice(0, 5);
}

export function isActive(item: NavItem, path: string): boolean {
  return item.match ? item.match(path) : path === item.to || path.startsWith(`${item.to}/`);
}
