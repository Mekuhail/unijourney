import { useState } from 'react';
import { Link } from 'react-router';
import { GraduationCap, CheckCircle2, Circle, Briefcase, FlaskConical, AlertTriangle, ShieldCheck } from 'lucide-react';
import clsx from 'clsx';
import { PageHeader } from '@/components/ui/PageHeader';
import { Badge, Button, Callout, Card, CopyId, ErrorState, Progress, SectionTitle, Skeleton, StatusPill, ButtonLink } from '@/components/ui';
import { useToast } from '@/components/ui/toast';
import { useI18n } from '@/i18n';
import { ApiError, api, errorMessage } from '@/lib/api';
import { refreshAll } from '@/lib/bus';
import { useQuery } from '@/lib/useQuery';
import { fmtDateTime } from '@/lib/format';
import type { AuditRes } from './types';

const COURSE_TONE: Record<string, string> = { completed: 'border-success/40 bg-success/10 text-success', equivalent: 'border-gold-500/50 bg-gold-100/60 text-gold-700 dark:bg-gold-700/20 dark:text-gold-300', enrolled: 'border-brand-400/50 bg-brand-500/10 text-brand-700 dark:text-brand-200', planned: 'border-line bg-surface-2 text-muted', missing: 'border-dashed border-warn/60 bg-warn/10 text-warn', failed: 'border-danger/40 bg-danger/10 text-danger', withdrawn: 'border-line bg-surface-2 text-muted line-through' };

export function GraduationPage() {
  const { t, l, locale } = useI18n();
  const toast = useToast();
  const q = useQuery(() => api<AuditRes>('/graduation/audit'), [], { refreshOn: ['journey', 'persona'] });
  const [busy, setBusy] = useState<string | null>(null);
  const [blocked, setBlocked] = useState<string[] | null>(null);
  const run = async (key: string, fn: () => Promise<void>) => { setBusy(key); setBlocked(null); try { await fn(); refreshAll('journey'); } catch (e) { if (e instanceof ApiError && e.status === 422 && e.details && typeof e.details === 'object' && 'reasons' in (e.details as object)) setBlocked((e.details as { reasons: string[] }).reasons); else toast.error(errorMessage(e)); } finally { setBusy(null); } };
  const d = q.data;
  return (
    <div>
      <PageHeader crumbs={[{ to: '/journey', label: t('nav.journey') }]} title={t('journey.graduation')} subtitle={t('journey.graduationSubtitle')} actions={d && <Button disabled={!d.canRequest || !!d.request && ['submitted', 'under_review', 'approved'].includes(d.request.status)} loading={busy === 'request'} icon={<GraduationCap className="h-4 w-4" />} onClick={() => void run('request', async () => { const r = await api<{ receipt: { ref: string } }>('/graduation/requests', { body: {} }); toast.success(t('journey.requestSubmitted'), r.receipt.ref); })}>{t('journey.requestGraduation')}</Button>} />
      {!!q.error && <ErrorState error={q.error} onRetry={() => void q.refetch()} />}
      {q.loading && !d && <div className="space-y-3"><Skeleton className="h-28" /><Skeleton className="h-64" /></div>}
      {d && (
        <div className="space-y-6">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-4">
            {[{ k: 'earned', v: d.audit.earned, tone: 'text-success' }, { k: 'inProgress', v: d.audit.in_progress, tone: 'text-brand-600' }, { k: 'planned', v: d.audit.planned, tone: 'text-muted' }, { k: 'remaining', v: d.audit.remaining, tone: d.audit.remaining ? 'text-warn' : 'text-success' }].map((s, i) => (
              <div key={s.k} className="card p-4">
                <div className="text-xs font-semibold text-muted">{t(`journey.stat.${s.k}`)}</div>
                <div className={clsx('num mt-1 text-3xl font-bold', s.tone)}>{s.v}<span className="ms-1 text-sm font-medium text-muted">/ {d.audit.total_required}</span></div>
              </div>
            ))}
          </div>
          <Card>
            <div className="mb-2 flex items-center justify-between text-sm"><span className="font-semibold">{t('journey.overall')}</span><span className="num text-muted">{Math.round((d.audit.earned / Math.max(1, d.audit.total_required)) * 100)}%</span></div>
            <Progress label={t('journey.overall')} value={d.audit.earned} max={d.audit.total_required} tone={d.audit.remaining === 0 ? 'success' : 'brand'} />
            <p className="mt-2 text-xs text-muted">{d.policy_note}</p>
          </Card>

          {blocked && <Callout tone="danger" title={t('journey.requestBlocked')}><ul className="list-disc ps-5">{blocked.map((r) => <li key={r}>{r}</li>)}</ul></Callout>}
          {!d.canRequest && !blocked && d.blockers.length > 0 && !(d.request && ['submitted', 'under_review', 'approved'].includes(d.request.status)) && <Callout tone="warn" title={t('journey.blockers', { n: d.blockers.length })}><ul className="list-disc ps-5">{d.blockers.map((b) => <li key={b.key}>{b.message}</li>)}</ul></Callout>}
          {d.request && (
            <Card className={clsx(d.request.status === 'approved' && 'border-success/50')}>
              <SectionTitle>{t('journey.requestStatus')} <StatusPill status={d.request.status} className="ms-2" /></SectionTitle>
              <div className="flex flex-wrap items-center gap-3">{d.request.receipt && <><CopyId value={d.request.receipt.ref} /><Badge tone="gold">{d.request.receipt.label}</Badge></>}<span className="text-sm text-muted">{fmtDateTime(d.request.submitted_at, locale)}</span></div>
              {d.request.reviewer_note && <p className="mt-2 text-sm">{t('journey.registrarNote')}: {d.request.reviewer_note}</p>}
              {d.request.status === 'approved' && <div className="mt-3"><ButtonLink to="/career?handoff=1" variant="gold" icon={<Briefcase className="h-4 w-4" />}>{t('journey.openHandoff')}</ButtonLink></div>}
            </Card>
          )}

          <div className="grid grid-cols-1 gap-6 lg:grid-cols-[1fr_340px]">
            <div className="space-y-4">
              {d.audit.buckets.length === 0 && <Callout tone="warn" title={t('journey.noRequirements')}>{t('journey.noRequirementsBody')}</Callout>}
              {d.audit.buckets.map((b) => (
                <Card key={b.id}>
                  <div className="mb-2 flex flex-wrap items-center justify-between gap-2"><div className="font-semibold">{l(b.label_en, b.label_ar)}</div><div className="num text-sm text-muted">{b.earned_credits}/{b.required_credits} {t('common.credits')}{b.in_progress_credits ? ` · +${b.in_progress_credits} ${t('status.enrolled').toLowerCase()}` : ''}{b.remaining_credits ? <span className="ms-2 text-warn">· {b.remaining_credits} {t('journey.stat.remaining').toLowerCase()}</span> : <CheckCircle2 className="ms-2 inline h-4 w-4 text-success" />}</div></div>
                  <Progress label={l(b.label_en, b.label_ar)} value={b.earned_credits} max={b.required_credits} tone={b.remaining_credits === 0 ? 'success' : 'brand'} />
                  <div className="mt-3 flex flex-wrap gap-1.5">{b.courses.map((c) => <span key={c.code} title={`${c.title_en}${c.term ? ` · ${c.term}` : ''}${c.grade ? ` · ${c.grade}` : ''}`} className={clsx('inline-flex items-center gap-1 rounded-lg border px-2 py-0.5 text-xs font-medium', COURSE_TONE[c.status])}>{c.code}<span className="opacity-70">{c.credits}</span></span>)}</div>
                </Card>
              ))}
              {d.audit.unmet.length > 0 && <Card><SectionTitle>{t('journey.unmet')}</SectionTitle><ul className="space-y-1 text-sm">{d.audit.unmet.map((u) => <li key={u.bucket} className="flex flex-wrap items-center gap-2"><AlertTriangle className="h-4 w-4 text-warn" /><span className="font-medium">{u.bucket}</span><span className="text-muted">{u.remaining_credits} {t('common.credits')}</span>{u.suggestions.length > 0 && <span className="text-xs text-muted">{t('journey.suggested')}: {u.suggestions.join(', ')}</span>}</li>)}</ul></Card>}
              <div className="flex flex-wrap gap-2 text-xs text-muted">{Object.keys(COURSE_TONE).map((k) => <span key={k} className={clsx('rounded-lg border px-2 py-0.5', COURSE_TONE[k])}>{t(`status.${k}`)}</span>)}</div>
            </div>
            <div className="space-y-4">
              <Card>
                <SectionTitle><span className="inline-flex items-center gap-2"><ShieldCheck className="h-4 w-4 text-brand-500" />{t('journey.clearances')}</span></SectionTitle>
                <ul className="space-y-2 text-sm">{d.clearances.map((c) => <li key={c.key} className="flex items-start gap-2">{c.status === 'cleared' ? <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-success" /> : <Circle className="mt-0.5 h-4 w-4 shrink-0 text-warn" />}<div><div className={clsx(c.status !== 'cleared' && 'font-medium')}>{l(c.label_en, c.label_ar)}</div><div className="text-xs text-muted">{t(`status.${c.status}`)}{c.note ? ` · ${c.note}` : ''}</div></div></li>)}</ul>
              </Card>
              <Card>
                <SectionTitle>{t('journey.coop')}</SectionTitle>
                <div className="flex items-center gap-3"><div className={clsx('grid h-10 w-10 place-items-center rounded-xl', d.coop.counts ? 'bg-success/15 text-success' : 'bg-warn/15 text-warn')}><Briefcase className="h-5 w-5" /></div><div className="text-sm"><div className="font-semibold">{d.coop.code} · {d.coop.title_en}</div><div className="text-xs text-muted"><StatusPill status={d.coop.status === 'missing' ? 'pending' : d.coop.status} /> {d.coop.term_label ?? ''} {d.coop.evidence ? `· ${d.coop.evidence}` : ''}</div></div></div>
                <Link to="/career?tab=tracker" className="inline-flex min-h-11 items-center mt-2 text-xs text-brand-600 hover:underline">{t('journey.coopLink')}</Link>
              </Card>
              {d.audit.estimate && <Callout tone="info" title={t('journey.estimate', { n: d.audit.estimate.terms_remaining, term: d.audit.estimate.earliest_completion_term })}>{d.audit.estimate.assumptions}</Callout>}
              {d.audit.remaining === 0 && <Callout tone="success" title={t('journey.allMet')}>{t('journey.allMetBody')}</Callout>}
              {d.demoMode && (d.audit.remaining > 0 || d.clearances.some((c) => c.status !== 'cleared')) && (
                <Card className="border-dashed border-gold-500/60">
                  <SectionTitle><span className="inline-flex items-center gap-2"><FlaskConical className="h-4 w-4 text-gold-700" />{t('journey.demoFixture')}</span></SectionTitle>
                  <p className="mb-3 text-xs text-muted">{t('journey.demoFixtureBody')}</p>
                  <div className="flex flex-wrap gap-2">
                    {d.audit.in_progress > 0 && <Button size="sm" variant="outline" loading={busy === 'post'} onClick={() => void run('post', async () => { const r = await api<{ courses: string[] }>('/graduation/demo/post-term-results', { body: {} }); toast.success(t('journey.postedResults', { n: r.courses.length })); })}>{t('journey.postResults')}</Button>}
                    {d.audit.remaining > 0 && <Button size="sm" variant="gold" loading={busy === 'fulfil'} onClick={() => void run('fulfil', async () => { const r = await api<{ course: string; evidence: string }>('/graduation/demo/fulfil-requirement', { body: {} }); toast.success(t('journey.fulfilled', { course: r.course }), r.evidence); })}>{t('journey.fulfilRequirement')}</Button>}
                    {d.clearances.some((c) => c.status !== 'cleared') && <Button size="sm" variant="outline" loading={busy === 'clear'} onClick={() => void run('clear', async () => { await api('/graduation/demo/clear-clearances', { body: {} }); toast.success(t('journey.clearancesCleared')); })}>{t('journey.clearClearances')}</Button>}
                  </div>
                </Card>
              )}
              <Card>
                <SectionTitle>{t('journey.handoffTitle')}</SectionTitle>
                <p className="text-sm text-muted">{t('journey.handoffBody')}</p>
                <ButtonLink to="/career?handoff=1" className="mt-2" size="sm" variant="outline" icon={<Briefcase className="h-4 w-4" />}>{t('journey.openHandoff')}</ButtonLink>
              </Card>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
