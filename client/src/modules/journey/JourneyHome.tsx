import { Link } from 'react-router';
import { motion } from 'motion/react';
import { FileText, BadgeCheck, Compass, GraduationCap, Briefcase, School, ArrowRight, type LucideIcon } from 'lucide-react';
import clsx from 'clsx';
import { PageHeader } from '@/components/ui/PageHeader';
import { Badge, Callout, Card, SectionTitle, StatusPill } from '@/components/ui';
import { useI18n } from '@/i18n';
import { useSession } from '@/lib/session';
import { useTheme } from '@/lib/theme';
import { api } from '@/lib/api';
import { useQuery } from '@/lib/useQuery';
import { STAGES, type AdmApp, type AuditRes, type Onboarding } from './types';

const STAGE_META: Record<(typeof STAGES)[number], { icon: LucideIcon; to: string }> = {
  applicant: { icon: FileText, to: '/journey/admission' }, admitted: { icon: BadgeCheck, to: '/journey/admission' }, orientation: { icon: Compass, to: '/journey/onboarding' }, current: { icon: School, to: '/academics' }, graduating: { icon: GraduationCap, to: '/journey/graduation' }, alumni: { icon: Briefcase, to: '/career?handoff=1' }
};

export function JourneyHome() {
  const { t, l } = useI18n();
  const { user } = useSession();
  const { reducedMotion } = useTheme();
  const stage = user?.stage ?? 'current';
  const idx = STAGES.indexOf(stage as never);
  const isApplicantish = stage === 'applicant' || stage === 'admitted';
  const adm = useQuery(() => api<{ active: AdmApp | null }>('/admission/applications/mine'), [user?.id], { enabled: isApplicantish || stage === 'orientation' });
  const ob = useQuery(() => api<Onboarding>('/admission/onboarding'), [user?.id], { enabled: stage === 'orientation' || stage === 'current' });
  const grad = useQuery(() => api<AuditRes>('/graduation/audit'), [user?.id], { enabled: stage === 'graduating' || stage === 'current' || stage === 'alumni' });
  const apps = useQuery(() => api<{ items: Array<{ status: string }> }>('/career/applications'), [user?.id], { enabled: stage === 'current' || stage === 'graduating' || stage === 'alumni' });

  const actions: Array<{ to: string; title: string; body: string }> = [];
  if (stage === 'applicant') actions.push({ to: '/journey/admission', title: adm.data?.active ? t('journey.act.continueApplication') : t('journey.act.startApplication'), body: adm.data?.active ? `${t('common.status')}: ${t(`status.${adm.data.active.status}`)} · ${adm.data.active.completeness.missing.length} ${t('journey.missingItems')}` : t('journey.act.startApplicationBody') });
  if (stage === 'admitted') actions.push({ to: '/journey/admission', title: t('journey.act.acceptOffer'), body: t('journey.act.acceptOfferBody') });
  if (stage === 'orientation') actions.push({ to: '/journey/onboarding', title: t('journey.act.onboarding'), body: ob.data ? `${ob.data.done}/${ob.data.total} ${t('journey.stepsDone')}` : '' });
  if (stage === 'current') { actions.push({ to: '/academics', title: t('journey.act.academics'), body: t('journey.act.academicsBody') }); actions.push({ to: '/career', title: t('journey.act.career'), body: apps.data ? t('journey.act.careerBody', { n: apps.data.items.length }) : '' }); if (grad.data) actions.push({ to: '/journey/graduation', title: t('journey.act.audit'), body: t('journey.act.auditBody', { earned: grad.data.audit.earned, total: grad.data.audit.total_required }) }); }
  if (stage === 'graduating') { actions.push({ to: '/journey/graduation', title: t('journey.act.graduation'), body: grad.data ? (grad.data.canRequest ? t('journey.act.graduationReady') : t('journey.act.graduationBlocked', { n: grad.data.blockers.length })) : '' }); actions.push({ to: '/career?handoff=1', title: t('journey.act.handoff'), body: t('journey.act.handoffBody') }); }
  if (stage === 'alumni') actions.push({ to: '/career?handoff=1', title: t('journey.act.handoff'), body: t('journey.act.handoffBody') });
  if (stage === 'staff') actions.push({ to: '/staff', title: t('nav.staff'), body: t('journey.staffBody') });

  return (
    <div>
      <PageHeader eyebrow={t('nav.journey')} title={t('journey.title')} subtitle={user ? t('journey.subtitle', { name: l(user.name_en, user.name_ar).split(' ')[0] }) : ''} actions={user && <Badge tone="brand">{t(`journey.stage.${stage}`)}</Badge>} />
      <Card className="overflow-hidden">
        <SectionTitle>{t('journey.timeline')}</SectionTitle>
        <ol className="relative grid gap-3 md:grid-cols-6">
          <div className="absolute inset-x-6 top-7 hidden h-1 rounded bg-line md:block" aria-hidden>
            <motion.div className="h-full rounded bg-gradient-to-r from-brand-500 to-gold-500" initial={{ width: 0 }} animate={{ width: idx < 0 ? '0%' : `${(idx / (STAGES.length - 1)) * 100}%` }} transition={{ duration: reducedMotion ? 0 : 1.1, ease: 'easeOut' }} />
          </div>
          {STAGES.map((s, i) => {
            const meta = STAGE_META[s];
            const state = idx < 0 ? 'none' : i < idx ? 'done' : i === idx ? 'current' : 'next';
            return (
              <motion.li key={s} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: reducedMotion ? 0 : i * 0.08 }} className="relative">
                <Link to={meta.to} className={clsx('group flex flex-col items-center gap-2 rounded-2xl p-3 text-center transition hover:bg-surface-2', state === 'current' && 'bg-brand-500/5 ring-1 ring-brand-500/40')}>
                  <span className={clsx('relative grid h-9 w-9 place-items-center rounded-full border-2 bg-surface transition', state === 'done' && 'border-success text-success', state === 'current' && 'border-brand-500 text-brand-600 shadow-[0_0_0_6px_rgba(240,118,43,0.15)]', (state === 'next' || state === 'none') && 'border-line text-muted')}><meta.icon className="h-4 w-4" />{state === 'current' && !reducedMotion && <motion.span className="absolute inset-0 rounded-full border-2 border-brand-500" animate={{ scale: [1, 1.5], opacity: [0.7, 0] }} transition={{ repeat: Infinity, duration: 1.8 }} />}</span>
                  <span className={clsx('text-sm font-semibold', state === 'current' ? 'text-fg' : 'text-muted')}>{t(`journey.stage.${s}`)}</span>
                  <span className="text-[11px] text-muted">{t(`journey.stageBody.${s}`)}</span>
                  {state === 'current' && <Badge tone="brand" dot>{t('journey.youAreHere')}</Badge>}
                </Link>
              </motion.li>
            );
          })}
        </ol>
      </Card>
      <div className="mt-6 grid gap-6 lg:grid-cols-[1fr_360px]">
        <div>
          <SectionTitle>{t('journey.nextActions')}</SectionTitle>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            {actions.map((a) => (
              <Link key={a.to + a.title} to={a.to} className="card group flex items-start justify-between gap-3 p-4 transition hover:border-brand-400">
                <div><div className="font-semibold">{a.title}</div><div className="mt-0.5 text-sm text-muted">{a.body}</div></div>
                <ArrowRight className="mt-1 h-4 w-4 shrink-0 text-muted transition group-hover:translate-x-0.5 group-hover:text-brand-500 rtl:rotate-180" />
              </Link>
            ))}
          </div>
          {stage === 'applicant' && adm.data?.active && <div className="mt-4"><Callout tone="info" title={`${t('journey.applicationStatus')}: `}><span className="inline-flex items-center gap-2"><StatusPill status={adm.data.active.status} />{adm.data.active.program ? l(adm.data.active.program.name_en, adm.data.active.program.name_ar) : ''}</span></Callout></div>}
        </div>
        <Card>
          <SectionTitle>{t('journey.modules')}</SectionTitle>
          <ul className="space-y-2 text-sm">
            {[{ to: '/journey/admission', k: 'journey.mod.admission' }, { to: '/journey/onboarding', k: 'journey.mod.onboarding' }, { to: '/academics', k: 'journey.mod.academics' }, { to: '/campus', k: 'journey.mod.campus' }, { to: '/career', k: 'journey.mod.career' }, { to: '/journey/graduation', k: 'journey.mod.graduation' }].map((m) => (
              <li key={m.to}><Link to={m.to} className="flex items-center justify-between rounded-xl px-3 py-2 hover:bg-surface-2"><span>{t(m.k)}</span><ArrowRight className="h-4 w-4 text-muted rtl:rotate-180" /></Link></li>
            ))}
          </ul>
          <p className="mt-3 text-xs text-muted">{t('journey.demoNote')}</p>
        </Card>
      </div>
    </div>
  );
}
