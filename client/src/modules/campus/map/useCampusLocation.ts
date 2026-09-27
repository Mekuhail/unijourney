import { useCallback, useEffect, useRef, useState } from 'react';
import type { Campus } from '../types';

/**
 * The student's position on the campus map. It is read in the browser and only used when it falls on (or within
 * ~150 m of) a YU campus; anywhere else the map shows nothing and "My location" is not offered. The position never
 * leaves the device except inside a directions request, and it is never stored.
 *
 * Demo mode can simulate a device position (Demo panel), because judges are rarely standing on campus.
 */
export interface Fix { lat: number; lng: number; accuracy: number; heading: number | null; spot?: string }
export type LocationStatus = 'unsupported' | 'denied' | 'idle' | 'locating' | 'on_campus' | 'off_campus';

export const NEAR_CAMPUS_M = 150;
const DEMO_KEY = 'uj.demoLocation';

export function readDemoLocation(): Fix | null {
  try { const v = localStorage.getItem(DEMO_KEY); return v ? (JSON.parse(v) as Fix) : null; } catch { return null; }
}
export function writeDemoLocation(fix: Fix | null) {
  try { if (fix) localStorage.setItem(DEMO_KEY, JSON.stringify(fix)); else localStorage.removeItem(DEMO_KEY); } catch { /* storage unavailable */ }
  window.dispatchEvent(new Event('uj-demo-location'));
}

function metersToSegment(p: [number, number], a: [number, number], b: [number, number]) {
  const k = Math.cos((p[0] * Math.PI) / 180) * 111320;
  const A = [(a[1] - p[1]) * k, (a[0] - p[0]) * 111320], B = [(b[1] - p[1]) * k, (b[0] - p[0]) * 111320];
  const dx = B[0] - A[0], dy = B[1] - A[1];
  const t = dx || dy ? Math.max(0, Math.min(1, (-A[0] * dx - A[1] * dy) / (dx * dx + dy * dy))) : 0;
  return Math.hypot(A[0] + t * dx, A[1] + t * dy);
}
function inside(p: [number, number], poly: Array<[number, number]>) {
  let r = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [yi, xi] = poly[i], [yj, xj] = poly[j];
    if ((yi > p[0]) !== (yj > p[0]) && p[1] < ((xj - xi) * (p[0] - yi)) / (yj - yi) + xi) r = !r;
  }
  return r;
}
function haversine(a: [number, number], b: [number, number]) {
  const R = 6371000, rad = (d: number) => (d * Math.PI) / 180;
  const s = Math.sin(rad(b[0] - a[0]) / 2) ** 2 + Math.cos(rad(a[0])) * Math.cos(rad(b[0])) * Math.sin(rad(b[1] - a[1]) / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(s));
}

/** Same rule as the server: inside the boundary, or within NEAR_CAMPUS_M of it (centre within 700 m without one). */
export function campusFor(fix: Fix, campuses: Campus[]): string | null {
  const p: [number, number] = [fix.lat, fix.lng];
  for (const c of campuses) {
    if (c.boundary.length >= 3) {
      if (inside(p, c.boundary) || c.boundary.some((a, i) => metersToSegment(p, a, c.boundary[(i + 1) % c.boundary.length]) <= NEAR_CAMPUS_M)) return c.id;
    } else if (haversine(p, [c.lat, c.lng]) <= 700) return c.id;
  }
  return null;
}

export function useCampusLocation(campuses: Campus[] | null, demoMode: boolean) {
  const [status, setStatus] = useState<LocationStatus>(() => (typeof navigator !== 'undefined' && 'geolocation' in navigator ? 'idle' : 'unsupported'));
  const [fix, setFix] = useState<Fix | null>(null);
  const [campusId, setCampusId] = useState<string | null>(null);
  const watch = useRef<number | null>(null);
  const waiters = useRef<Array<(s: LocationStatus) => void>>([]);
  const campusesRef = useRef(campuses);
  campusesRef.current = campuses;

  const accept = useCallback((f: Fix) => {
    const list = campusesRef.current ?? [];
    const c = f.accuracy <= 500 ? campusFor(f, list) : null;
    // Off campus: forget the position entirely rather than keeping it around.
    if (c) { setFix(f); setCampusId(c); setStatus('on_campus'); } else { setFix(null); setCampusId(null); setStatus('off_campus'); }
    waiters.current.splice(0).forEach((w) => w(c ? 'on_campus' : 'off_campus'));
  }, []);

  const start = useCallback(() => {
    const demo = demoMode ? readDemoLocation() : null;
    if (demo) { accept(demo); return; }
    if (!('geolocation' in navigator) || watch.current !== null) return;
    watch.current = navigator.geolocation.watchPosition(
      (p) => accept({ lat: p.coords.latitude, lng: p.coords.longitude, accuracy: p.coords.accuracy, heading: Number.isFinite(p.coords.heading) ? p.coords.heading : null }),
      (e) => { const st: LocationStatus = e.code === e.PERMISSION_DENIED ? 'denied' : 'off_campus'; setStatus(st); setFix(null); waiters.current.splice(0).forEach((w) => w(st)); },
      { enableHighAccuracy: true, maximumAge: 10000, timeout: 20000 }
    );
  }, [accept, demoMode]);

  // Start silently only when permission was already granted (or a demo position is set); otherwise wait for a tap.
  useEffect(() => {
    if (!campuses?.length || status === 'unsupported') return;
    if (demoMode && readDemoLocation()) { start(); return; }
    let live = true;
    void navigator.permissions?.query({ name: 'geolocation' as PermissionName }).then((p) => {
      if (!live) return;
      if (p.state === 'granted') start();
      else if (p.state === 'denied') setStatus('denied');
      p.onchange = () => { if (p.state === 'denied') { setStatus('denied'); setFix(null); } };
    }).catch(() => undefined);
    return () => { live = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [campuses?.length]);

  // Demo panel changes take effect immediately.
  useEffect(() => {
    const onDemo = () => {
      const demo = demoMode ? readDemoLocation() : null;
      if (demo) accept(demo);
      else { setFix(null); setCampusId(null); setStatus('idle'); if (watch.current !== null) { navigator.geolocation.clearWatch(watch.current); watch.current = null; } }
    };
    window.addEventListener('uj-demo-location', onDemo);
    return () => window.removeEventListener('uj-demo-location', onDemo);
  }, [accept, demoMode]);

  useEffect(() => () => { if (watch.current !== null) navigator.geolocation.clearWatch(watch.current); }, []);

  /** Asks for the position (prompting if needed). Resolves with the outcome: 'on_campus', 'off_campus' or 'denied'. */
  const locate = useCallback(() => new Promise<LocationStatus>((resolve) => {
    if (status === 'on_campus') { resolve('on_campus'); return; }
    if ((status === 'off_campus' || status === 'denied') && watch.current !== null) { resolve(status); return; }
    waiters.current.push(resolve);
    setStatus((s) => (s === 'unsupported' ? s : 'locating'));
    start();
    if (watch.current === null && !(demoMode && readDemoLocation())) { waiters.current.splice(0).forEach((w) => w('unsupported')); }
  }), [start, status, demoMode]);

  return { status, fix, campusId, locate };
}
