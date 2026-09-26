import { Link } from 'react-router';
import { CheckCircle2, Circle, Compass, ArrowRight, UserRound } from 'lucide-react';
import { motion } from 'motion/react';
import { PageHeader } from '@/components/ui/PageHeader';
import { Badge, Button, Callout, Card, EmptyState, ErrorState, KeyValue, Progress, SectionTitle, Skeleton } from '@/components/ui';
import { useToast } from '@/components/ui/toast';
import { useI18n } from '@/i18n';
import { api, errorMessage } from '@/lib/api';
import { refreshAll } from '@/lib/bus';
import { useQuery } from '@/lib/useQuery';
import { fmtDate } from '@/lib/format';
import type { Onboarding } from './types';

export function OnboardingPage() {
  const { t, l, locale } = useI18n();
  const toast = useToast();
  const q = useQuery(() => api<Onboarding>('/admission/onboarding'), [], { refreshOn: ['journey', 'persona'] });
  const complete = async (key: string) => {
    try { const r = await api<Onboarding>(`/admission/onboarding/${key}/complete`, { body: {} }); toast.success(t('journey.stepDone')); if (r.complete) toast.success(t('journey.onboardingComplete')); refreshAll('journey'); } catch (e) { toast.error(errorMessage(e)); }
  };
  return (
    <div>
      <PageHeader eyebrow={t('nav.journey')} title={t('journey.onboarding')} subtitle={t('journey.onboardingSubtitle')} actions={q.data?.complete && <Badge tone="success" dot>{t('journey.allDone')}</Badge>} />
      {!!q.error && <ErrorState error={q.error} onRetry={() => void q.refetch()} />}
      {q.loading && !q.data && <Skeleton className="h-64" />}
      {q.data && !q.data.exists && <EmptyState icon={<Compass className="h-6 w-6" />} title={t('journey.noOnboarding')} body={t('journey.noOnboardingBody')} action={<Link to="/journey/admission"><Button variant="outline">{t('journey.mod.admission')}</Button></Link>} />}
      {q.data?.exists && (
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-[1fr_340px]">
          <Card>
            <div className="mb-4 flex items-center justify-between text-sm"><span className="font-semibold">{q.data.done}/{q.data.total} {t('journey.stepsDone')}</span><span className="text-muted">{Math.round((q.data.done / Math.max(1, q.data.total)) * 100)}%</span></div>
            <Progress value={q.data.done} max={q.data.total} tone={q.data.complete ? 'success' : 'brand'} />
            <ol className="mt-5 space-y-2">
              {q.data.steps.map((s, i) => (
                <motion.li key={s.key} initial={{ opacity: 0, x: -8 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: i * 0.06 }} className="card-2 flex flex-wrap items-center gap-3 p-3">
                  {s.status === 'done' ? <CheckCircle2 className="h-5 w-5 shrink-0 text-success" /> : <Circle className="h-5 w-5 shrink-0 text-muted" />}
                  <div className="min-w-0 flex-1">
                    <div className="font-medium">{l(s.label_en, s.label_ar)}</div>
                    <div className="text-xs text-muted">{s.status === 'done' ? `${t('status.done')} · ${fmtDate(s.completed_at, locale)}` : t('status.pending')}</div>
                  </div>
                  <Link to={s.link} className="inline-flex items-center gap-1 text-xs text-brand-600 hover:underline">{t('common.open')}<ArrowRight className="h-3.5 w-3.5 rtl:rotate-180" /></Link>
                  {s.status !== 'done' && <Button size="sm" variant="outline" onClick={() => void complete(s.key)}>{t('journey.markDone')}</Button>}
                </motion.li>
              ))}
            </ol>
            {q.data.complete && <Callout tone="success" title={t('journey.allDone')}>{t('journey.allDoneBody')} <Link className="underline" to="/academics">{t('nav.academics')}</Link></Callout>}
          </Card>
          <Card>
            <SectionTitle><span className="inline-flex items-center gap-2"><UserRound className="h-4 w-4 text-brand-500" />{t('journey.adviser')}</span></SectionTitle>
            <KeyValue items={[{ k: t('journey.adviserName'), v: l(q.data.adviser.name_en, q.data.adviser.name_ar) }, { k: 'Email', v: q.data.adviser.email }, { k: t('journey.office'), v: q.data.adviser.office }]} />
            <p className="mt-3 text-xs text-muted">{t('journey.adviserNote')}</p>
          </Card>
        </div>
      )}
    </div>
  );
}
