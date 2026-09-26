import { Link } from 'react-router';
import { CheckCircle2, Circle, GraduationCap, ArrowRight } from 'lucide-react';
import { Badge, Button, Callout, Card, ErrorState, SectionTitle, Skeleton } from '@/components/ui';
import { useI18n } from '@/i18n';
import { api } from '@/lib/api';
import { useQuery } from '@/lib/useQuery';
import { MatchRing } from './ui';
import { oppTypeLabel, type Handoff as HandoffData } from './types';

/** Graduation → career handoff: readiness checklist, active applications and suggested graduate roles. */
export function HandoffPanel({ onClose }: { onClose?: () => void }) {
  const { t, l } = useI18n();
  const q = useQuery(() => api<HandoffData>('/career/handoff'), [], { refreshOn: ['career'] });
  if (q.error) return <ErrorState error={q.error} onRetry={() => void q.refetch()} />;
  if (!q.data) return <Skeleton className="h-40" />;
  const d = q.data;
  const done = d.checklist.filter((c) => c.done).length;
  return (
    <Card className="border-gold-500/50">
      <SectionTitle action={onClose && <Button size="sm" variant="ghost" onClick={onClose}>{t('common.close')}</Button>}><span className="inline-flex items-center gap-2"><GraduationCap className="h-4 w-4 text-gold-700" />{t('career.handoff')}</span></SectionTitle>
      {d.graduation && <Callout tone={d.graduation.status === 'approved' ? 'success' : 'info'} title={`${t('career.graduationStatus')}: ${t(`status.${d.graduation.status}`)}`}>{d.graduation.receipt?.ref ? `${t('career.receipt')} ${d.graduation.receipt.ref} · ` : ''}<Link to="/journey/graduation" className="underline">{t('career.openGraduation')}</Link></Callout>}
      <div className="mt-4 grid gap-5 md:grid-cols-3">
        <div>
          <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted">{t('career.readiness')} · {done}/{d.checklist.length}</div>
          <ul className="space-y-1.5 text-sm">
            {d.checklist.map((c) => (
              <li key={c.key} className="flex items-start gap-2">{c.done ? <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-success" /> : <Circle className="mt-0.5 h-4 w-4 shrink-0 text-muted" />}<Link to={c.link} className="hover:underline"><span className={c.done ? '' : 'font-medium'}>{l(c.label_en, c.label_ar)}</span>{c.detail && <span className="block text-xs text-muted">{c.detail}</span>}</Link></li>
            ))}
          </ul>
        </div>
        <div>
          <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted">{t('career.activeApplications')} · {d.applications.total}</div>
          <div className="mb-2 flex flex-wrap gap-1">{Object.entries(d.applications.byStatus).map(([s, n]) => <Badge key={s} tone="neutral">{t(`status.${s}`)} · {n}</Badge>)}</div>
          <ul className="space-y-1 text-sm">{d.applications.active.map((a) => <li key={a.id}><Link to={`/career/applications/${a.id}`} className="hover:underline">{a.company} – {a.title}</Link></li>)}{d.applications.active.length === 0 && <li className="text-xs text-muted">{t('career.noApplications')}</li>}</ul>
        </div>
        <div>
          <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted">{t('career.suggestedRoles')}</div>
          <ul className="space-y-2 text-sm">{d.suggested.map((o) => <li key={o.id} className="flex items-center gap-2"><MatchRing score={o.match?.score ?? 0} size={36} /><div className="min-w-0"><div className="truncate font-medium">{o.title}</div><div className="text-xs text-muted">{o.company} · {oppTypeLabel(t, o.type)}</div></div></li>)}</ul>
          <Link to="/career?tab=discover&type=entry" className="mt-2 inline-flex items-center gap-1 text-xs text-brand-600 hover:underline min-h-11">{t('career.browseEntry')}<ArrowRight className="h-3.5 w-3.5 rtl:rotate-180" /></Link>
        </div>
      </div>
    </Card>
  );
}
