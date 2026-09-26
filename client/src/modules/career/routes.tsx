import { Navigate, Route, Routes, useSearchParams } from 'react-router';
import { Compass, KanbanSquare } from 'lucide-react';
import { PageHeader } from '@/components/ui/PageHeader';
import { Tabs } from '@/components/ui';
import { useI18n } from '@/i18n';
import { useSession } from '@/lib/session';
import { Discover } from './Discover';
import { Tracker } from './Tracker';
import { Inbox } from './Inbox';
import { HandoffPanel } from './Handoff';
import { ApplicationPage } from './ApplicationPage';

type Tab = 'discover' | 'tracker' | 'inbox';

/**
 * Career: the job market (co-op, internships, graduate roles, research) and the student's own applications.
 * Competitions and the portfolio have their own pages; old tab links redirect there.
 */
function CareerHub() {
  const { t } = useI18n();
  const { user } = useSession();
  const [params, setParams] = useSearchParams();
  const raw = params.get('tab');
  if (raw === 'profile') return <Navigate to="/portfolio" replace />;
  if (raw === 'competitions') return <Navigate to={`/competitions${params.get('id') ? `?id=${encodeURIComponent(params.get('id')!)}` : ''}`} replace />;
  const tab = (raw as Tab) || 'discover';
  const top = tab === 'tracker' || tab === 'inbox' ? 'applications' : 'discover';
  const handoff = params.get('handoff') === '1' || user?.stage === 'graduating' || user?.stage === 'alumni';
  const setTab = (v: Tab) => { const p = new URLSearchParams(params); p.set('tab', v); p.delete('open'); setParams(p, { replace: true }); };
  return (
    <div>
      <PageHeader title={t('career.title')} subtitle={t('career.subtitle')} />
      {handoff && <div className="mb-6"><HandoffPanel onClose={params.get('handoff') === '1' ? () => { const p = new URLSearchParams(params); p.delete('handoff'); setParams(p, { replace: true }); } : undefined} /></div>}
      <Tabs label={t('career.title')} className="mb-5 w-fit max-w-full" value={top} onChange={(v) => setTab(v === 'applications' ? 'tracker' : 'discover')} items={[
        { value: 'discover', label: t('career.tab.opportunities'), icon: <Compass className="h-4 w-4" /> },
        { value: 'applications', label: t('career.tab.applications'), icon: <KanbanSquare className="h-4 w-4" /> }
      ]} />
      {top === 'discover' && <Discover />}
      {top === 'applications' && (
        <div className="space-y-4">
          <Tabs label={t('career.tab.applications')} className="w-fit max-w-full" value={tab as 'tracker' | 'inbox'} onChange={setTab} items={[
            { value: 'tracker', label: t('career.tab.tracker') },
            { value: 'inbox', label: t('career.tab.inbox') }
          ]} />
          {tab === 'tracker' ? <Tracker /> : <Inbox />}
        </div>
      )}
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
