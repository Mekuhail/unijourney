import { useEffect, useState, type CSSProperties } from 'react';
import clsx from 'clsx';
import { Play, Pause, Radio, History, TrendingUp, TrendingDown, Minus, Accessibility, Footprints, Crosshair, X, WifiOff, Ban } from 'lucide-react';
import { useI18n } from '@/i18n';
import { api, errorMessage } from '@/lib/api';
import { fmtRelative } from '@/lib/format';
import { useToast } from '@/components/ui/toast';
import { Badge, Button, Callout, EmptyState, ErrorState, Input, Select, Skeleton } from '@/components/ui';
import type { MapLocation, ParkingData, ParkingLot } from '../types';
import { PARKING_LEVEL_COLOR, placeName } from './style';

export const DAY_START = 6 * 60;
export const DAY_END = 21 * 60;
export const toHHMM = (min: number) => `${String(Math.floor(min / 60)).padStart(2, '0')}:${String(min % 60).padStart(2, '0')}`;

function LevelChip({ lot }: { lot: ParkingLot }) {
  const { t } = useI18n();
  const Icon = lot.level === 'full' ? Ban : lot.level === 'no_data' ? WifiOff : null;
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-xs font-semibold" style={{ color: PARKING_LEVEL_COLOR[lot.level], boxShadow: `inset 0 0 0 1.5px ${PARKING_LEVEL_COLOR[lot.level]}` }}>
      {Icon ? <Icon className="h-3 w-3" aria-hidden /> : <span aria-hidden className="h-2 w-2 rounded-full" style={{ background: PARKING_LEVEL_COLOR[lot.level] }} />}
      {t(`parking.level.${lot.level}`)}
    </span>
  );
}

function Trend({ lot }: { lot: ParkingLot }) {
  const { t } = useI18n();
  const Icon = lot.trend === 'filling' ? TrendingUp : lot.trend === 'emptying' ? TrendingDown : Minus;
  return <span className="inline-flex items-center gap-1"><Icon className="h-3.5 w-3.5 rtl:-scale-x-100" aria-hidden />{t(`parking.trend.${lot.trend}`)}</span>;
}

export function Legend() {
  const { t } = useI18n();
  const sw = (cls: string, style?: CSSProperties) => <span aria-hidden className={clsx('inline-block h-3.5 w-2.5 rounded-[3px]', cls)} style={style} />;
  return (
    <div className="flex flex-wrap gap-x-3 gap-y-1.5 text-xs text-muted" aria-label={t('parking.legend')} role="group">
      <span className="inline-flex items-center gap-1.5">{sw('', { background: '#2e9e6b' })}{t('parking.legend.free')}</span>
      <span className="inline-flex items-center gap-1.5">{sw('', { background: '#4d463f' })}{t('parking.legend.occupied')}</span>
      <span className="inline-flex items-center gap-1.5">{sw('border border-dashed', { borderColor: '#8f857b' })}{t('parking.legend.unknown')}</span>
      <span className="inline-flex items-center gap-1.5">{sw('border border-dashed', { borderColor: '#c8975b', background: 'rgba(200,151,91,.25)' })}{t('parking.legend.closed')}</span>
      <span className="inline-flex items-center gap-1.5">{sw('', { boxShadow: 'inset 0 0 0 2px #2f6fdb' })}{t('parking.legend.disabled')}</span>
    </div>
  );
}

export interface ParkingPanelProps {
  data: ParkingData | null;
  loading: boolean;
  error: unknown;
  onRetry: () => void;
  minute: number | null;              // null = live
  onMinute: (m: number | null) => void;
  playing: boolean;
  onPlaying: (p: boolean) => void;
  target: string;
  onTarget: (id: string) => void;
  targets: MapLocation[];
  nextClassId: string | null;
  focus: string | null;
  onFocus: (id: string) => void;
  selectedBay: { lotId: string; bayId: string } | null;
  onCloseBay: () => void;
  onChanged: () => void;
  nowIso: string;
}

export function ParkingPanel(p: ParkingPanelProps) {
  const { t, l, locale } = useI18n();
  const toast = useToast();
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const d = p.data;
  const live = p.minute === null;
  const liveMinute = d && d.mode === 'live' ? Number(d.time.slice(0, 2)) * 60 + Number(d.time.slice(3, 5)) : DAY_START;
  const sliderValue = p.minute ?? Math.min(DAY_END, Math.max(DAY_START, liveMinute));
  const lots = d ? [...d.lots].sort((a, b) => (a.walk && b.walk ? a.walk.minutes - b.walk.minutes : 0) || (b.free / Math.max(1, b.usable)) - (a.free / Math.max(1, a.usable))) : [];
  const bayLot = p.selectedBay ? d?.lots.find((x) => x.id === p.selectedBay!.lotId) : null;
  const bay = bayLot?.bays?.find((b) => b.id === p.selectedBay!.bayId) ?? null;
  useEffect(() => setReason(''), [p.selectedBay?.bayId]);

  const toggleBay = async (closed: boolean) => {
    if (!bay) return;
    setBusy(true);
    try { await api(`/campus/map/parking/bays/${bay.id}`, { method: 'POST', body: { closed, reason: reason.trim() || undefined } }); toast.success(t(closed ? 'parking.bayClosed' : 'parking.bayOpened')); p.onChanged(); }
    catch (e) { toast.error(errorMessage(e)); } finally { setBusy(false); }
  };

  return (
    <div className="divide-y divide-line">
      <section className="space-y-3 p-4" aria-labelledby="parking-h">
        <div className="flex items-start justify-between gap-2">
          <div>
            <h2 id="parking-h" className="text-lg font-semibold">{t('parking.title')}</h2>
            <p className="text-xs text-muted">{t('parking.body')}</p>
          </div>
          {d && <span className={clsx('inline-flex shrink-0 items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold', live ? 'bg-success/15 text-success' : 'bg-gold-100 text-gold-700 dark:bg-gold-700/25 dark:text-gold-300')}>{live ? <Radio className="h-3.5 w-3.5" aria-hidden /> : <History className="h-3.5 w-3.5" aria-hidden />}{t(live ? 'parking.live' : 'parking.replay')}</span>}
        </div>

        {/* Replay: scrub or play the day; the live reading is the default */}
        <div className="rounded-xl bg-surface-2 p-3">
          <div className="mb-1.5 flex items-center justify-between gap-2 text-sm">
            <span className="num font-semibold" aria-live="polite">{d ? t(live ? 'parking.liveAt' : 'parking.replayAt', { time: d.time }) : '—'}</span>
            {!live && <button type="button" onClick={() => { p.onPlaying(false); p.onMinute(null); }} className="min-h-11 text-xs font-medium text-brand-600 hover:underline sm:min-h-8">{t('parking.backToLive')}</button>}
          </div>
          <div className="flex items-center gap-2">
            <Button size="icon" variant="outline" aria-label={t(p.playing ? 'parking.pause' : 'parking.play')} title={t(p.playing ? 'parking.pause' : 'parking.play')} onClick={() => { if (!p.playing && sliderValue >= DAY_END) p.onMinute(DAY_START); p.onPlaying(!p.playing); }}>
              {p.playing ? <Pause className="h-4 w-4" aria-hidden /> : <Play className="h-4 w-4 rtl:-scale-x-100" aria-hidden />}
            </Button>
            <label className="sr-only" htmlFor="parking-time">{t('parking.slider')}</label>
            <input id="parking-time" type="range" min={DAY_START} max={DAY_END} step={15} value={sliderValue} onChange={(e) => { p.onPlaying(false); p.onMinute(Number(e.target.value)); }} aria-valuetext={toHHMM(sliderValue)} className="h-11 min-w-0 flex-1 accent-brand-500" />
          </div>
          <div className="num flex justify-between text-xs text-muted" aria-hidden><span>06:00</span><span>12:00</span><span>21:00</span></div>
        </div>

        <label className="flex items-center gap-2 text-sm">
          <Footprints className="h-4 w-4 shrink-0 text-muted" aria-hidden />
          <span className="shrink-0 text-muted">{t('parking.walkTo')}</span>
          <Select value={p.target} onChange={(e) => p.onTarget(e.target.value)} className="min-w-0 flex-1 truncate">
            <option value="">{t('parking.noTarget')}</option>
            {p.nextClassId && <option value={p.nextClassId}>{t('parking.nextClass')}</option>}
            {p.targets.map((x) => <option key={x.id} value={x.id}>{placeName(l(x.name_en, x.name_ar))}</option>)}
          </Select>
        </label>

        {d && <p className="text-sm"><span className="num font-semibold">{t('parking.totals', { free: d.totals.free, total: d.totals.total })}</span></p>}
        <Legend />
      </section>

      {bay && bayLot && (
        <section className="space-y-2 p-4" aria-labelledby="bay-h" aria-live="polite">
          <div className="flex items-start justify-between gap-2">
            <div>
              <h3 id="bay-h" className="font-semibold">{t('parking.bay', { n: bay.n })} · {placeName(l(bayLot.name_en, bayLot.name_ar))}</h3>
              <p className="text-sm text-muted">{t(`parking.kind.${bay.kind}`)} · {bay.status === 'closed' ? `${t('parking.bay.closed')}${bay.closed_reason ? ` · ${bay.closed_reason}` : ''}` : t(`parking.bay.${bay.status}`, { time: bay.since })}</p>
            </div>
            <button type="button" onClick={p.onCloseBay} aria-label={t('common.close')} className="grid h-11 w-11 place-items-center rounded-full text-muted hover:bg-line/60"><X className="h-4 w-4" aria-hidden /></button>
          </div>
          {d?.can_manage && (
            <div className="space-y-2 rounded-xl bg-surface-2 p-3">
              <p className="text-xs text-muted">{t('parking.securityNote')}</p>
              {bay.status !== 'closed' && <Input aria-label={t('parking.closeReason')} placeholder={t('parking.closeReason')} value={reason} maxLength={120} onChange={(e) => setReason(e.target.value)} />}
              <Button size="sm" variant={bay.status === 'closed' ? 'outline' : 'danger'} loading={busy} onClick={() => void toggleBay(bay.status !== 'closed')}>{t(bay.status === 'closed' ? 'parking.openBay' : 'parking.closeBay')}</Button>
            </div>
          )}
        </section>
      )}

      <section className="p-2" aria-label={t('parking.view')}>
        {p.loading && !d && <div className="space-y-2 p-2">{[1, 2, 3].map((i) => <Skeleton key={i} className="h-24" />)}</div>}
        {p.error ? <div className="p-2"><ErrorState error={p.error} onRetry={p.onRetry} /></div> : null}
        {d && lots.length === 0 && <EmptyState title={t('parking.empty')} />}
        <ul className="space-y-1">
          {lots.map((lot) => {
            const occ = lot.usable ? Math.round(((lot.usable - lot.free) / lot.usable) * 100) : 0;
            const dis = lot.by_kind.disabled;
            return (
              <li key={lot.id}>
                <button type="button" onClick={() => p.onFocus(lot.id)} aria-pressed={p.focus === lot.id} className={clsx('w-full rounded-xl p-3 text-start transition', p.focus === lot.id ? 'bg-brand-500/10 ring-1 ring-brand-500/40' : 'hover:bg-line/40')}>
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="truncate text-sm font-semibold">{placeName(l(lot.name_en, lot.name_ar))}</div>
                      <div className="mt-0.5 flex flex-wrap items-center gap-1.5 text-xs text-muted"><Badge tone="neutral">{t(`parking.audience.${lot.audience}`)}</Badge>{lot.detection === 'entry_exit' && <span>{t('parking.detection.entry_exit')}</span>}</div>
                    </div>
                    <div className="shrink-0 text-end">
                      <div className="num text-2xl font-bold leading-none">{lot.free}</div>
                      <div className="num text-xs text-muted">{t('parking.of', { n: lot.usable })}</div>
                    </div>
                  </div>
                  <div className="mt-2 h-2 overflow-hidden rounded-full bg-line" role="img" aria-label={`${occ}%`}>
                    <span className="block h-full rounded-full" style={{ width: `${occ}%`, background: PARKING_LEVEL_COLOR[lot.level] }} />
                  </div>
                  <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted">
                    <LevelChip lot={lot} />
                    <Trend lot={lot} />
                    {lot.full_by && <span className="font-medium text-fg">{t('parking.fullBy', { time: lot.full_by })} <span className="text-muted">({t('parking.estimate')})</span></span>}
                  </div>
                  <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted">
                    {lot.walk && d?.target && <span className="inline-flex items-center gap-1"><Footprints className="h-3.5 w-3.5" aria-hidden />{t('parking.walkTarget', { min: lot.walk.minutes, place: placeName(l(d.target.name_en, d.target.name_ar)) })}</span>}
                    {dis && <span className="inline-flex items-center gap-1"><Accessibility className="h-3.5 w-3.5" aria-hidden />{t('parking.accessible', { free: dis.free, total: dis.total })}</span>}
                    {lot.closed > 0 && <span>{t('parking.closedN', { n: lot.closed })}</span>}
                    {lot.unknown > 0 && <span>{t('parking.unknownN', { n: lot.unknown })}</span>}
                    {live && <span>{t('parking.updated', { time: fmtRelative(lot.updated_at, p.nowIso, locale) })}</span>}
                  </div>
                  <span className="mt-2 inline-flex items-center gap-1 text-xs font-medium text-brand-600"><Crosshair className="h-3.5 w-3.5" aria-hidden />{t('parking.showOnMap')}</span>
                </button>
              </li>
            );
          })}
        </ul>
      </section>
      <div className="p-4"><Callout tone="info">{t('parking.disclosure')}</Callout><p className="mt-2 text-xs text-muted">{t('parking.zoomHint')}</p></div>
    </div>
  );
}
