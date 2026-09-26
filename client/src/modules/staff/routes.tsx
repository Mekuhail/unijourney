import { Link, Route, Routes } from 'react-router';
import { ShieldCheck, ClipboardList, Users, Search, GraduationCap, FileCheck, BookOpen } from 'lucide-react';
import { PageHeader } from '@/components/ui/PageHeader';
import { Card, EmptyState } from '@/components/ui';
import { useSession } from '@/lib/session';
import { useI18n } from '@/i18n';
import { AcademicsStaffRoutes } from '../academics/staff';
import { CampusStaffRoutes } from '../campus/staff';
import { CareerStaffRoutes } from '../career/staff';
import { JourneyStaffRoutes } from '../journey/staff';
import type { Role } from '@shared/types';

const QUEUES: Array<{ to: string; title: string; body: string; roles: Role[]; icon: typeof ShieldCheck }> = [
  { to: '/staff/academics/excuses', title: 'Absence excuse review', body: 'Exact-session excuse requests with evidence, decisions and requests for information.', roles: ['reviewer'], icon: ClipboardList },
  { to: '/staff/campus/clubs', title: 'Club membership & events', body: 'Approve join requests and manage events for clubs you lead.', roles: ['club_lead'], icon: Users },
  { to: '/staff/campus/lost-found', title: 'Lost & found security desk', body: 'Recent requests, found items, mark found with a collection point, verify handover.', roles: ['security'], icon: Search },
  { to: '/staff/campus/resources', title: 'Resource moderation', body: 'Publish or reject uploaded notes and handle reports.', roles: ['reviewer', 'registrar'], icon: BookOpen },
  { to: '/staff/journey/admissions', title: 'Admission applications', body: 'Review submitted applications and record decisions (demo).', roles: ['admission_officer'], icon: FileCheck },
  { to: '/staff/journey/graduation', title: 'Graduation requests', body: 'Audit snapshots, clearances and decisions.', roles: ['registrar'], icon: GraduationCap }
];

function StaffIndex() {
  const { hasRole, user } = useSession();
  const { t } = useI18n();
  const mine = QUEUES.filter((q) => hasRole(...q.roles));
  return (
    <div>
      <PageHeader eyebrow={t('nav.staff')} title={t('nav.staff')} subtitle={user ? `${user.department ?? 'Queues available to your roles'} · server-enforced role checks` : ''} />
      {mine.length === 0 && <EmptyState icon={<ShieldCheck className="h-6 w-6" />} title="No staff queues for this persona" body="Switch to a reviewer, club lead, security or admissions persona from the demo control." />}
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        {mine.map((q) => (
          <Link key={q.to} to={q.to} className="card block p-5 transition hover:border-brand-400">
            <div className="mb-2 flex items-center gap-2 font-semibold"><q.icon className="h-5 w-5 text-brand-500" />{q.title}</div>
            <div className="text-sm text-muted">{q.body}</div>
          </Link>
        ))}
      </div>
      <Card className="mt-6 text-xs text-muted">Staff decisions are separate from portal submission status: a submitted request stays "submitted" until a reviewer records an outcome.</Card>
    </div>
  );
}

export function StaffRoutes() {
  return (
    <Routes>
      <Route index element={<StaffIndex />} />
      <Route path="academics/*" element={<AcademicsStaffRoutes />} />
      <Route path="campus/*" element={<CampusStaffRoutes />} />
      <Route path="career/*" element={<CareerStaffRoutes />} />
      <Route path="journey/*" element={<JourneyStaffRoutes />} />
    </Routes>
  );
}
