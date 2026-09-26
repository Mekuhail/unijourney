import { useState, type ReactNode } from 'react';
import clsx from 'clsx';
import { CheckCircle2, Lock, Sparkles, Lightbulb, MessageSquareQuote } from 'lucide-react';
import { useI18n } from '@/i18n';
import { api, errorMessage } from '@/lib/api';
import { refreshAll } from '@/lib/bus';
import { fmtDate } from '@/lib/format';
import { useToast } from '@/components/ui/toast';
import { Badge, Button, Field, Input, Modal, Textarea } from '@/components/ui';
import type { Aggregate, Band, Eligible, FeedbackAction, KpiKey, KpiStat, MyResponse, TrendPoint } from './types';
import { ALL_KPIS } from './types';

export const BAND_TONE: Record<Band, 'success' | 'brand' | 'gold'> = { strong: 'success', on_track: 'brand', focus: 'gold' };
const BAR: Record<Band, string> = { strong: 'bg-success', on_track: 'bg-brand-500', focus: 'bg-gold-500' };

export function BandBadge({ band }: { band: Band | null }) {
  const { t } = useI18n();
  if (!band) return null;
  return <Badge tone={BAND_TONE[band]}>{t(`fb.band.${band}`)}</Badge>;
}

const fmt1 = (n: number) => n.toFixed(1);

/** 0–100 index as a ring. Colour follows the band so a focus area never reads as an alarm. */
export function IndexRing({ value, label, size = 88 }: { value: number | null; label: string; size?: number }) {
  const { t } = useI18n();
  const r = (size - 10) / 2, c = 2 * Math.PI * r, pct = value === null ? 0 : value / 100;
  const band: Band | null = value === null ? null : value >= 80 ? 'strong' : value >= 65 ? 'on_track' : 'focus';
  return (
    <div className="flex shrink-0 flex-col items-center gap-1">
      <div className="relative" style={{ width: size, height: size }} role="img" aria-label={value === null ? `${label}: ${t('fb.notEnough')}` : `${label}: ${value} ${t('fb.outOf100')}`}>
        <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="-rotate-90" aria-hidden>
          <circle cx={size / 2} cy={size / 2} r={r} fill="none" strokeWidth={7} className="stroke-line" />
          {value !== null && <circle cx={size / 2} cy={size / 2} r={r} fill="none" strokeWidth={7} strokeLinecap="round" strokeDasharray={c} strokeDashoffset={c * (1 - pct)} className={band === 'strong' ? 'stroke-success' : band === 'on_track' ? 'stroke-brand-500' : 'stroke-gold-500'} />}
        </svg>
        <span className="num absolute inset-0 grid place-items-center text-2xl font-bold">{value ?? '–'}</span>
      </div>
      <span className="text-xs font-medium text-muted">{label}</span>
    </div>
  );
}

/** Three-term sparkline; missing points (below threshold) break the line. */
export function Sparkline({ points, label }: { points: Array<number | null>; label: string }) {
  const w = 72, h = 24, pad = 3;
  const xs = points.map((_, i) => pad + (i * (w - 2 * pad)) / Math.max(1, points.length - 1));
  // Domain hugs the data (at least half a point) so a 3.0 → 3.9 rise reads as a rise, not a flat line.
  const vals = points.filter((p): p is number => p !== null);
  const mid = vals.length ? (Math.min(...vals) + Math.max(...vals)) / 2 : 3;
  const span = Math.max(0.5, vals.length ? Math.max(...vals) - Math.min(...vals) : 0.5) / 2 + 0.1;
  const y = (v: number) => h - pad - ((v - (mid - span)) / (2 * span)) * (h - 2 * pad);
  const segs: string[] = [];
  let cur = '';
  points.forEach((p, i) => { if (p === null) { if (cur) segs.push(cur); cur = ''; } else cur += `${cur ? 'L' : 'M'}${xs[i]},${y(p)}`; });
  if (cur) segs.push(cur);
  return (
    <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`} role="img" aria-label={label} className="shrink-0 overflow-visible text-brand-600 rtl:-scale-x-100">
      {segs.map((d, i) => <path key={i} d={d} fill="none" stroke="currentColor" strokeWidth={1.75} strokeLinecap="round" strokeLinejoin="round" />)}
      {points.map((p, i) => p !== null && <circle key={i} cx={xs[i]} cy={y(p)} r={i === points.length - 1 ? 2.75 : 1.75} fill="currentColor" />)}
      {vals.length === 0 && <line x1={pad} x2={w - pad} y1={h / 2} y2={h / 2} className="stroke-line" strokeDasharray="3 3" />}
    </svg>
  );
}

/** One KPI: mean out of 5 on a bar, the college average as a tick, share who agree, band and trend. */
export function KpiRow({ k, stat, bench, trend }: { k: KpiKey; stat: KpiStat; bench: number | null; trend: TrendPoint[] }) {
  const { t, locale } = useI18n();
  const mean = stat.mean;
  const diff = mean !== null && bench !== null ? Math.round((mean - bench) * 10) / 10 : null;
  const series = trend.map((p) => p.kpis[k] ?? null);
  const trendLabel = `${t(`fb.kpi.${k}`)} · ${trend.map((p, i) => `${locale === 'ar' ? p.label_ar : p.label_en}: ${series[i] === null ? t('fb.trendGap', { min: 5 }) : fmt1(series[i]!)}`).join(', ')}`;
  return (
    <li className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-4 gap-y-2 py-3 sm:grid-cols-[minmax(0,14rem)_minmax(0,1fr)_auto]">
      <div className="min-w-0">
        <div className="text-sm font-semibold">{t(`fb.kpi.${k}`)}</div>
        <div className="text-xs text-muted">{t(`fb.q.${k}`)}</div>
      </div>
      <div className="col-span-2 min-w-0 sm:col-span-1">
        <div className="flex items-center gap-3">
          <span className="num w-9 shrink-0 text-lg font-bold">{mean === null ? '–' : fmt1(mean)}</span>
          <div className="relative h-2.5 min-w-0 flex-1 rounded-full bg-line">
            {mean !== null && stat.band && <span className={clsx('absolute inset-y-0 start-0 rounded-full', BAR[stat.band])} style={{ width: `${((mean - 1) / 4) * 100}%` }} />}
            {bench !== null && <span aria-hidden className="absolute -top-1 h-4.5 w-0.5 rounded bg-fg/70" style={{ insetInlineStart: `calc(${((bench - 1) / 4) * 100}% - 1px)` }} />}
          </div>
        </div>
        <div className="mt-1 flex flex-wrap gap-x-3 text-xs text-muted">
          {stat.favourable !== null && <span>{t('fb.favourable', { n: stat.favourable })}</span>}
          {bench !== null && <span>{t('fb.benchmark', { n: fmt1(bench) })}{diff !== null && diff !== 0 ? ` · ${t('fb.vsCollege', { sign: diff > 0 ? '+' : '−', n: fmt1(Math.abs(diff)) })}` : ''}</span>}
        </div>
      </div>
      <div className="col-start-2 row-start-1 flex items-center gap-2 sm:col-start-3">
        <Sparkline points={series} label={trendLabel} />
        <BandBadge band={stat.band} />
      </div>
    </li>
  );
}

export function KpiList({ agg, kpis, bench, trend }: { agg: Aggregate; kpis: KpiKey[]; bench: Record<KpiKey, number | null>; trend: TrendPoint[] }) {
  return <ul className="divide-y divide-line">{kpis.map((k) => <KpiRow key={k} k={k} stat={agg.kpis[k]} bench={bench[k]} trend={trend} />)}</ul>;
}

export function NotEnough({ n, min }: { n: number; min: number }) {
  const { t } = useI18n();
  return (
    <div className="card-2 flex items-start gap-3 p-4">
      <Lock className="mt-0.5 h-5 w-5 shrink-0 text-muted" aria-hidden />
      <div><div className="font-semibold">{t('fb.notEnough')}</div><p className="text-sm text-muted">{t('fb.notEnoughBody', { min, n })}</p></div>
    </div>
  );
}

/** Theme shares as horizontal bars: strengths and requested improvements, never quotes. */
export function ThemeBars({ items, tone }: { items: Array<{ key: string; share: number }>; tone: 'strength' | 'suggestion' }) {
  const { t } = useI18n();
  if (!items.length) return <p className="text-sm text-muted">{t('fb.noThemes')}</p>;
  return (
    <ul className="space-y-2.5">
      {items.map((it) => (
        <li key={it.key}>
          <div className="flex items-baseline justify-between gap-3 text-sm"><span>{t(`fb.theme.${it.key}.${tone}`)}</span><span className="num font-semibold">{it.share}%</span></div>
          <div className="mt-1 h-1.5 rounded-full bg-line"><span className={clsx('block h-full rounded-full', tone === 'strength' ? 'bg-success' : 'bg-gold-500')} style={{ width: `${it.share}%` }} /></div>
        </li>
      ))}
    </ul>
  );
}

export function ThemesCard({ agg }: { agg: Aggregate }) {
  const { t } = useI18n();
  return (
    <div className="grid gap-4 md:grid-cols-2">
      <section aria-labelledby="themes-s" className="card p-4">
        <h2 id="themes-s" className="flex items-center gap-2 font-semibold"><Sparkles className="h-4 w-4 text-success" aria-hidden />{t('fb.strengths')}</h2>
        <p className="mb-3 text-xs text-muted">{t('fb.strengthsBody')}</p>
        <ThemeBars items={agg.strengths} tone="strength" />
      </section>
      <section aria-labelledby="themes-g" className="card p-4">
        <h2 id="themes-g" className="flex items-center gap-2 font-semibold"><Lightbulb className="h-4 w-4 text-gold-600" aria-hidden />{t('fb.suggestions')}</h2>
        <p className="mb-3 text-xs text-muted">{t('fb.suggestionsBody')}</p>
        <ThemeBars items={agg.suggestions} tone="suggestion" />
      </section>
    </div>
  );
}

export function ActionsList({ actions }: { actions: FeedbackAction[] }) {
  const { t, l, locale } = useI18n();
  if (!actions.length) return null;
  return (
    <section aria-labelledby="actions-h" className="card p-4">
      <h2 id="actions-h" className="flex items-center gap-2 font-semibold"><MessageSquareQuote className="h-4 w-4 text-brand-600" aria-hidden />{t('fb.actions')}</h2>
      <p className="mb-3 text-xs text-muted">{t('fb.actionsBody')}</p>
      <ul className="space-y-3">
        {actions.map((a) => (
          <li key={a.id} className="rounded-xl bg-surface-2 p-3">
            <div className="flex flex-wrap items-center gap-2 text-xs text-muted"><Badge tone="brand">{t(`fb.kpi.${a.kpi}`)}</Badge>{a.course_code && <span className="num font-medium text-fg">{a.course_code}</span>}<span className="num">{fmtDate(a.created_at, locale)}</span></div>
            <p dir="auto" className="mt-1.5 text-sm">{l(a.body_en, a.body_ar || a.body_en)}</p>
          </li>
        ))}
      </ul>
    </section>
  );
}

// ------------------------------------------------------------------ the form
const SCALE = [1, 2, 3, 4, 5];

/** Anonymous rating form: six statements on a 1–5 agreement scale, recommend, study hours and a private comment. */
export function FeedbackForm({ target, existing, open, onClose, onDone }: { target: Eligible; existing?: MyResponse | null; open: boolean; onClose: () => void; onDone?: () => void }) {
  const { t, l } = useI18n();
  const toast = useToast();
  const [ratings, setRatings] = useState<Partial<Record<KpiKey, number>>>(existing?.ratings ?? {});
  const [recommend, setRecommend] = useState<boolean | null>(existing ? (existing.recommend === null ? null : existing.recommend === 1) : null);
  const [hours, setHours] = useState(existing?.hours_per_week != null ? String(existing.hours_per_week) : '');
  const [comment, setComment] = useState(existing?.comment ?? '');
  const [busy, setBusy] = useState(false);
  const complete = ALL_KPIS.every((k) => ratings[k]);
  const submit = async () => {
    setBusy(true);
    try {
      const body = { ratings, recommend, hours_per_week: hours === '' ? null : Math.max(0, Math.min(40, Number(hours))), comment: comment.trim() };
      const r = existing
        ? await api<{ status: string }>(`/feedback/responses/${existing.id}`, { method: 'PUT', body })
        : await api<{ status: string }>('/feedback/responses', { method: 'POST', body: { ...body, course_code: target.course_code, term: target.term } });
      toast.success(t(r.status === 'held' ? 'fb.heldToast' : existing ? 'fb.saved' : 'fb.submitted'));
      refreshAll('feedback');
      onDone?.();
      onClose();
    } catch (e) { toast.error(errorMessage(e)); } finally { setBusy(false); }
  };
  return (
    <Modal open={open} onClose={onClose} size="lg" title={t('fb.form.title', { code: target.course_code })} description={`${l(target.title_en, target.title_ar)} · ${l(target.instructor.name_en, target.instructor.name_ar)} · ${l(target.term_label_en, target.term_label_ar)}`}
      footer={<><span className="me-auto hidden text-xs text-muted sm:block">{complete ? '' : t('fb.form.rateAll')}</span><Button variant="ghost" onClick={onClose}>{t('common.cancel')}</Button><Button loading={busy} disabled={!complete} onClick={() => void submit()}>{t(existing ? 'fb.form.save' : 'fb.form.submit')}</Button></>}>
      <p className="mb-4 flex items-start gap-2 rounded-xl bg-surface-2 p-3 text-sm"><Lock className="mt-0.5 h-4 w-4 shrink-0 text-muted" aria-hidden />{t('fb.privacy.1')}</p>
      <p className="mb-2 text-xs text-muted">{t('fb.form.scale')}</p>
      <div className="space-y-4">
        {ALL_KPIS.map((k) => (
          <fieldset key={k}>
            <legend className="text-sm font-semibold">{t(`fb.kpi.${k}`)}</legend>
            <p className="mb-2 text-sm text-muted">{t(`fb.q.${k}`)}</p>
            <div role="radiogroup" aria-label={t(`fb.kpi.${k}`)} className="grid grid-cols-5 gap-1.5">
              {SCALE.map((v) => (
                <label key={v} title={t(`fb.scale.${v}`)} className={clsx('flex min-h-11 cursor-pointer flex-col items-center justify-center rounded-xl border text-sm font-semibold transition focus-within:ring-2 focus-within:ring-brand-500', ratings[k] === v ? 'border-brand-500 bg-brand-500 text-ink-950' : 'border-line hover:border-brand-400')}>
                  <input type="radio" name={`r-${k}`} value={v} checked={ratings[k] === v} onChange={() => setRatings({ ...ratings, [k]: v })} className="sr-only" />
                  <span className="num">{v}</span>
                  <span className="sr-only">{t(`fb.scale.${v}`)}</span>
                </label>
              ))}
            </div>
            <div className="mt-1 flex justify-between text-xs text-muted"><span>{t('fb.scale.1')}</span><span>{t('fb.scale.5')}</span></div>
          </fieldset>
        ))}
        <fieldset>
          <legend className="mb-2 text-sm font-semibold">{t('fb.form.recommend')}</legend>
          <div className="flex flex-wrap gap-2">
            {([[true, 'fb.form.yes'], [false, 'fb.form.no'], [null, 'fb.form.skip']] as const).map(([v, key]) => (
              <button key={key} type="button" aria-pressed={recommend === v} onClick={() => setRecommend(v)} className={clsx('inline-flex min-h-11 items-center rounded-full border px-4 text-sm font-medium transition sm:min-h-9', recommend === v ? 'border-brand-500 bg-brand-500 text-ink-950' : 'border-line hover:border-brand-400')}>{t(key)}</button>
            ))}
          </div>
        </fieldset>
        <Field label={t('fb.form.hours')} hint={t('fb.form.hoursHint')} className="max-w-xs"><Input type="number" inputMode="numeric" min={0} max={40} value={hours} onChange={(e) => setHours(e.target.value)} /></Field>
        <Field label={t('fb.form.comment')} hint={t('fb.form.commentHint', { n: comment.length })}><Textarea rows={3} maxLength={650} value={comment} onChange={(e) => setComment(e.target.value)} placeholder={t('fb.form.commentPlaceholder')} /></Field>
        {existing && existing.themes.length > 0 && (
          <div className="text-sm"><div className="mb-1 text-xs font-semibold text-muted">{t('fb.form.themesPreview')}</div><div className="flex flex-wrap gap-1">{existing.themes.map((th) => <Badge key={th.key} tone={th.tone === 'strength' ? 'success' : 'gold'}>{t(`fb.theme.${th.key}.${th.tone}`)}</Badge>)}</div></div>
        )}
      </div>
    </Modal>
  );
}

export function StatusBadge({ status }: { status: string }) {
  const { t } = useI18n();
  const tone = status === 'submitted' || status === 'published' ? 'success' : status === 'pending' ? 'warn' : status === 'held' ? 'info' : 'neutral';
  return <Badge tone={tone} dot>{t(`fb.status.${status === 'published' ? 'submitted' : status}`)}</Badge>;
}

export function Meta({ children }: { children: ReactNode }) {
  return <p className="-mt-2 mb-5 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-muted">{children}</p>;
}

export function Done() {
  return <CheckCircle2 className="h-4 w-4 text-success" aria-hidden />;
}
