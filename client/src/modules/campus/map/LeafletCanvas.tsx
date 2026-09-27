import { useEffect, useRef, useState } from 'react';
import L from 'leaflet';
import type { MapCanvasProps } from './MapCanvas';
import { BOUNDARY_COLOR, ROUTE_COLOR } from './MapCanvas';
import { CATEGORY_COLOR, PARKING_LEVEL_COLOR as LEVEL_COLOR, TILES, categoryOf, labelTier, pinHtml, placeName, shortLabel, tileUrl } from './style';
import { getPublicConfig } from '@/lib/publicConfig';

/** Greedy label de-cluttering: keep the most important labels, hide any that would overlap an already placed one. */
function declutter(container: HTMLElement | null) {
  if (!container) return;
  const labels = Array.from(container.querySelectorAll<HTMLElement>('.leaflet-tooltip.uj-label'));
  const rank = (el: HTMLElement) => (el.classList.contains('uj-label--sel') ? 0 : el.classList.contains('uj-label--t1') ? 1 : 2);
  labels.sort((a, b) => rank(a) - rank(b));
  // Pins are obstacles: a label that would sit under another place's pin is hidden rather than painted over.
  const placed: DOMRect[] = Array.from(container.querySelectorAll<HTMLElement>('.leaflet-marker-icon .uj-pin')).map((p) => p.getBoundingClientRect()).filter((r) => r.width > 0);
  for (const el of labels) {
    el.style.visibility = '';
    if (getComputedStyle(el).display === 'none') continue;
    const r = el.getBoundingClientRect();
    const hit = placed.some((p) => r.left < p.right + 4 && r.right > p.left - 4 && r.top < p.bottom + 2 && r.bottom > p.top - 2);
    if (hit && rank(el) > 0) el.style.visibility = 'hidden';
    else placed.push(r);
  }
}

function zoomClass(z: number) {
  return z >= 18 ? 'uj-z18' : z >= 17 ? 'uj-z17' : 'uj-z16';
}

/** Bay fills: free is the brand-independent "go" green; taken is a neutral dark; no signal is hollow and dashed. */
function bayStyle(status: string, kind: string, selected: boolean, dark: boolean): L.PolylineOptions {
  const base: L.PolylineOptions = status === 'free' ? { color: '#1f7a50', fillColor: '#2e9e6b', fillOpacity: 0.9, weight: 0.8 }
    : status === 'occupied' ? { color: dark ? '#2a2622' : '#ffffff', fillColor: dark ? '#8f857b' : '#4d463f', fillOpacity: 0.9, weight: 0.8 }
    : status === 'closed' ? { color: '#c8975b', fillColor: '#c8975b', fillOpacity: 0.25, weight: 1, dashArray: '2 2' }
    : { color: '#8f857b', fillOpacity: 0, weight: 1, dashArray: '2 2' };
  if (kind === 'disabled') return { ...base, color: '#2f6fdb', weight: 2 };
  if (kind === 'ev') return { ...base, color: '#0ea5e9', weight: 1.5 };
  if (selected) return { ...base, color: '#f0762b', weight: 2.5 };
  return base;
}

export default function LeafletCanvas({ campus, locations, route, selected, onSelect, basemap, hidden, dark, reducedMotion, locale, className, endpoints, recenterKey, parking, me, meKey, meLabel }: MapCanvasProps) {
  const el = useRef<HTMLDivElement>(null);
  const map = useRef<L.Map | null>(null);
  const tiles = useRef<L.TileLayer | null>(null);
  const layers = useRef<{ boundary: L.LayerGroup; shapes: L.LayerGroup; parking: L.LayerGroup; pins: L.LayerGroup; route: L.LayerGroup; me: L.LayerGroup } | null>(null);
  const canvasRenderer = useRef<L.Canvas | null>(null);
  const meMarker = useRef<L.Marker | null>(null);
  const meCircle = useRef<L.Circle | null>(null);
  // After "Show my location" the map keeps the dot in view as it moves, until the student pans or a route is drawn.
  const following = useRef(false);
  const [zoom, setZoom] = useState(17);
  const lastCampus = useRef<string | null>(null);
  const boundaryBounds = useRef<L.LatLngBounds | null>(null);
  const [cartoKey, setCartoKey] = useState<string | null | undefined>(undefined);
  useEffect(() => { let live = true; void getPublicConfig().then((c) => { if (live) setCartoKey(c.cartoKey); }); return () => { live = false; }; }, []);

  // Map instance
  useEffect(() => {
    if (!el.current || map.current) return;
    const m = L.map(el.current, { zoomControl: false, attributionControl: true, scrollWheelZoom: true, zoomSnap: 0.5, maxZoom: 20 });
    m.on('dragstart', () => { following.current = false; });
    L.control.zoom({ position: locale === 'ar' ? 'topleft' : 'topright' }).addTo(m);
    m.attributionControl.setPrefix(false);
    layers.current = { boundary: L.layerGroup().addTo(m), shapes: L.layerGroup().addTo(m), parking: L.layerGroup().addTo(m), pins: L.layerGroup().addTo(m), route: L.layerGroup().addTo(m), me: L.layerGroup().addTo(m) };
    canvasRenderer.current = L.canvas({ padding: 0.5 });
    let raf = 0;
    const tidy = () => { cancelAnimationFrame(raf); raf = requestAnimationFrame(() => declutter(el.current)); };
    const sync = () => { const c = el.current; if (!c) return; c.classList.remove('uj-z16', 'uj-z17', 'uj-z18'); c.classList.add(zoomClass(m.getZoom())); setZoom(m.getZoom()); tidy(); };
    m.on('zoomend', sync);
    m.on('moveend', tidy);
    (m as L.Map & { _ujTidy?: () => void })._ujTidy = tidy;
    map.current = m;
    lastCampus.current = null; // a fresh instance must be fitted again (also covers StrictMode remounts)
    sync();
    return () => { m.remove(); map.current = null; layers.current = null; tiles.current = null; meMarker.current = null; meCircle.current = null; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Basemap: themed street tiles or satellite imagery
  useEffect(() => {
    const m = map.current;
    if (!m || cartoKey === undefined) return; // wait for the server config so tiles are requested once, with the key
    const t = basemap === 'satellite' ? TILES.satellite : dark ? TILES.dark : TILES.light;
    tiles.current?.remove();
    tiles.current = L.tileLayer(tileUrl(t, cartoKey), { attribution: t.attribution, subdomains: t.subdomains || 'abc', maxNativeZoom: t.maxNativeZoom, maxZoom: 20 }).addTo(m);
    tiles.current.bringToBack();
    el.current?.classList.toggle('uj-sat', basemap === 'satellite');
  }, [basemap, dark, cartoKey]);

  // Campus boundary + initial fit
  useEffect(() => {
    const m = map.current, ly = layers.current;
    if (!m || !ly || !campus) return;
    ly.boundary.clearLayers();
    if (campus.boundary.length >= 3) {
      const poly = L.polygon(campus.boundary as L.LatLngExpression[], { color: BOUNDARY_COLOR, weight: 2, dashArray: '2 6', lineCap: 'round', fillColor: BOUNDARY_COLOR, fillOpacity: 0.05, interactive: false });
      ly.boundary.addLayer(poly);
      boundaryBounds.current = poly.getBounds();
      if (lastCampus.current !== campus.id) m.fitBounds(poly.getBounds(), { padding: [24, 24] });
    } else if (lastCampus.current !== campus.id) { boundaryBounds.current = null; m.setView([campus.lat, campus.lng], campus.zoom); }
    lastCampus.current = campus.id;
    setTimeout(() => m.invalidateSize(), 60);
  }, [campus]);

  useEffect(() => {
    const m = map.current;
    if (!m || !recenterKey) return;
    if (boundaryBounds.current) m.flyToBounds(boundaryBounds.current, { padding: [24, 24], duration: reducedMotion ? 0 : 0.6 });
    else if (campus) m.flyTo([campus.lat, campus.lng], campus.zoom, { duration: reducedMotion ? 0 : 0.6 });
  }, [recenterKey, campus, reducedMotion]);

  // Footprints, pins and labels
  useEffect(() => {
    const ly = layers.current;
    if (!ly) return;
    ly.shapes.clearLayers();
    ly.pins.clearLayers();
    const emph = new Set([selected, endpoints?.from ?? null, endpoints?.to ?? null].filter(Boolean) as string[]);
    const buildingOfEmph = new Set(locations.filter((x) => emph.has(x.id) && x.building_id).map((x) => x.building_id as string));
    for (const loc of locations) {
      if (loc.kind === 'junction') continue;
      const cat = categoryOf(loc);
      const isSel = emph.has(loc.id);
      const hostOfSel = buildingOfEmph.has(loc.id);
      if (hidden.has(cat) && !isSel && !hostOfSel) continue;
      const name = placeName(locale === 'ar' ? loc.name_ar : loc.name_en);
      const color = CATEGORY_COLOR[cat];
      if (loc.polygon && loc.polygon.length >= 3) {
        const parking = cat === 'parking';
        const poly = L.polygon(loc.polygon as L.LatLngExpression[], {
          color, weight: isSel || hostOfSel ? 2.5 : 1.25, opacity: isSel || hostOfSel ? 1 : 0.8,
          fillColor: color, fillOpacity: isSel || hostOfSel ? 0.32 : parking ? 0.08 : 0.16,
          dashArray: parking ? '4 4' : undefined, className: 'uj-shape'
        });
        poly.on('click', () => onSelect(loc.id));
        ly.shapes.addLayer(poly);
      }
      // Rooms show a pin only when they are the selected place or a route endpoint.
      if (loc.building_id && !isSel) continue;
      const size = isSel ? 34 : 26;
      const mk = L.marker([loc.lat, loc.lng], {
        icon: L.divIcon({ className: `uj-pin-wrap${loc.kind === 'entrance' && !isSel ? ' uj-minor' : ''}`, html: pinHtml(loc, isSel), iconSize: [size, size], iconAnchor: [size / 2, size / 2] }),
        keyboard: true, title: name, alt: name, riseOnHover: true, zIndexOffset: isSel ? 1000 : loc.kind === 'gate' ? 200 : 0
      });
      const tier = isSel ? 1 : labelTier(loc);
      if (tier > 0) mk.bindTooltip(shortLabel(name), { permanent: true, direction: 'bottom', offset: [0, isSel ? 16 : 12], className: `uj-label uj-label--t${tier}${isSel ? ' uj-label--sel' : ''}`, opacity: 1 });
      else mk.bindTooltip(name, { direction: 'top', offset: [0, -14], className: 'uj-tip' });
      mk.on('click', () => onSelect(loc.id));
      mk.on('keypress', (e: L.LeafletKeyboardEvent) => { if (e.originalEvent.key === 'Enter') onSelect(loc.id); });
      ly.pins.addLayer(mk);
    }
    (map.current as (L.Map & { _ujTidy?: () => void }) | null)?._ujTidy?.();
  }, [locations, selected, endpoints?.from, endpoints?.to, locale, onSelect, hidden]);

  // Parking: lot tint + count pill; individual bays (canvas) once the lot is big enough on screen to read them
  useEffect(() => {
    const ly = layers.current;
    if (!ly) return;
    ly.parking.clearLayers();
    if (!parking) return;
    const showBays = zoom >= 18.5;
    for (const lot of parking.lots) {
      const color = LEVEL_COLOR[lot.level];
      const focused = lot.id === parking.focus;
      const hasBays = showBays && !!lot.bays?.length;
      if (lot.polygon && lot.polygon.length >= 3) {
        const poly = L.polygon(lot.polygon as L.LatLngExpression[], { color, weight: focused ? 3 : 2, opacity: 0.95, fillColor: color, fillOpacity: hasBays ? 0.05 : 0.3, className: 'uj-shape' });
        poly.on('click', () => parking.onSelectLot(lot.id));
        ly.parking.addLayer(poly);
      }
      if (hasBays) {
        for (const b of lot.bays!) {
          const p = L.polygon(b.polygon as L.LatLngExpression[], { renderer: canvasRenderer.current ?? undefined, ...bayStyle(b.status, b.kind, b.id === parking.selectedBay, dark) });
          p.bindTooltip(parking.text.bay(b), { direction: 'top', className: 'uj-tip' });
          p.on('click', () => parking.onSelectBay(lot.id, b.id));
          ly.parking.addLayer(p);
        }
      }
      const full = parking.text.pill(lot);
      // Zoomed out, a pill is just the count (or the Full / No data word) so lots stay readable on a phone.
      const pill = zoom < 17.5 && full.n ? { n: full.n, label: '' } : full;
      const at: L.LatLngExpression = hasBays ? lot.entry : [lot.lat, lot.lng];
      const mk = L.marker(at, {
        icon: L.divIcon({ className: 'uj-pin-wrap', html: `<div class="uj-park${focused ? ' uj-park--sel' : ''}" style="--lvl:${color}"><span class="uj-park__p" aria-hidden="true">P</span><span class="uj-park__n">${pill.n}</span>${pill.label ? `<span class="uj-park__t">${pill.label}</span>` : ''}</div>`, iconSize: [0, 0], iconAnchor: [0, 0] }),
        keyboard: true, title: parking.text.lot(lot), alt: parking.text.lot(lot), zIndexOffset: 800
      });
      mk.on('click', () => parking.onSelectLot(lot.id));
      mk.on('keypress', (e: L.LeafletKeyboardEvent) => { if (e.originalEvent.key === 'Enter') parking.onSelectLot(lot.id); });
      ly.parking.addLayer(mk);
    }
  }, [parking, zoom, dark]);

  // Fly to a lot chosen from the list (close enough to read its bays)
  useEffect(() => {
    const m = map.current;
    if (!m || !parking?.focus || !parking.focusKey) return;
    const lot = parking.lots.find((x) => x.id === parking.focus);
    if (!lot) return;
    if (lot.polygon && lot.polygon.length >= 3) m.flyToBounds(L.latLngBounds(lot.polygon as L.LatLngExpression[]), { padding: [40, 40], maxZoom: 19.5, duration: reducedMotion ? 0 : 0.6 });
    else m.flyTo([lot.lat, lot.lng], 18.5, { duration: reducedMotion ? 0 : 0.6 });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [parking?.focusKey]);

  // The student's position: accuracy circle + blue dot (+ heading cone when the device reports one)
  useEffect(() => {
    const ly = layers.current;
    if (!ly) return;
    if (!me) { ly.me.clearLayers(); meMarker.current = null; meCircle.current = null; return; }
    const heading = me.heading !== null && me.heading !== undefined ? `<span class="uj-me__cone" style="transform: rotate(${Math.round(me.heading)}deg)"></span>` : '';
    const html = `<span class="uj-me" role="img" aria-label="${meLabel ?? 'You are here'}">${heading}<span class="uj-me__halo"></span><span class="uj-me__dot"></span></span>`;
    if (following.current) map.current?.panTo([me.lat, me.lng], { animate: !reducedMotion });
    if (meMarker.current && meCircle.current) {
      meMarker.current.setLatLng([me.lat, me.lng]);
      meMarker.current.setIcon(L.divIcon({ className: 'uj-pin-wrap', html, iconSize: [22, 22], iconAnchor: [11, 11] }));
      meCircle.current.setLatLng([me.lat, me.lng]).setRadius(Math.max(me.accuracy, 4));
      return;
    }
    meCircle.current = L.circle([me.lat, me.lng], { radius: Math.max(me.accuracy, 4), color: '#1a73e8', weight: 1, opacity: 0.35, fillColor: '#1a73e8', fillOpacity: 0.12, interactive: false });
    meMarker.current = L.marker([me.lat, me.lng], { icon: L.divIcon({ className: 'uj-pin-wrap', html, iconSize: [22, 22], iconAnchor: [11, 11] }), interactive: false, keyboard: false, zIndexOffset: 2000 });
    ly.me.addLayer(meCircle.current);
    ly.me.addLayer(meMarker.current);
  }, [me, meLabel]);

  useEffect(() => {
    const m = map.current;
    if (!m || !meKey || !me) return;
    following.current = true;
    m.flyTo([me.lat, me.lng], Math.max(m.getZoom(), 18), { duration: reducedMotion ? 0 : 0.6 });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [meKey]);

  // Route: casing + line that draws itself in, start/end markers
  useEffect(() => {
    const m = map.current, ly = layers.current;
    if (!m || !ly) return;
    ly.route.clearLayers();
    if (!route || !route.found || route.polyline.length < 2) return;
    const pts = route.polyline as L.LatLngExpression[];
    const casing = L.polyline(pts, { color: dark ? '#14120f' : '#ffffff', weight: 10, opacity: 0.95, lineJoin: 'round', lineCap: 'round', interactive: false });
    const line = L.polyline(pts, { color: ROUTE_COLOR, weight: 5.5, opacity: 1, lineJoin: 'round', lineCap: 'round', className: reducedMotion ? 'uj-route' : 'uj-route uj-route--draw', interactive: false });
    following.current = false;
    // Away from campus: a dashed line from the student to the gate the walk starts at.
    const bounds = line.getBounds();
    if (route.approach) {
      const a = [route.approach.from, route.approach.to] as L.LatLngExpression[];
      ly.route.addLayer(L.polyline(a, { color: ROUTE_COLOR, weight: 3, opacity: 0.85, dashArray: '2 9', lineCap: 'round', interactive: false }));
      bounds.extend(L.latLngBounds(a));
    }
    ly.route.addLayer(casing); ly.route.addLayer(line);
    line.getElement()?.setAttribute('pathLength', '1');
    const [s, e] = [route.polyline[0], route.polyline[route.polyline.length - 1]];
    const end = (cls: string, label: string) => L.divIcon({ className: 'uj-pin-wrap', html: `<div class="uj-end ${cls}" role="img" aria-label="${label}"></div>`, iconSize: [18, 18], iconAnchor: [9, 9] });
    ly.route.addLayer(L.marker(s as L.LatLngExpression, { icon: end('uj-end--start', locale === 'ar' ? 'البداية' : 'Start'), interactive: false, zIndexOffset: 1200 }));
    ly.route.addLayer(L.marker(e as L.LatLngExpression, { icon: end('uj-end--dest', locale === 'ar' ? 'الوجهة' : 'Destination'), interactive: false, zIndexOffset: 1200 }));
    m.flyToBounds(bounds, { padding: [48, 48], maxZoom: 19, duration: reducedMotion ? 0 : 0.7 });
  }, [route, dark, locale, reducedMotion]);

  // Fly to a newly selected place (only when no route is shown)
  useEffect(() => {
    const m = map.current;
    if (!m || !selected || (route && route.found)) return;
    const loc = locations.find((x) => x.id === selected);
    if (!loc) return;
    const target = L.latLng(loc.lat, loc.lng);
    if (!m.getBounds().pad(-0.2).contains(target) || m.getZoom() < 17.5) m.flyTo(target, Math.max(m.getZoom(), 18), { duration: reducedMotion ? 0 : 0.6 });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selected]);

  return <div ref={el} className={`uj-map ${className ?? 'h-[420px] w-full'}`} role="application" aria-label={locale === 'ar' ? 'خريطة الحرم الجامعي' : 'Campus map'} />;
}
