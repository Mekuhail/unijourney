import { Sun, GraduationCap, Compass, Briefcase, Route, ShieldCheck, FlaskConical, GitBranch, type LucideIcon } from 'lucide-react';
import type { Role } from '@shared/types';

export interface NavItem { to: string; key: string; icon: LucideIcon; roles?: Role[] }

export const NAV: NavItem[] = [
  { to: '/today', key: 'nav.today', icon: Sun },
  { to: '/academics', key: 'nav.academics', icon: GraduationCap },
  { to: '/prereqs', key: 'nav.prereqs', icon: GitBranch },
  { to: '/campus', key: 'nav.campus', icon: Compass },
  { to: '/career', key: 'nav.career', icon: Briefcase },
  { to: '/journey', key: 'nav.journey', icon: Route }
];
export const STAFF_NAV: NavItem = { to: '/staff', key: 'nav.staff', icon: ShieldCheck, roles: ['reviewer', 'security', 'admission_officer', 'registrar', 'club_lead'] };
export const DEMO_NAV: NavItem = { to: '/demo', key: 'nav.demo', icon: FlaskConical };
