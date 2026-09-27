/// <reference types="google.maps" />
import { useEffect, useRef, useState } from 'react';
import { importLibrary, setOptions } from '@googlemaps/js-api-loader';
import type { MapCanvasProps } from './MapCanvas';
import { BOUNDARY_COLOR, ROUTE_COLOR } from './MapCanvas';
import { CATEGORY_COLOR, categoryOf, pinDataUrl, placeName } from './style';

const DARK_STYLES: google.maps.MapTypeStyle[] = [
  { elementType: 'geometry', stylers: [{ color: '#1e1b18' }] },
  { elementType: 'labels.text.fill', stylers: [{ color: '#a79e95' }] },
  { elementType: 'labels.text.stroke', stylers: [{ color: '#14120f' }] },
  { featureType: 'road', elementType: 'geometry', stylers: [{ color: '#332e29' }] },
  { featureType: 'water', elementType: 'geometry', stylers: [{ color: '#0f1a26' }] },
  { featureType: 'poi', stylers: [{ visibility: 'off' }] }
];

let configured = false;

/** Google Maps implementation of MapCanvas (used only when the server exposes GOOGLE_MAPS_API_KEY). */
export default function GoogleCanvas({ campus, locations, route, selected, onSelect, dark, locale, className, googleKey, endpoints, basemap, hidden, recenterKey, me, meKey, meLabel }: MapCanvasProps) {
  const el = useRef<HTMLDivElement>(null);
  const map = useRef<google.maps.Map | null>(null);
  const overlays = useRef<{ boundary: google.maps.MVCObject[]; places: google.maps.MVCObject[]; route: google.maps.MVCObject[] }>({ boundary: [], places: [], route: [] });
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const lastCampus = useRef<string | null>(null);
  const following = useRef(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        if (!configured) { setOptions({ key: googleKey ?? '', v: 'weekly' }); configured = true; }
        const { Map: GMap } = await importLibrary('maps');
        if (cancelled || !el.current) return;
        map.current = new GMap(el.current, { center: { lat: 24.863, lng: 46.5925 }, zoom: 17, mapTypeControl: false, streetViewControl: false, fullscreenControl: true, styles: dark ? DARK_STYLES : undefined });
        setReady(true);
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e));
      }
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [googleKey]);

  useEffect(() => { map.current?.setOptions({ styles: dark && basemap !== 'satellite' ? DARK_STYLES : null, mapTypeId: basemap === 'satellite' ? 'satellite' : 'roadmap' }); }, [dark, basemap, ready]);

  useEffect(() => {
    const m = map.current;
    if (!ready || !m || !campus || !recenterKey) return;
    if (campus.boundary.length >= 3) { const b = new google.maps.LatLngBounds(); for (const [lat, lng] of campus.boundary) b.extend({ lat, lng }); m.fitBounds(b, 16); } else { m.setCenter({ lat: campus.lat, lng: campus.lng }); m.setZoom(campus.zoom); }
  }, [ready, campus, recenterKey]);

  const clear = (list: google.maps.MVCObject[]) => { for (const o of list) (o as unknown as { setMap: (m: null) => void }).setMap(null); list.length = 0; };

  useEffect(() => {
    const m = map.current;
    if (!ready || !m || !campus) return;
    clear(overlays.current.boundary);
    if (campus.boundary.length >= 3) {
      const path = campus.boundary.map(([lat, lng]) => ({ lat, lng }));
      overlays.current.boundary.push(new google.maps.Polygon({ map: m, paths: path, strokeColor: BOUNDARY_COLOR, strokeWeight: 2, fillOpacity: 0.04 }));
      if (lastCampus.current !== campus.id) { const b = new google.maps.LatLngBounds(); for (const p of path) b.extend(p); m.fitBounds(b, 16); }
    } else if (lastCampus.current !== campus.id) { m.setCenter({ lat: campus.lat, lng: campus.lng }); m.setZoom(campus.zoom); }
    lastCampus.current = campus.id;
  }, [ready, campus]);

  useEffect(() => {
    const m = map.current;
    if (!ready || !m) return;
    clear(overlays.current.places);
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
        const poly = new google.maps.Polygon({ map: m, paths: loc.polygon.map(([lat, lng]) => ({ lat, lng })), strokeColor: color, strokeWeight: isSel || hostOfSel ? 2.5 : 1.25, fillColor: color, fillOpacity: isSel || hostOfSel ? 0.32 : cat === 'parking' ? 0.08 : 0.16 });
        poly.addListener('click', () => onSelect(loc.id));
        overlays.current.places.push(poly);
      }
      if (loc.building_id && !isSel) continue;
      const pin = pinDataUrl(loc, isSel);
      const mk = new google.maps.Marker({ map: m, position: { lat: loc.lat, lng: loc.lng }, title: name, icon: { url: pin.url, anchor: new google.maps.Point(pin.size / 2, pin.size / 2) }, zIndex: isSel ? 1000 : loc.kind === 'gate' ? 200 : 1 });
      mk.addListener('click', () => onSelect(loc.id));
      overlays.current.places.push(mk);
    }
  }, [ready, locations, selected, endpoints?.from, endpoints?.to, locale, onSelect, hidden]);

  useEffect(() => {
    const m = map.current;
    if (!ready || !m) return;
    clear(overlays.current.route);
    if (!route || !route.found || route.polyline.length < 2) return;
    const path = route.polyline.map(([lat, lng]) => ({ lat, lng }));
    overlays.current.route.push(new google.maps.Polyline({ map: m, path, strokeColor: dark ? '#14120f' : '#ffffff', strokeWeight: 9, strokeOpacity: 0.9 }));
    overlays.current.route.push(new google.maps.Polyline({ map: m, path, strokeColor: ROUTE_COLOR, strokeWeight: 5, strokeOpacity: 0.95 }));
    const b = new google.maps.LatLngBounds(); for (const p of path) b.extend(p);
    // Away from campus: a dotted line from the student to the gate the walk starts at.
    if (route.approach) {
      const a = [route.approach.from, route.approach.to].map(([lat, lng]) => ({ lat, lng }));
      overlays.current.route.push(new google.maps.Polyline({ map: m, path: a, strokeOpacity: 0, icons: [{ icon: { path: 'M 0,-1 0,1', strokeOpacity: 0.85, strokeColor: ROUTE_COLOR, scale: 3 }, offset: '0', repeat: '14px' }] }));
      for (const p of a) b.extend(p);
    }
    following.current = false;
    m.fitBounds(b, 30);
  }, [ready, route, dark]);

  // The student's live position: blue dot + accuracy circle, wherever they are. After "Show my location" the map
  // keeps the dot in view as it moves, until the student drags the map.
  useEffect(() => { const m = map.current; if (!ready || !m) return; const l = m.addListener('dragstart', () => { following.current = false; }); return () => l.remove(); }, [ready]);
  const meOverlays = useRef<{ dot: google.maps.Marker | null; ring: google.maps.Circle | null }>({ dot: null, ring: null });
  useEffect(() => {
    const m = map.current;
    if (!ready || !m) return;
    const o = meOverlays.current;
    if (!me) { o.dot?.setMap(null); o.ring?.setMap(null); o.dot = null; o.ring = null; return; }
    const pos = { lat: me.lat, lng: me.lng };
    if (!o.ring) o.ring = new google.maps.Circle({ map: m, center: pos, radius: Math.max(me.accuracy, 4), strokeColor: '#1a73e8', strokeOpacity: 0.35, strokeWeight: 1, fillColor: '#1a73e8', fillOpacity: 0.12, clickable: false });
    else { o.ring.setCenter(pos); o.ring.setRadius(Math.max(me.accuracy, 4)); }
    if (!o.dot) o.dot = new google.maps.Marker({ map: m, position: pos, title: meLabel, clickable: false, zIndex: 3000, icon: { path: google.maps.SymbolPath.CIRCLE, scale: 7, fillColor: '#1a73e8', fillOpacity: 1, strokeColor: '#ffffff', strokeWeight: 3 } });
    else o.dot.setPosition(pos);
    if (following.current) m.panTo(pos);
  }, [ready, me, meLabel]);
  useEffect(() => { if (meKey && me && map.current) { following.current = true; map.current.panTo({ lat: me.lat, lng: me.lng }); if ((map.current.getZoom() ?? 0) < 18) map.current.setZoom(18); } }, [meKey]); // eslint-disable-line react-hooks/exhaustive-deps

  if (error) return <div className={`${className ?? 'h-[420px] w-full'} grid place-items-center rounded-2xl border border-danger/30 bg-danger/10 p-4 text-sm text-danger`}>Google Maps failed to load: {error}. Switch the map source to OpenStreetMap.</div>;
  return <div ref={el} className={className ?? 'h-[420px] w-full'} role="application" aria-label="Campus map (Google)" />;
}
