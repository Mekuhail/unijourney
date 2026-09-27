import { Sun, GraduationCap, Users, Briefcase, Route, ShieldCheck, FlaskConical, GitBranch, Map as MapIcon, BookOpen, PackageSearch, Trophy, BadgeCheck, MessageSquareHeart, MessagesSquare, type LucideIcon } from 'lucide-react';
import type { Role } from '@shared/types';

/**
 * `match` decides the active item when several items share a URL prefix: Campus Life (clubs, events, digital card),
 * Campus map, Learning resources and Lost & found all live under /campus/* but are separate destinations.
 */
export interface NavItem { to: string; key: string; icon: LucideIcon; roles?: Role[]; match?: (path: string) => boolean }
export interface NavGroup { key: string | null; items: NavItem[] }

const under = (...prefixes: string[]) => (path: string) => prefixes.some((p) => path === p || path.startsWith(`${p}/`));

export const TODAY: NavItem = { to: '/today', key: 'nav.today', icon: Sun };
export const ACADEMICS: NavItem = { to: '/academics', key: 'nav.academics', icon: GraduationCap };
export const PREREQS: NavItem = { to: '/prereqs', key: 'nav.prereqs', icon: GitBranch };
export const RESOURCES: NavItem = { to: '/campus/resources', key: 'nav.resources', icon: BookOpen, match: under('/campus/resources') };
export const CAMPUS_LIFE: NavItem = { to: '/campus', key: 'nav.campus', icon: Users, match: (p) => p === '/campus' || under('/campus/clubs', '/campus/events', '/campus/card')(p) };
export const COMMUNITY: NavItem = { to: '/campus/community', key: 'nav.community', icon: MessagesSquare, match: under('/campus/community') };
export const MAP: NavItem = { to: '/campus/map', key: 'nav.map', icon: MapIcon, match: under('/campus/map') };
export const LOST_FOUND: NavItem = { to: '/campus/lost-found', key: 'nav.lostFound', icon: PackageSearch, match: under('/campus/lost-found') };
export const PORTFOLIO: NavItem = { to: '/portfolio', key: 'nav.portfolio', icon: BadgeCheck };
export const CAREER: NavItem = { to: '/career', key: 'nav.career', icon: Briefcase };
export const COMPETITIONS: NavItem = { to: '/competitions', key: 'nav.competitions', icon: Trophy };
export const JOURNEY: NavItem = { to: '/journey', key: 'nav.journey', icon: Route };
export const FEEDBACK: NavItem = { to: '/feedback', key: 'nav.feedback', icon: MessageSquareHeart };

/** Side menu, grouped so twelve destinations stay scannable. */
export const NAV_GROUPS: NavGroup[] = [
  { key: null, items: [TODAY] },
  { key: 'nav.group.study', items: [ACADEMICS, PREREQS, RESOURCES] },
  { key: 'nav.group.campus', items: [CAMPUS_LIFE, COMMUNITY, MAP, LOST_FOUND] },
  { key: 'nav.group.future', items: [PORTFOLIO, CAREER, COMPETITIONS, JOURNEY] },
  { key: 'nav.group.help', items: [FEEDBACK] }
];

/** Phone bottom bar: the five most frequent destinations; everything else is in the menu. */
export const BOTTOM_NAV: NavItem[] = [TODAY, ACADEMICS, CAMPUS_LIFE, MAP, CAREER];

export const STAFF_NAV: NavItem = { to: '/staff', key: 'nav.staff', icon: ShieldCheck, roles: ['reviewer', 'security', 'admission_officer', 'registrar', 'club_lead'] };
export const DEMO_NAV: NavItem = { to: '/demo', key: 'nav.demo', icon: FlaskConical };

export function isActive(item: NavItem, path: string): boolean {
  return item.match ? item.match(path) : path === item.to || path.startsWith(`${item.to}/`);
}
