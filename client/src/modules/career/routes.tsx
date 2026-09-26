import { Route, Routes, useSearchParams } from 'react-router';
import { Compass, KanbanSquare, Inbox as InboxIcon, UserRound } from 'lucide-react';
import { PageHeader } from '@/components/ui/PageHeader';
import { Badge, Tabs } from '@/components/ui';
import { useI18n } from '@/i18n';
import { useSession } from '@/lib/session';
import { Discover } from './Discover';
import { Tracker } from './Tracker';
import { Inbox } from './Inbox';
import { Profile } from './Profile';
import { HandoffPanel } from './Handoff';
import { ApplicationPage } from './ApplicationPage';

type Tab = 'discover' | 'tracker' | 'inbox' | 'profile';

function CareerHub() {
  const { t } = useI18n();
  const { user } = useSession();
  const [params, setParams] = useSearchParams();
  const tab = (params.get('tab') as Tab) || 'discover';
  const handoff = params.get('handoff') === '1' || user?.stage === 'graduating' || user?.stage === 'alumni';
  const setTab = (v: Tab) => { const p = new URLSearchParams(params); p.set('tab', v); setParams(p, { replace: true }); };
  return (
    <div>
      <PageHeader eyebrow={t('nav.career')} title={t('career.title')} subtitle={t('career.subtitle')} actions={<Badge tone="gold">{t('career.demoFeedLabel')}</Badge>} />
      {handoff && <div className="mb-6"><HandoffPanel onClose={params.get('handoff') === '1' ? () => { const p = new URLSearchParams(params); p.delete('handoff'); setParams(p, { replace: true }); } : undefined} /></div>}
      <Tabs className="mb-5 w-fit max-w-full" value={tab} onChange={setTab} items={[
        { value: 'discover', label: t('career.tab.discover'), icon: <Compass className="h-4 w-4" /> },
        { value: 'tracker', label: t('career.tab.tracker'), icon: <KanbanSquare className="h-4 w-4" /> },
        { value: 'inbox', label: t('career.tab.inbox'), icon: <InboxIcon className="h-4 w-4" /> },
        { value: 'profile', label: t('career.tab.profile'), icon: <UserRound className="h-4 w-4" /> }
      ]} />
      {tab === 'discover' && <Discover />}
      {tab === 'tracker' && <Tracker />}
      {tab === 'inbox' && <Inbox />}
      {tab === 'profile' && <Profile />}
    </div>
  );
}

export function CareerRoutes() {
  return (
    <Routes>
      <Route index element={<CareerHub />} />
      <Route path="applications/:id" element={<ApplicationPage />} />
      <Route path="*" element={<CareerHub />} />
    </Routes>
  );
}
