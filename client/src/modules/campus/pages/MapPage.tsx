import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router';
import { ArrowLeftRight, Footprints, Accessibility, Navigation, ExternalLink, Info, Search, X, CalendarDays, Maximize2, Layers, MapPin, ChevronDown } from 'lucide-react';
import clsx from 'clsx';
import { useI18n } from '@/i18n';
import { useQuery } from '@/lib/useQuery';
import { api, errorMessage } from '@/lib/api';
import { useSession } from '@/lib/session';
import { useTheme } from '@/lib/theme';
import { useToast } from '@/components/ui/toast';
import { PageHeader } from '@/components/ui/PageHeader';
import { Badge, Button, Callout, ErrorState, Select, Skeleton, Tabs } from '@/components/ui';
import { fmtDateTime, minutesLabel } from '@/lib/format';
import type { Campus, MapLocation, NextClass, RouteResult } from '../types';
import { MapCanvas } from '../map/MapCanvas';
import { CATEGORIES, CATEGORY_COLOR, categoryOf, pinHtml, type Basemap, type Category } from '../map/style';
import { AccessBadge, GeometryBadge } from '../lib';

type Mode = 'walking' | 'accessible';

const POPULAR: Record<string, string[]> = {
  riyadh: ['ryd_gate_main', 'ryd_bldg_a', 'ryd_bldg_c', 'ryd_bldg_b', 'ryd_library', 'ryd_bldg_d', 'ryd_sports', 'ryd_mosque', 'ryd_cafeteria', 'ryd_security'],
  khobar: ['khb_gate', 'khb_main', 'khb_eng', 'khb_library', 'khb_cafe', 'khb_security']
};

function readBasemap(): Basemap {
  try { return localStorage.getItem('uj.basemap') === 'satellite' ? 'satellite' : 'map'; } catch { return 'map'; }
}

/** Small category pin rendered from the same markup as the map (keeps list and map visually identical). */
function PinGlyph({ loc, size = 22 }: { loc: MapLocation; size?: number }) {
  return <span className="uj-pin-inline shrink-0" style={{ width: size, height: size }} aria-hidden dangerouslySetInnerHTML={{ __html: pinHtml(loc, false, size) }} />;
}

export function MapPage() {
  const { t, l, locale } = useI18n();
  const { user } = useSession();
  const { resolved, reducedMotion } = useTheme();
  const toast = useToast();
  const [params, setParams] = useSearchParams();
  const from = params.get('from');
  const to = params.get('to');
  const mode = (params.get('mode') === 'accessible' ? 'accessible' : 'walking') as Mode;
  const [campusId, setCampusId] = useState<string>(params.get('campus') ?? user?.campus_id ?? 'riyadh');
  const [selected, setSelected] = useState<string | null>(to);
  const [search, setSearch] = useState('');
  const [provider, setProvider] = useState<'osm' | 'google'>('osm');
  const [basemap, setBasemap] = useState<Basemap>(readBasemap);
  const [hidden, setHidden] = useState<ReadonlySet<Category>>(() => new Set());
  const [recenterKey, setRecenterKey] = useState(0);
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => { try { localStorage.setItem('uj.basemap', basemap); } catch { /* ignore */ } }, [basemap]);

  const cfg = useQuery(() => api<{ googleMapsKey: string | null }>('/config/public'), []);
  useEffect(() => { if (cfg.data?.googleMapsKey) setProvider('google'); }, [cfg.data?.googleMapsKey]);
  const campuses = useQuery(() => api<Campus[]>('/campus/map/campuses'), []);
  const campus = campuses.data?.find((c) => c.id === campusId) ?? null;
  const locs = useQuery(() => api<MapLocation[]>('/campus/map/locations', { query: { campus: campusId } }), [campusId]);
  const locations = useMemo(() => locs.data ?? [], [locs.data]);
  const byId = useMemo(() => new Map(locations.map((x) => [x.id, x])), [locations]);
  const detail = useQuery(() => api<MapLocation & { connected_edges: number; reachable: boolean; rooms: MapLocation[]; upcoming_events: Array<{ id: string; title_en: string; title_ar: string; start_at: string }> }>(`/campus/map/locations/${selected}`), [selected], { enabled: !!selected });
  const route = useQuery(() => api<RouteResult>('/campus/map/route', { query: { from, to, mode } }), [from, to, mode], { enabled: !!from && !!to });

  // A deep link to a place on the other campus switches campus.
  useEffect(() => {
    const target = to ?? from;
    if (!target) return;
    void api<MapLocation>(`/campus/map/locations/${target}`).then((x) => { if (x.campus_id !== campusId) setCampusId(x.campus_id); }).catch(() => undefined);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [to, from]);

  const setQ = useCallback((patch: Record<string, string | null>) => {
    const p = new URLSearchParams(params);
    for (const [k, v] of Object.entries(patch)) { if (v) p.set(k, v); else p.delete(k); }
    setParams(p, { replace: true });
  }, [params, setParams]);

  const useNextClass = async () => {
    try {
      const nc = await api<NextClass>('/campus/map/next-class');
      if (!nc.location) { toast.info(t('campus.map.noNextClass')); return; }
      if (nc.location.campus_id !== campusId) setCampusId(nc.location.campus_id);
      setQ({ to: nc.location.id, nextClass: null });
      setSelected(nc.location.id);
      toast.success(`${nc.entry?.title ?? ''} · ${fmtDateTime(nc.entry?.start_at, locale)}`);
    } catch (e) { toast.error(errorMessage(e)); }
  };
  useEffect(() => { if (params.get('nextClass')) void useNextClass(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, []);

  const results = useMemo(() => {
    const needle = search.trim().toLowerCase();
    if (!needle) return [];
    return locations.filter((x) => [x.name_en, x.name_ar, x.kind, x.building_name_en ?? '', x.building_name_ar ?? '', ...x.tags].join(' ').toLowerCase().includes(needle)).slice(0, 14);
  }, [locations, search]);
  const options = useMemo(() => [...locations].sort((a, b) => (a.building_name_en ?? a.name_en).localeCompare(b.building_name_en ?? b.name_en)), [locations]);
  const counts = useMemo(() => { const c = new Map<Category, number>(); for (const x of locations) if (!x.building_id) c.set(categoryOf(x), (c.get(categoryOf(x)) ?? 0) + 1); return c; }, [locations]);
  const popular = useMemo(() => (POPULAR[campusId] ?? []).map((id) => byId.get(id)).filter(Boolean) as MapLocation[], [campusId, byId]);
  const label = (x: MapLocation) => x.building_id ? `${l(x.name_en, x.name_ar)} — ${l(x.building_name_en, x.building_name_ar)}` : l(x.name_en, x.name_ar);
  const fromLoc = from ? byId.get(from) : null, toLoc = to ? byId.get(to) : null;
  const gmapsUrl = fromLoc && toLoc ? `https://www.google.com/maps/dir/?api=1&origin=${fromLoc.lat},${fromLoc.lng}&destination=${toLoc.lat},${toLoc.lng}&travelmode=walking` : toLoc ? `https://www.google.com/maps/dir/?api=1&destination=${toLoc.lat},${toLoc.lng}&travelmode=walking` : null;
  const onSelect = useCallback((id: string) => { setSelected(id); setSearch(''); }, []);
  const toggleCat = (c: Category) => setHidden((prev) => { const n = new Set(prev); if (n.has(c)) n.delete(c); else n.add(c); return n; });
  const d = detail.data;
  const r = route.data;
  const routeOk = !!r && r.found;

  const goHere = (id: string) => { setQ({ to: id }); if (!from) toast.info(t('map.pickStart')); panelRef.current?.querySelector<HTMLSelectElement>('#map-from')?.focus(); };

  return (
    <div>
      <PageHeader title={t('map.title')} subtitle={t('map.subtitle')} actions={
        <div className="flex flex-wrap items-center gap-2">
          <Tabs value={campusId} onChange={(v) => { setCampusId(v); setSelected(null); setSearch(''); setQ({ from: null, to: null, campus: v }); }} items={[{ value: 'riyadh', label: t('shell.riyadh') }, { value: 'khobar', label: t('shell.khobar') }]} />
          <Tabs value={basemap} onChange={(v) => setBasemap(v)} items={[{ value: 'map', label: t('map.basemap.map') }, { value: 'satellite', label: t('map.basemap.satellite') }]} />
          {cfg.data?.googleMapsKey && <Button size="sm" variant="ghost" icon={<Layers className="h-4 w-4" />} onClick={() => setProvider((p) => (p === 'osm' ? 'google' : 'osm'))}>{provider === 'osm' ? t('campus.map.google') : t('campus.map.osm')}</Button>}
        </div>
      } />

      <div className="grid grid-cols-1 gap-4 lg:h-[calc(100dvh-11rem)] lg:min-h-[620px] lg:grid-cols-[380px_minmax(0,1fr)]">
        {/* ---------------- Map ---------------- */}
        <section className="relative order-1 min-h-0 overflow-hidden rounded-[1.25rem] border border-line bg-surface-2 shadow-[var(--shadow-soft)] lg:order-2" aria-label={t('map.title')}>
          {(campuses.loading || locs.loading) && !campus && <Skeleton className="h-[58dvh] min-h-[340px] w-full lg:h-full" />}
          {campuses.error ? <div className="p-4"><ErrorState error={campuses.error} onRetry={() => void campuses.refetch()} /></div> : null}
          {campus && (
            <MapCanvas campus={campus} locations={locations} route={routeOk ? r : null} selected={selected} onSelect={onSelect} provider={provider} googleKey={cfg.data?.googleMapsKey ?? null}
              basemap={basemap} hidden={hidden} dark={resolved === 'dark'} reducedMotion={reducedMotion} locale={locale}
              className="h-[58dvh] min-h-[340px] w-full lg:h-full" endpoints={{ from, to }} recenterKey={recenterKey} />
          )}

          {/* Category filters */}
          <div className="pointer-events-none absolute inset-x-0 top-0 z-[500] p-3">
            <div className="scroll-thin pointer-events-auto flex max-w-full gap-1.5 overflow-x-auto pb-1" role="group" aria-label={t('map.filters')}>
              {CATEGORIES.filter((c) => counts.get(c)).map((c) => {
                const on = !hidden.has(c);
                return (
                  <button key={c} type="button" aria-pressed={on} onClick={() => toggleCat(c)}
                    className={clsx('uj-chip inline-flex shrink-0 items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-semibold transition', on ? 'border-transparent bg-surface text-fg shadow-sm' : 'border-line bg-surface/70 text-muted line-through decoration-1')}>
                    <span className="h-2.5 w-2.5 rounded-full" style={{ background: on ? CATEGORY_COLOR[c] : 'transparent', boxShadow: `inset 0 0 0 2px ${CATEGORY_COLOR[c]}` }} />
                    {t(`map.cat.${c}`)}
                    <span className="num text-[10px] font-medium text-muted">{counts.get(c)}</span>
                  </button>
                );
              })}
              {hidden.size > 0 && <button type="button" onClick={() => setHidden(new Set())} className="uj-chip shrink-0 rounded-full bg-brand-500 px-3 py-1.5 text-xs font-semibold text-white shadow-sm">{t('map.showAll')}</button>}
            </div>
          </div>

          {/* Bottom overlay: status + recenter, and a route/selection bar on small screens */}
          <div className="pointer-events-none absolute inset-x-0 bottom-0 z-[500] flex flex-col gap-2 p-3">
            {(routeOk || d) && (
              <div className="pointer-events-auto glass flex items-center gap-3 rounded-2xl px-3 py-2 shadow-lg lg:hidden">
                {routeOk ? (
                  <>
                    <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-brand-500 text-white">{r!.mode === 'accessible' ? <Accessibility className="h-4 w-4" /> : <Footprints className="h-4 w-4" />}</span>
                    <span className="num min-w-0 flex-1 text-sm font-semibold">{t('map.routeSummary', { m: r!.distance_m, t: minutesLabel(r!.duration_min, locale) })}</span>
                    <Button size="sm" variant="ghost" onClick={() => setQ({ from: null, to: null })}>{t('map.closeRoute')}</Button>
                  </>
                ) : d ? (
                  <>
                    <PinGlyph loc={d} size={28} />
                    <span className="min-w-0 flex-1 truncate text-sm font-semibold">{l(d.name_en, d.name_ar)}</span>
                    <Button size="sm" icon={<Navigation className="h-4 w-4" />} onClick={() => goHere(d.id)}>{t('map.goHere')}</Button>
                  </>
                ) : null}
              </div>
            )}
            <div className="flex items-end justify-between gap-2">
              <div className="pointer-events-auto flex flex-wrap gap-1">
                {campus && <GeometryBadge status={campus.geometry_status} />}
                {campus && <Badge tone="neutral" className="!bg-surface/85">{t('map.results', { n: campus.locations })}</Badge>}
              </div>
              <button type="button" onClick={() => setRecenterKey((k) => k + 1)} className="pointer-events-auto glass grid h-10 w-10 place-items-center rounded-xl shadow-md hover:text-brand-600" title={t('map.recenter')} aria-label={t('map.recenter')}><Maximize2 className="h-4 w-4" /></button>
            </div>
          </div>
        </section>

        {/* ---------------- Panel ---------------- */}
        <aside ref={panelRef} className="card order-2 flex min-h-0 min-w-0 flex-col overflow-hidden !p-0 lg:order-1">
          <div className="border-b border-line p-3">
            <div className="relative">
              <Search className="pointer-events-none absolute start-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" />
              <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder={t('campus.map.searchPlaceholder')} aria-label={t('common.search')}
                className="w-full rounded-xl border border-line bg-surface-2 py-2.5 pe-9 ps-9 text-sm focus:border-brand-400 focus:bg-surface focus:outline-none focus:ring-2 focus:ring-brand-400/30" />
              {search && <button type="button" onClick={() => setSearch('')} className="absolute end-2 top-1/2 -translate-y-1/2 rounded p-1 text-muted hover:text-fg" aria-label={t('common.close')}><X className="h-4 w-4" /></button>}
            </div>
          </div>

          <div className="scroll-thin min-h-0 flex-1 overflow-y-auto">
            {search.trim() ? (
              <ul className="p-2" role="listbox" aria-label={t('common.search')}>
                {results.length === 0 && <li className="px-3 py-6 text-center text-sm text-muted">{t('map.noResults', { q: search.trim() })}</li>}
                {results.map((x) => (
                  <li key={x.id}>
                    <button type="button" role="option" aria-selected={selected === x.id} onClick={() => onSelect(x.id)} className="flex w-full items-center gap-3 rounded-xl px-2.5 py-2 text-start hover:bg-line/50 focus-visible:bg-line/50">
                      <PinGlyph loc={x} />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-medium">{l(x.name_en, x.name_ar)}</span>
                        <span className="block truncate text-xs text-muted">{x.building_id ? t('map.inside', { b: l(x.building_name_en, x.building_name_ar) }) : t(`map.cat.${categoryOf(x)}`)}</span>
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            ) : (
              <div className="divide-y divide-line">
                {/* Selected place */}
                {selected && (
                  <section className="p-4" aria-live="polite">
                    {detail.loading && <Skeleton className="h-28" />}
                    {detail.error ? <ErrorState error={detail.error} onRetry={() => void detail.refetch()} /> : null}
                    {d && (
                      <div className="space-y-3">
                        <div className="flex items-start gap-3">
                          <PinGlyph loc={d} size={36} />
                          <div className="min-w-0 flex-1">
                            <h2 className="text-lg font-semibold leading-snug">{l(d.name_en, d.name_ar)}</h2>
                            <p className="text-xs text-muted">
                              {d.building_name_en ? `${t('map.inside', { b: l(d.building_name_en, d.building_name_ar) })} · ${d.floor ? t('map.floorN', { n: d.floor }) : t('map.ground')}` : t(`map.cat.${categoryOf(d)}`)}
                            </p>
                          </div>
                          <button type="button" className="rounded-lg p-1.5 text-muted hover:bg-line/60 hover:text-fg" onClick={() => setSelected(null)} aria-label={t('common.close')}><X className="h-4 w-4" /></button>
                        </div>
                        <div className="flex flex-wrap gap-2">
                          <Button size="sm" icon={<Navigation className="h-4 w-4" />} onClick={() => goHere(d.id)}>{t('map.goHere')}</Button>
                          <Button size="sm" variant="outline" onClick={() => setQ({ from: d.id })}>{t('map.startHere')}</Button>
                        </div>
                        {d.description_en && <p className="text-sm leading-relaxed text-muted">{d.description_en}</p>}
                        <div className="flex flex-wrap gap-1"><GeometryBadge status={d.geometry_status} /><AccessBadge value={d.accessible} /></div>
                        {!d.reachable && <Callout tone="warn">{t('campus.map.unreachable')}</Callout>}
                        {d.rooms.length > 0 && (
                          <div>
                            <h3 className="mb-1.5 text-xs font-semibold text-muted">{t('map.roomsHere')}</h3>
                            <div className="flex flex-wrap gap-1.5">{d.rooms.map((rm) => <button key={rm.id} type="button" onClick={() => setSelected(rm.id)} className="rounded-full border border-line bg-surface-2 px-2.5 py-1 text-xs hover:border-brand-400">{l(rm.name_en, rm.name_ar)}</button>)}</div>
                          </div>
                        )}
                        {d.upcoming_events.length > 0 && (
                          <div>
                            <h3 className="mb-1.5 text-xs font-semibold text-muted">{t('campus.map.upcomingHere')}</h3>
                            <ul className="space-y-1 text-sm">{d.upcoming_events.map((e) => <li key={e.id}><Link to={`/campus/events/${e.id}`} className="text-brand-600 hover:underline">{l(e.title_en, e.title_ar)}</Link> <span className="num text-xs text-muted">· {fmtDateTime(e.start_at, locale)}</span></li>)}</ul>
                          </div>
                        )}
                      </div>
                    )}
                  </section>
                )}

                {/* Directions */}
                <section className="space-y-3 p-4" aria-labelledby="map-dir-h">
                  <div className="flex items-center justify-between">
                    <h2 id="map-dir-h" className="text-sm font-semibold">{t('map.directions')}</h2>
                    <Button size="sm" variant="ghost" icon={<CalendarDays className="h-4 w-4" />} onClick={() => void useNextClass()}>{t('campus.map.nextClass')}</Button>
                  </div>
                  <div className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-2">
                    <div className="relative min-w-0 space-y-2 ps-5">
                      <span className="absolute start-1 top-3 h-2.5 w-2.5 rounded-full bg-success" aria-hidden />
                      <span className="absolute start-[8px] top-6 h-[calc(100%-2.5rem)] border-s-2 border-dotted border-line" aria-hidden />
                      <span className="absolute bottom-3 start-1 h-2.5 w-2.5 rounded-sm bg-danger" aria-hidden />
                      <Select id="map-from" className="min-w-0 truncate" value={from ?? ''} onChange={(e) => setQ({ from: e.target.value || null })} aria-label={t('campus.map.from')}><option value="">{t('map.pickStart')}</option>{options.map((x) => <option key={x.id} value={x.id}>{label(x)}</option>)}</Select>
                      <Select className="min-w-0 truncate" value={to ?? ''} onChange={(e) => setQ({ to: e.target.value || null })} aria-label={t('campus.map.to')}><option value="">{t('map.pickEnd')}</option>{options.map((x) => <option key={x.id} value={x.id}>{label(x)}</option>)}</Select>
                    </div>
                    <Button variant="outline" size="icon" aria-label={t('campus.map.swap')} title={t('campus.map.swap')} onClick={() => setQ({ from: to, to: from })}><ArrowLeftRight className="h-4 w-4 rotate-90" /></Button>
                  </div>
                  <Tabs value={mode} onChange={(v) => setQ({ mode: v })} items={[{ value: 'walking', label: t('campus.map.walking'), icon: <Footprints className="h-4 w-4" /> }, { value: 'accessible', label: t('campus.map.accessible'), icon: <Accessibility className="h-4 w-4" /> }]} />
                  {(from || to) && <button type="button" onClick={() => setQ({ from: null, to: null })} className="text-xs font-medium text-muted underline-offset-4 hover:text-fg hover:underline">{t('campus.map.clear')}</button>}
                  {from && to && route.loading && <Skeleton className="h-16" />}
                  {route.error ? <ErrorState error={route.error} onRetry={() => void route.refetch()} /> : null}

                  {r && routeOk && (
                    <div className="space-y-3">
                      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
                        <span className="num text-2xl font-bold tracking-tight">{minutesLabel(r.duration_min, locale)}</span>
                        <span className="num text-sm text-muted">{r.distance_m} m</span>
                        {r.stairsSegments > 0 ? <Badge tone="warn">{t('campus.map.stairs')}</Badge> : <Badge tone="success">{t('campus.map.stepFree')}</Badge>}
                        {gmapsUrl && <a href={gmapsUrl} target="_blank" rel="noreferrer noopener" className="ms-auto inline-flex items-center gap-1 text-xs font-semibold text-brand-600 hover:underline">{t('campus.map.directionsGoogle')}<ExternalLink className="h-3 w-3" /></a>}
                      </div>
                      <ol className="relative space-y-0 ps-6">
                        <span className="absolute bottom-2 start-[9px] top-2 w-0.5 rounded bg-brand-500/25" aria-hidden />
                        {r.steps.map((st, i) => (
                          <li key={i} className="relative py-1.5 text-sm">
                            <span className={clsx('absolute -start-6 top-2 grid h-[18px] w-[18px] place-items-center rounded-full text-[10px] font-bold text-white', i === r.steps.length - 1 ? 'bg-danger' : 'bg-brand-500')}>{i + 1}</span>
                            <span className="block leading-snug">{locale === 'ar' ? st.instruction_ar : st.instruction_en}</span>
                            <span className={clsx('text-[11px] capitalize', st.accessible === 'no' ? 'text-danger' : st.accessible === 'unknown' ? 'text-muted' : 'text-success')}>{st.kind}</span>
                          </li>
                        ))}
                      </ol>
                      {r.unknownAccessibilitySegments > 0 && <p className="text-xs text-muted">{t('campus.map.unknownSegments', { n: r.unknownAccessibilitySegments })}</p>}
                      {r.warnings.length > 0 && <ul className="space-y-1 text-xs text-muted">{r.warnings.map((w, i) => <li key={i} className="flex gap-2"><Info className="mt-0.5 h-3.5 w-3.5 shrink-0" />{w}</li>)}</ul>}
                    </div>
                  )}
                  {r && !r.found && (
                    <Callout tone="warn" title={t('campus.map.noRoute')}>
                      {r.reason}
                      {r.reason_code === 'no_step_free_route' && <div className="mt-2"><Button size="sm" variant="outline" onClick={() => setQ({ mode: 'walking' })}>{t('campus.map.walking')}</Button></div>}
                      {gmapsUrl && r.reason_code === 'cross_campus' && <div className="mt-2"><a href={gmapsUrl} target="_blank" rel="noreferrer noopener" className="inline-flex items-center gap-1 text-xs font-semibold text-brand-600 hover:underline">{t('campus.map.directionsGoogle')}<ExternalLink className="h-3 w-3" /></a></div>}
                    </Callout>
                  )}
                </section>

                {/* Popular places */}
                {!selected && !routeOk && popular.length > 0 && (
                  <section className="p-4" aria-labelledby="map-pop-h">
                    <h2 id="map-pop-h" className="mb-2 text-sm font-semibold">{t('map.popular')}</h2>
                    <ul className="grid grid-cols-1 gap-1">
                      {popular.map((x) => (
                        <li key={x.id}>
                          <button type="button" onClick={() => onSelect(x.id)} className="flex w-full items-center gap-3 rounded-xl px-2 py-1.5 text-start text-sm hover:bg-line/50">
                            <PinGlyph loc={x} />
                            <span className="min-w-0 flex-1 truncate">{l(x.name_en, x.name_ar)}</span>
                            <MapPin className="h-3.5 w-3.5 shrink-0 text-muted" />
                          </button>
                        </li>
                      ))}
                    </ul>
                  </section>
                )}

                {/* About */}
                <details className="group p-4 text-xs text-muted">
                  <summary className="flex cursor-pointer list-none items-center gap-1.5 font-semibold text-fg"><Info className="h-3.5 w-3.5" />{t('map.about')}<ChevronDown className="ms-auto h-4 w-4 transition group-open:rotate-180" /></summary>
                  <div className="mt-2 space-y-1.5 leading-relaxed">
                    {campusId === 'riyadh' && <p>{t('map.source.annotated')}</p>}
                    <p>{t('campus.map.disclosureBody')}</p>
                    {campus?.source_note && <p>{campus.source_note}</p>}
                    <p>{t('campus.map.attribution')}{campus?.osm_ref ? ` · ${campus.osm_ref}` : ''}</p>
                  </div>
                </details>
              </div>
            )}
          </div>
        </aside>
      </div>
    </div>
  );
}
