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
      <PageHeader eyebrow={t('nav.approvals')} title={t('nav.approvals')} subtitle="Every consequential action is bound to an exact payload revision you approved. Approvals expire and are invalidated when the proposal changes." />
      {q.data && q.data.length === 0 && <EmptyState icon={<ShieldCheck className="h-6 w-6" />} title={t('common.empty')} body="Approve a course plan, an excuse request or a graduation request to see records here." />}
      <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
        {q.data?.map((a) => (
          <Card key={a.id}>
            <div className="mb-2 flex items-center justify-between gap-2">
              <Link to={linkFor[a.kind]?.(a.entity_id) ?? '#'} className="inline-flex items-center touch:min-h-11 font-semibold capitalize hover:text-brand-600">{a.kind.replace('_', ' ')} · {a.entity_id}</Link>
              <StatusPill status={a.status} />
            </div>
            <KeyValue items={[{ k: 'Revision', v: `r${a.revision}` }, { k: 'Payload hash', v: <span className="font-mono text-xs">{a.payload_hash.slice(0, 16)}…</span> }, { k: 'Idempotency key', v: <span className="font-mono text-xs">{a.idempotency_key}</span> }, { k: 'Expires', v: fmtDateTime(a.expires_at, locale) }, { k: 'Created', v: fmtDateTime(a.created_at, locale) }]} />
          </Card>
        ))}
      </div>
    </div>
  );
}
