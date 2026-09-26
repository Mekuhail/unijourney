import { useI18n } from '@/i18n';
import { useQuery } from '@/lib/useQuery';
import { api } from '@/lib/api';
import type { Approval } from '@shared/types';
import { PageHeader } from '@/components/ui/PageHeader';
import { EmptyState, StatusPill, Card, KeyValue } from '@/components/ui';
import { fmtDateTime } from '@/lib/format';
import { ShieldCheck } from 'lucide-react';
import { Link } from 'react-router';

const linkFor: Record<string, (id: string) => string> = {
  enrollment: (id) => `/academics/register?proposal=${id}`,
  excuse: (id) => `/academics/excuses/${id}`,
  study_plan: () => '/academics/study',
  graduation: () => '/journey/graduation',
  admission: () => '/journey/admission'
};

export function ApprovalsPage() {
  const { t, locale } = useI18n();
  const q = useQuery(() => api<Approval[]>('/approvals'));
  return (
    <div>
      <PageHeader title={t('nav.approvals')} subtitle={t('approvals.subtitle')} />
      {q.data && q.data.length === 0 && <EmptyState icon={<ShieldCheck className="h-6 w-6" />} title={t('common.empty')} body={t('approvals.empty')} />}
      <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
        {q.data?.map((a) => (
          <Card key={a.id}>
            <div className="mb-2 flex items-center justify-between gap-2">
              <Link to={linkFor[a.kind]?.(a.entity_id) ?? '#'} className="inline-flex items-center touch:min-h-11 font-semibold hover:text-brand-600">{t(`approval.kind.${a.kind}`)}</Link>
              <StatusPill status={a.status} />
            </div>
            <KeyValue items={[{ k: t('approvals.revision'), v: `r${a.revision}` }, { k: t('approvals.hash'), v: <span className="font-mono text-xs">{a.payload_hash.slice(0, 16)}…</span> }, { k: t('approvals.key'), v: <span className="font-mono text-xs">{a.idempotency_key}</span> }, { k: t('approvals.expires'), v: fmtDateTime(a.expires_at, locale) }, { k: t('approvals.created'), v: fmtDateTime(a.created_at, locale) }]} />
          </Card>
        ))}
      </div>
    </div>
  );
}
