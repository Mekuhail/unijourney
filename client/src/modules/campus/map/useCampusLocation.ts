import { useCallback, useEffect, useRef, useState } from 'react';
import type { Campus } from '../types';

/**
 * The student's live position for the campus map. It comes from the device (GPS / Wi-Fi) through `watchPosition`, so
 * the blue dot moves as they walk, and it is shown wherever they are: on campus, at home, or on the other campus.
 * The position never leaves the device except inside a directions request, and it is never stored.
 *
 * Demo mode can still pin a simulated position (Demo panel), but only when someone picks one explicitly.
 */
export interface Fix { lat: number; lng: number; accuracy: number; heading: number | null; spot?: string }
/** `on_campus` / `off_campus` both mean "we have a position"; they only say where it is. */
export type LocationStatus = 'unsupported' | 'denied' | 'unavailable' | 'idle' | 'locating' | 'on_campus' | 'off_campus';

export const NEAR_CAMPUS_M = 150;
// v2: simulated positions saved by the old Demo panel are ignored, so the real device location is the default again.
const DEMO_KEY = 'uj.demoLocation.v2';

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

/** The campus a position is on (inside the boundary or within NEAR_CAMPUS_M of it), or null when elsewhere. */
export function campusFor(fix: Fix, campuses: Campus[]): string | null {
  const p: [number, number] = [fix.lat, fix.lng];
  for (const c of campuses) {
    if (c.boundary.length >= 3) {
      if (inside(p, c.boundary) || c.boundary.some((a, i) => metersToSegment(p, a, c.boundary[(i + 1) % c.boundary.length]) <= NEAR_CAMPUS_M)) return c.id;
    } else if (haversine(p, [c.lat, c.lng]) <= 700) return c.id;
  }
  return null;
}

/** Straight-line distance in metres from a position to the nearest point of a campus (0 when on it). */
export function distanceToCampus(fix: Fix, c: Campus): number {
  const p: [number, number] = [fix.lat, fix.lng];
  if (c.boundary.length >= 3) return inside(p, c.boundary) ? 0 : Math.min(...c.boundary.map((a, i) => metersToSegment(p, a, c.boundary[(i + 1) % c.boundary.length])));
  return haversine(p, [c.lat, c.lng]);
}

export function useCampusLocation(campuses: Campus[] | null, demoMode: boolean) {
  const [status, setStatus] = useState<LocationStatus>(() => (typeof navigator !== 'undefined' && 'geolocation' in navigator ? 'idle' : 'unsupported'));
  const [fix, setFix] = useState<Fix | null>(null);
  const [campusId, setCampusId] = useState<string | null>(null);
  const watch = useRef<number | null>(null);
  const waiters = useRef<Array<(s: LocationStatus) => void>>([]);
  const campusesRef = useRef(campuses);
  campusesRef.current = campuses;
  const settle = (s: LocationStatus) => waiters.current.splice(0).forEach((w) => w(s));

  const accept = useCallback((f: Fix) => {
    const c = campusFor(f, campusesRef.current ?? []);
    const st: LocationStatus = c ? 'on_campus' : 'off_campus';
    setFix(f); setCampusId(c); setStatus(st);
    settle(st);
  }, []);

  const stop = () => { if (watch.current !== null) { navigator.geolocation.clearWatch(watch.current); watch.current = null; } };

  const start = useCallback(() => {
    const demo = demoMode ? readDemoLocation() : null;
    if (demo) { stop(); accept(demo); return; }
    if (!('geolocation' in navigator) || watch.current !== null) return;
    watch.current = navigator.geolocation.watchPosition(
      (p) => accept({ lat: p.coords.latitude, lng: p.coords.longitude, accuracy: p.coords.accuracy, heading: Number.isFinite(p.coords.heading) ? p.coords.heading : null }),
      (e) => {
        if (e.code === e.PERMISSION_DENIED) { stop(); setStatus('denied'); setFix(null); setCampusId(null); settle('denied'); return; }
        // A timeout or a lost signal keeps the last known position; without one, say it is unavailable.
        setFix((f) => { if (!f) { setStatus('unavailable'); settle('unavailable'); } return f; });
      },
      { enableHighAccuracy: true, maximumAge: 3000, timeout: 20000 }
    );
  }, [accept, demoMode]);

  // Start as soon as the map has its campuses. The browser asks for permission the first time; after that the dot
  // follows the device in real time. A site that was blocked stays blocked until the student changes it.
  useEffect(() => {
    if (!campuses?.length || status === 'unsupported') return;
    if (demoMode && readDemoLocation()) { start(); return; }
    let live = true;
    const perms = navigator.permissions?.query({ name: 'geolocation' as PermissionName });
    if (!perms) { setStatus('locating'); start(); return; }
    void perms.then((p) => {
      if (!live) return;
      if (p.state === 'denied') setStatus('denied');
      else { setStatus((s) => (s === 'idle' ? 'locating' : s)); start(); }
      p.onchange = () => { if (p.state === 'denied') { stop(); setStatus('denied'); setFix(null); } else if (p.state === 'granted') start(); };
    }).catch(() => { if (live) start(); });
    return () => { live = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [campuses?.length]);

  // Demo panel changes take effect immediately; clearing the simulation goes back to the real device position.
  useEffect(() => {
    const onDemo = () => {
      const demo = demoMode ? readDemoLocation() : null;
      if (demo) { stop(); accept(demo); return; }
      setFix(null); setCampusId(null); setStatus('locating'); stop(); start();
    };
    window.addEventListener('uj-demo-location', onDemo);
    return () => window.removeEventListener('uj-demo-location', onDemo);
  }, [accept, demoMode, start]);

  // Reset the ref too, so a remount (React StrictMode in development) starts a fresh watch.
  useEffect(() => () => stop(), []);

  /** Asks for the position (prompting if needed). Resolves with the outcome once there is one. */
  const locate = useCallback(() => new Promise<LocationStatus>((resolve) => {
    if (fix && (status === 'on_campus' || status === 'off_campus')) { resolve(status); return; }
    if (status === 'unsupported') { resolve('unsupported'); return; }
    waiters.current.push(resolve);
    setStatus('locating');
    if (status === 'denied' || status === 'unavailable') stop(); // try again: the student may have just allowed it
    start();
  }), [start, status, fix]);

  return { status, fix, campusId, locate };
}
