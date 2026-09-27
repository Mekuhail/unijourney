import { useState } from 'react';
import { Link } from 'react-router';
import { ShieldOff } from 'lucide-react';
import { useI18n } from '@/i18n';
import { useSession } from '@/lib/session';
import { usePageTitle } from '@/lib/usePageTitle';
import { Button } from '@/components/ui';
import { capabilityForPath, landingFor, ROLE_CAPABILITIES } from '@shared/access';
import { PersonaSwitcher } from './PersonaSwitcher';

/** Shown in place of a page the current role cannot use (the server refuses the same data). */
export function NoAccess({ path }: { path: string }) {
  const { t } = useI18n();
  const { user, demoMode } = useSession();
  const [switching, setSwitching] = useState(false);
  usePageTitle(t('access.title'));
  const cap = capabilityForPath(path);
  const forStudents = !!cap && ROLE_CAPABILITIES.student.includes(cap);
  const role = user?.roles[0] ?? 'student';
  return (
    <div className="mx-auto max-w-lg py-16 text-center">
      <ShieldOff className="mx-auto h-8 w-8 text-muted" aria-hidden />
      <h1 tabIndex={-1} className="mt-4 text-2xl font-bold tracking-tight">{t('access.title')}</h1>
      <p className="mt-2 text-muted">{t('access.body', { who: t(forStudents ? 'access.who.student' : 'access.who.staff'), role: t(`role.${role}`) })}</p>
      <div className="mt-6 flex flex-wrap justify-center gap-2">
        <Link to={landingFor(user?.roles)} className="inline-flex h-11 items-center rounded-xl bg-brand-500 px-4 text-sm font-semibold text-ink-950 hover:bg-brand-400">{t('access.home')}</Link>
        {demoMode && <Button variant="outline" onClick={() => setSwitching(true)}>{t('access.switch')}</Button>}
      </div>
      <PersonaSwitcher open={switching} onClose={() => setSwitching(false)} />
    </div>
  );
}
