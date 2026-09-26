import { QRCodeSVG } from 'qrcode.react';
import { ShieldCheck, Users, Award } from 'lucide-react';
import { useI18n } from '@/i18n';
import { useQuery } from '@/lib/useQuery';
import { api } from '@/lib/api';
import { useTheme } from '@/lib/theme';
import { Link } from 'react-router';
import { PageHeader } from '@/components/ui/PageHeader';
import { Avatar, Badge, Callout, Card, EmptyState, ErrorState, KeyValue, SectionTitle, Skeleton } from '@/components/ui';
import TiltedCard from '@/components/reactbits/TiltedCard';
import GlareHover from '@/components/reactbits/GlareHover';
import { fmtDate } from '@/lib/format';
import type { CardData } from '../types';

function CardFace({ d }: { d: CardData }) {
  const { t, l, locale } = useI18n();
  return (
    <div className="flex h-full w-full flex-col justify-between rounded-3xl bg-[linear-gradient(135deg,#1e1b18,#2a2622_55%,#3a2a1a)] p-5 text-white shadow-xl">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="text-[10px] font-semibold uppercase tracking-[0.2em] text-gold-300">Al Yamamah University · UniJourney</div>
          <div className="mt-2 text-lg font-bold leading-tight">{l(d.user.name_en, d.user.name_ar)}</div>
          <div className="text-xs text-white/70">{d.program ? l(d.program.name_en, d.program.name_ar) : d.user.stage} · {d.campus ? l(d.campus.name_en, d.campus.name_ar).replace(/.*– /, '') : ''}</div>
        </div>
        <Avatar name={d.user.name_en} color={d.user.avatar_color} size={44} className="ring-2 ring-gold-300/60" />
      </div>
      <div className="flex items-end justify-between gap-3">
        <div className="text-xs">
          <div className="text-white/60">{t('campus.card.studentNo')}</div>
          <div className="num text-base font-semibold tracking-wider">{d.user.student_no ?? '—'}</div>
          <div className="mt-2 flex flex-wrap gap-1">{d.memberships.slice(0, 3).map((m) => <span key={m.club_id} className="rounded-full px-2 py-0.5 text-[10px] font-semibold" style={{ background: m.color }}>{l(m.name_en, m.name_ar)}</span>)}</div>
        </div>
        <div className="rounded-xl bg-white p-1.5"><QRCodeSVG value={d.qr.payload} size={72} level="M" /></div>
      </div>
      <div className="text-[9px] text-white/50">{t('campus.card.issued')} {fmtDate(d.issued_at, locale)} · {t('campus.card.qrNote')}</div>
    </div>
  );
}

export function CardPage() {
  const { t, l, locale } = useI18n();
  const { reducedMotion } = useTheme();
  const q = useQuery(() => api<CardData>('/campus/me/card'), [], { refreshOn: ['campus'] });
  const d = q.data;
  return (
    <div>
      <PageHeader eyebrow={t('campus.hub.eyebrow')} title={t('campus.card.title')} subtitle={t('campus.card.subtitle')} />
      {q.loading && <Skeleton className="h-64 max-w-md" />}
      {q.error ? <ErrorState error={q.error} onRetry={() => void q.refetch()} /> : null}
      {d && (
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-[400px_1fr]">
          <div>
            <div className="mx-auto w-full max-w-[400px]">
              {reducedMotion ? (
                <GlareHover width="100%" height="240px" background="transparent" borderRadius="1.5rem" borderColor="transparent" glareColor="#ffffff" glareOpacity={0.25}><CardFace d={d} /></GlareHover>
              ) : (
                <TiltedCard imageSrc="data:image/gif;base64,R0lGODlhAQABAAAAACH5BAEKAAEALAAAAAABAAEAAAICTAEAOw==" altText="Digital card" containerHeight="240px" containerWidth="100%" imageHeight="240px" imageWidth="100%" rotateAmplitude={8} scaleOnHover={1.03} showMobileWarning={false} showTooltip={false} displayOverlayContent overlayContent={<div className="h-[240px] w-[min(100vw-2rem,400px)]"><CardFace d={d} /></div>} />
              )}
            </div>
            <Callout tone="gold" title={t('campus.card.qrNote')}>{d.qr.note}</Callout>
            <Card className="mt-4">
              <KeyValue items={[{ k: t('campus.card.studentNo'), v: <span className="num">{d.user.student_no ?? '—'}</span> }, { k: t('campus.card.program'), v: d.program ? `${d.program.code} · ${l(d.program.name_en, d.program.name_ar)}` : '—' }, { k: t('campus.card.campus'), v: d.campus ? l(d.campus.name_en, d.campus.name_ar) : '—' }, { k: 'QR', v: <code className="break-all text-xs">{d.qr.payload}</code> }]} />
            </Card>
          </div>
          <div className="space-y-6">
            <section>
              <SectionTitle>{t('campus.card.memberships')}</SectionTitle>
              {d.memberships.length === 0 && <EmptyState icon={<Users className="h-6 w-6" />} title={t('campus.card.noMemberships')} />}
              <ul className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                {d.memberships.map((m) => (
                  <li key={m.club_id} className="card flex items-center gap-3 p-3">
                    <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl text-white" style={{ background: m.color }}><Users className="h-4 w-4" /></span>
                    <span className="min-w-0 flex-1"><span className="block truncate text-sm font-semibold">{l(m.name_en, m.name_ar)}</span><span className="block text-xs text-muted">{t(`campus.clubs.categories.${m.category}`)} · {fmtDate(m.requested_at, locale)}</span></span>
                    {m.role === 'lead' && <Badge tone="gold">{t('campus.clubs.lead')}</Badge>}
                  </li>
                ))}
              </ul>
            </section>
            <section>
              <SectionTitle>{t('campus.card.achievements')}</SectionTitle>
              {d.achievements.length === 0 && <EmptyState icon={<Award className="h-6 w-6" />} title={t('campus.card.noAchievements')} />}
              <ul className="space-y-2">
                {d.achievements.map((a) => (
                  <li key={a.id} className="card flex items-start gap-3 p-4">
                    <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-gold-100 text-gold-700 dark:bg-gold-700/30 dark:text-gold-300"><Award className="h-4 w-4" /></span>
                    <span className="min-w-0 flex-1">
                      <span className="block text-sm font-semibold">{l(a.title_en, a.title_ar)}</span>
                      <span className="block text-xs text-muted">{a.club_name_en ?? ''}{a.event_start_at ? ` · ${fmtDate(a.event_start_at, locale)}` : ''}</span>
                      {a.verified_by_name && <span className="mt-1 inline-flex items-center gap-1 text-xs text-success"><ShieldCheck className="h-3.5 w-3.5" />{t('campus.card.verifiedBy')} {a.verified_by_name}</span>}
                    </span>
                    <Badge tone="brand">{a.kind}</Badge>
                  </li>
                ))}
              </ul>
            </section>
          </div>
        </div>
      )}
      <div className="card-next-steps mt-6 flex flex-wrap gap-2">
        {[{ to: '/campus/clubs', label: t('nav.campus') + ' · ' + 'Clubs' }, { to: '/campus/events', label: 'Events' }, { to: '/campus/map', label: t('today.action.map') }, { to: '/journey/onboarding', label: t('nav.journey') }].map((x) => <Link key={x.to} to={x.to} className="rounded-full border border-line px-3 py-1.5 text-sm hover:border-brand-400">{x.label} →</Link>)}
      </div>
    </div>
  );
}
