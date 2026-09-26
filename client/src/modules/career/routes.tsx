import { Route, Routes, useSearchParams } from 'react-router';
import { Compass, KanbanSquare, UserRound, Trophy } from 'lucide-react';
import { PageHeader } from '@/components/ui/PageHeader';
import { Tabs } from '@/components/ui';
import { useI18n } from '@/i18n';
import { useSession } from '@/lib/session';
import { Discover } from './Discover';
import { Tracker } from './Tracker';
import { Inbox } from './Inbox';
import { Portfolio } from './Portfolio';
import { Competitions } from './Competitions';
import { HandoffPanel } from './Handoff';
import { ApplicationPage } from './ApplicationPage';

type Tab = 'discover' | 'competitions' | 'tracker' | 'inbox' | 'profile';
type Top = 'discover' | 'competitions' | 'applications' | 'profile';

/** Four homes: the job market, university competitions, the student's own applications (tracker + hiring inbox), and the portfolio. */
function CareerHub() {
  const { t } = useI18n();
  const { user } = useSession();
  const [params, setParams] = useSearchParams();
  const tab = (params.get('tab') as Tab) || 'discover';
  const top: Top = tab === 'tracker' || tab === 'inbox' ? 'applications' : tab;
  const handoff = params.get('handoff') === '1' || user?.stage === 'graduating' || user?.stage === 'alumni';
  const setTab = (v: Tab) => { const p = new URLSearchParams(params); p.set('tab', v); p.delete('id'); setParams(p, { replace: true }); };
  return (
    <div>
      <PageHeader title={t('career.title')} subtitle={t('career.subtitle')} />
      {handoff && <div className="mb-6"><HandoffPanel onClose={params.get('handoff') === '1' ? () => { const p = new URLSearchParams(params); p.delete('handoff'); setParams(p, { replace: true }); } : undefined} /></div>}
      <Tabs label={t('career.title')} className="mb-5 w-fit max-w-full" value={top} onChange={(v) => setTab(v === 'applications' ? 'tracker' : v)} items={[
        { value: 'discover', label: t('career.tab.opportunities'), icon: <Compass className="h-4 w-4" /> },
        { value: 'competitions', label: t('career.tab.competitions'), icon: <Trophy className="h-4 w-4" /> },
        { value: 'applications', label: t('career.tab.applications'), icon: <KanbanSquare className="h-4 w-4" /> },
        { value: 'profile', label: t('career.tab.portfolio'), icon: <UserRound className="h-4 w-4" /> }
      ]} />
      {top === 'discover' && <Discover />}
      {top === 'competitions' && <Competitions />}
      {top === 'applications' && (
        <div className="space-y-4">
          <Tabs label={t('career.tab.applications')} className="w-fit max-w-full" value={tab as 'tracker' | 'inbox'} onChange={setTab} items={[
            { value: 'tracker', label: t('career.tab.tracker') },
            { value: 'inbox', label: t('career.tab.inbox') }
          ]} />
          {tab === 'tracker' ? <Tracker /> : <Inbox />}
        </div>
      )}
      {top === 'profile' && <Portfolio />}
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
