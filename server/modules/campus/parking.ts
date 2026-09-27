import { Router } from 'express';
import { z } from 'zod';
import type { Db } from '../../core/db.ts';
import { db, j, pj } from '../../core/db.ts';
import { h, ok, parse, forbidden, notFound } from '../../core/http.ts';
import { hasRole, requireUser } from '../../core/auth.ts';
import { now, nowIso, toLocal, localToIso } from '../../core/clock.ts';
import { audit } from '../../core/audit.ts';
import { registerMigration } from '../../core/migrations.ts';
import { px, RIYADH_PLACES } from '../../seed/riyadh-map.ts';
import { haversine, offset } from '../../seed/geo.ts';
import { computeRoute } from './map.ts';

/**
 * Parking occupancy for the campus map, modelled on FIWARE Smart Data Models (OffStreetParking / ParkingSpot:
 * totalSpotNumber, availableSpotNumber, status free|occupied|closed|unknown, occupancyDetectionType) and ParkAPI
 * (lot status with an explicit "no data").
 *
 * Bays are real geometry generated inside each lot outline traced from the campus map. Sensor readings are simulated:
 * a deterministic function of the bay, the date and the time, with a university-day arrival curve (peak 8–10am,
 * bays by the entrance fill first), turnover in the afternoon, and a small share of missed heartbeats reported as
 * "unknown" rather than guessed. Nothing is random at request time, so every screen and test agrees.
 */
export const parkingRouter = Router();

// ------------------------------------------------------------------ lot definitions
type Audience = 'student' | 'staff' | 'visitor' | 'mixed';
interface LotSpec { id: string; campus: 'riyadh' | 'khobar'; audience: Audience; detection: 'bay_sensor' | 'entry_exit'; entries: Array<[number, number]>; total?: number; closed?: number[] }

/** Entry points are in the lot's own drawing units (campus-map pixels for Riyadh, metres from the lot centre for Khobar). */
const LOTS: LotSpec[] = [
  { id: 'ryd_parking', campus: 'riyadh', audience: 'mixed', detection: 'bay_sensor', entries: [[1769, 560]] },
  { id: 'ryd_parking_2', campus: 'riyadh', audience: 'staff', detection: 'bay_sensor', entries: [[1769, 330]] },
  { id: 'ryd_parking_north', campus: 'riyadh', audience: 'student', detection: 'bay_sensor', entries: [[750, 142], [1285, 142]], closed: [70, 71, 72] },
  { id: 'ryd_parking_lot', campus: 'riyadh', audience: 'visitor', detection: 'bay_sensor', entries: [[1440, 142]] },
  { id: 'ryd_parking_students', campus: 'riyadh', audience: 'student', detection: 'bay_sensor', entries: [[1398, 822]] },
  { id: 'ryd_parking_najd', campus: 'riyadh', audience: 'student', detection: 'entry_exit', entries: [], total: 60 },
  { id: 'khb_parking', campus: 'khobar', audience: 'mixed', detection: 'bay_sensor', entries: [[0, -21]] }
];

const UNITS = { px: { w: 7.5, d: 15, a: 18, m: 2 }, m: { w: 2.5, d: 5, a: 6, m: 0.6 } } as const;

interface BayGeom { ordinal: number; corners: Array<[number, number]>; center: [number, number] }

/** Rows of 90° bays along the lot's long side: back-to-back row pairs separated by 6 m aisles. */
function layoutBays(rect: [number, number, number, number], unit: keyof typeof UNITS): BayGeom[] {
  const { w, d, a, m } = UNITS[unit];
  const [x1, y1, x2, y2] = rect;
  const horizontal = x2 - x1 >= y2 - y1;
  const L = horizontal ? x2 - x1 : y2 - y1;
  const S = horizontal ? y2 - y1 : x2 - x1;
  const rows: number[] = [];
  let off = m;
  while (off + 2 * d + a <= S - m) { rows.push(off, off + d + a); off += 2 * d + a; }
  if (S - m - off >= d + a) rows.push(off);
  if (!rows.length && S - 2 * m >= d) rows.push(m);
  const perRow = Math.floor((L - 2 * m) / w);
  const out: BayGeom[] = [];
  let n = 0;
  for (const r of rows) {
    for (let i = 0; i < perRow; i++) {
      const u0 = m + i * w, u1 = u0 + w, v0 = r, v1 = r + d;
      const pt = (u: number, v: number): [number, number] => (horizontal ? [x1 + u, y1 + v] : [x1 + v, y1 + u]);
      const corners = [pt(u0, v0), pt(u1, v0), pt(u1, v1), pt(u0, v1)];
      out.push({ ordinal: ++n, corners, center: pt((u0 + u1) / 2, (v0 + v1) / 2) });
    }
  }
  return out;
}

const round6 = (x: number) => Math.round(x * 1e6) / 1e6;

/** Creates lots and bays. Idempotent (INSERT OR IGNORE, fixed ids); used by the full seed and the 'parking-v1' migration. */
export function seedParking(d: Db) {
  for (const spec of LOTS) {
    const loc = d.get<{ id: string; lat: number; lng: number }>('SELECT id, lat, lng FROM campus_locations WHERE id = ?', spec.id);
    if (!loc) continue;
    let bays: BayGeom[] = [];
    let toLatLng: (p: [number, number]) => [number, number];
    let entries: Array<[number, number]> = spec.entries;
    if (spec.campus === 'riyadh') {
      const place = RIYADH_PLACES.find((p) => p.id === spec.id);
      toLatLng = ([x, y]) => px(x, y);
      if (place?.outline) {
        const xs = place.outline.map((p) => p[0]), ys = place.outline.map((p) => p[1]);
        bays = layoutBays([Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)], 'px');
      }
    } else {
      // Khobar: synthetic 60 × 42 m lot centred on the parking point (the Khobar map itself is approximate).
      toLatLng = ([east, north]) => offset(loc.lat, loc.lng, north, east);
      bays = layoutBays([-30, -21, 30, 21], 'm');
      entries = spec.entries;
    }
    const total = spec.detection === 'entry_exit' ? spec.total ?? 60 : bays.length;
    const entry = entries[0] ? toLatLng(entries[0]) : [loc.lat, loc.lng];
    d.insertOrIgnore('parking_lots', { location_id: spec.id, campus_id: spec.campus, audience: spec.audience, detection: spec.detection, total_bays: total, entry_lat: round6(entry[0]), entry_lng: round6(entry[1]), created_at: nowIso() });
    if (!bays.length) continue;
    // Rank by distance to the nearest entrance: drivers take the closest free bay, so those fill first.
    const dist = bays.map((b) => Math.min(...entries.map((e) => Math.hypot(b.center[0] - e[0], b.center[1] - e[1]))));
    const order = [...dist.keys()].sort((x, y) => dist[x] - dist[y]);
    const rank = new Map(order.map((idx, i) => [idx, i / Math.max(1, bays.length - 1)]));
    const disabled = new Set(order.slice(0, bays.length > 100 ? 4 : 2));
    const ev = new Set(spec.id === 'ryd_parking' ? order.slice(2, 4) : []);
    const visitorShare = spec.audience === 'mixed' ? new Set(order.slice(0, Math.round(bays.length * 0.3))) : new Set<number>();
    bays.forEach((b, idx) => {
      const kind = disabled.has(idx) ? 'disabled' : ev.has(idx) ? 'ev' : spec.audience === 'visitor' || visitorShare.has(idx) ? 'visitor' : spec.audience === 'staff' || spec.audience === 'mixed' ? 'staff' : 'standard';
      const poly = b.corners.map((c) => toLatLng(c).map(round6));
      const center = toLatLng(b.center);
      const closed = spec.closed?.includes(b.ordinal) ? 1 : 0;
      d.insertOrIgnore('parking_bays', { id: `${spec.id}_b${String(b.ordinal).padStart(3, '0')}`, lot_id: spec.id, ordinal: b.ordinal, kind, polygon: j(poly), center_lat: round6(center[0]), center_lng: round6(center[1]), fill_rank: Math.round((rank.get(idx) ?? 1) * 1000) / 1000, closed, closed_reason: closed ? 'Resurfacing (demo)' : null });
    });
  }
}

registerMigration({ id: 'parking-v1', description: 'parking lots and sensor bays for the campus map', run: (d) => seedParking(d) });

// ------------------------------------------------------------------ simulated sensors
function hash(s: string) {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
  return h >>> 0;
}
function rng(seed: number) {
  return () => { seed = (seed + 0x6d2b79f5) | 0; let t = Math.imul(seed ^ (seed >>> 15), 1 | seed); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
const gauss = (r: () => number) => { const u = Math.max(r(), 1e-9), v = r(); return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v); };

const PROFILE: Record<Audience, { peak: number; spread: number; stay: number; staySd: number; use: number }> = {
  student: { peak: 7.8, spread: 0.8, stay: 4.8, staySd: 0.3, use: 1 },
  staff: { peak: 7.2, spread: 0.4, stay: 7.6, staySd: 0.12, use: 0.99 },
  visitor: { peak: 10, spread: 1.4, stay: 1.2, staySd: 0.5, use: 0.8 },
  mixed: { peak: 7.6, spread: 0.7, stay: 5.4, staySd: 0.35, use: 1 }
};

interface BayRow { id: string; lot_id: string; ordinal: number; kind: string; polygon: string; center_lat: number; center_lng: number; fill_rank: number; closed: number; closed_reason: string | null }

/** A bay's parked stays for one day, in decimal hours (Riyadh time). */
function staysFor(bayId: string, rank: number, audience: Audience, date: string, weekday: number): Array<[number, number]> {
  const r = rng(hash(`${bayId}|${date}`));
  const weekend = weekday === 5 || weekday === 6; // Friday and Saturday
  const p = PROFILE[audience];
  const use = weekend ? 0.1 : p.use * (1 - 0.1 * rank);
  const out: Array<[number, number]> = [];
  // The lot by the mosque fills briefly for the midday (Dhuhr) prayer on teaching days.
  if (audience === 'visitor' && !weekend && r() < 0.6) { const a = 11.85 + gauss(r) * 0.08; out.push([a, a + 0.55 + r() * 0.2]); }
  if (r() < use) {
    const a = (weekend ? 11 : p.peak) + (rank - 0.3) * 1.5 + gauss(r) * p.spread * 0.55;
    const stay = Math.exp(Math.log(p.stay) + gauss(r) * p.staySd);
    out.push([a, Math.min(a + stay, 22)]);
    if (!weekend && a + stay < 15.5 && r() < 0.6) {
      const a2 = a + stay + 0.05 + r() * 0.9;
      out.push([a2, Math.min(a2 + Math.exp(Math.log(p.stay * 0.6) + gauss(r) * 0.4), 22)]);
    }
  }
  return out;
}

type Status = 'free' | 'occupied' | 'unknown' | 'closed';

function bayState(b: Pick<BayRow, 'id' | 'fill_rank' | 'closed'>, audience: Audience, date: string, weekday: number, hour: number): { status: Status; since: number } {
  if (b.closed) return { status: 'closed', since: 6 };
  // A sensor that missed its last heartbeat reports "unknown" for that half hour instead of a guess.
  if (hash(`${b.id}|${date}|${Math.floor(hour * 2)}`) % 1000 < 15) return { status: 'unknown', since: Math.floor(hour * 2) / 2 };
  const stays = staysFor(b.id, b.fill_rank, audience, date, weekday);
  let since = 6;
  for (const [a, e] of stays) {
    if (hour >= a && hour < e) return { status: 'occupied', since: a };
    if (hour >= e) since = e;
  }
  return { status: 'free', since: Math.max(6, since) };
}

interface Clock { date: string; weekday: number; hour: number; iso: string; live: boolean }

function clockFor(at?: string): Clock {
  const p = toLocal(now());
  const nowHour = p.hour + Number(p.time.slice(3, 5)) / 60;
  if (at && /^\d{2}:\d{2}$/.test(at)) {
    const [hh, mm] = at.split(':').map(Number);
    return { date: p.date, weekday: p.weekday, hour: hh + mm / 60, iso: new Date(localToIso(p.date, at)).toISOString(), live: false };
  }
  return { date: p.date, weekday: p.weekday, hour: nowHour, iso: nowIso(), live: true };
}

const hhmm = (h: number) => `${String(Math.floor(h)).padStart(2, '0')}:${String(Math.round((h % 1) * 60) % 60).padStart(2, '0')}`;

interface LotRow { location_id: string; campus_id: string; audience: Audience; detection: string; total_bays: number; entry_lat: number; entry_lng: number; name_en: string; name_ar: string; lat: number; lng: number; tags: string }

/** Entry/exit counters give a count, not bays: simulate the same arrival curve over virtual bays. */
function virtualBays(lot: LotRow): Array<Pick<BayRow, 'id' | 'fill_rank' | 'closed' | 'kind'>> {
  return Array.from({ length: lot.total_bays }, (_, i) => ({ id: `${lot.location_id}_v${i}`, fill_rank: i / Math.max(1, lot.total_bays - 1), closed: 0, kind: 'standard' }));
}

function summarise(lot: LotRow, bays: Array<Pick<BayRow, 'id' | 'fill_rank' | 'closed' | 'kind'>>, c: Clock) {
  const at = (hour: number) => {
    const counts = { free: 0, occupied: 0, unknown: 0, closed: 0 };
    const byKind: Record<string, { total: number; free: number }> = {};
    for (const b of bays) {
      const s = bayState(b, lot.audience, c.date, c.weekday, hour).status;
      counts[s]++;
      const k = (byKind[b.kind] ??= { total: 0, free: 0 });
      k.total++;
      if (s === 'free') k.free++;
    }
    return { counts, byKind };
  };
  const cur = at(c.hour);
  const usable = bays.length - cur.counts.closed;
  const threshold = Math.max(2, Math.ceil(usable * 0.05));
  const level = cur.counts.unknown > usable * 0.25 ? 'no_data' : cur.counts.free <= threshold ? 'full' : cur.counts.free / Math.max(1, usable) <= 0.2 ? 'limited' : 'available';
  const before = at(Math.max(6, c.hour - 0.25)).counts.occupied;
  const delta = cur.counts.occupied - before;
  const trend = delta > usable * 0.02 ? 'filling' : delta < -usable * 0.02 ? 'emptying' : 'steady';
  let full_by: string | null = null;
  if (level !== 'full' && trend !== 'emptying') {
    for (let hh = c.hour + 1 / 12; hh <= Math.min(c.hour + 3, 21); hh += 1 / 12) {
      if (at(hh).counts.free <= threshold) { full_by = hhmm(hh); break; }
    }
  }
  return { ...cur.counts, total: bays.length, usable, level, trend, full_by, by_kind: cur.byKind };
}

function lotRows(campus?: string) {
  return db().all<LotRow>(`SELECT p.*, l.name_en, l.name_ar, l.lat, l.lng, l.tags FROM parking_lots p JOIN campus_locations l ON l.id = p.location_id ${campus ? 'WHERE p.campus_id = ?' : ''} ORDER BY l.name_en`, ...(campus ? [campus] : []));
}

parkingRouter.get('/map/parking', h((req, res) => {
  const u = requireUser(req);
  const q = parse(z.object({ campus: z.enum(['riyadh', 'khobar']).optional(), at: z.string().regex(/^\d{2}:\d{2}$/).optional(), to: z.string().optional(), bays: z.string().optional() }), req.query);
  const c = clockFor(q.at);
  const target = q.to ? db().get<{ id: string; name_en: string; name_ar: string; lat: number; lng: number; campus_id: string }>('SELECT id, name_en, name_ar, lat, lng, campus_id FROM campus_locations WHERE id = ?', q.to) : null;
  const lots = lotRows(q.campus ?? u.campus_id).map((lot) => {
    const bays = lot.detection === 'bay_sensor' ? db().all<BayRow>('SELECT * FROM parking_bays WHERE lot_id = ? ORDER BY ordinal', lot.location_id) : [];
    const s = summarise(lot, bays.length ? bays : virtualBays(lot), c);
    let walk: { meters: number; minutes: number } | null = null;
    if (target && target.campus_id === lot.campus_id) {
      const r = computeRoute(lot.location_id, target.id, 'walking');
      walk = r.found ? { meters: r.distance_m, minutes: r.duration_min } : { meters: Math.round(haversine(lot.lat, lot.lng, target.lat, target.lng) * 1.3), minutes: Math.max(1, Math.round(haversine(lot.lat, lot.lng, target.lat, target.lng) * 1.3 / 80)) };
    }
    const tagged = pj<string[]>(lot.tags, []).find((t) => t.startsWith('polygon:'));
    // Lots without a traced outline (Khobar) get the rectangle that holds their bays.
    const corners = bays.flatMap((b) => pj<Array<[number, number]>>(b.polygon, []));
    const polygon = tagged ? pj<Array<[number, number]>>(tagged.slice(8), []) : corners.length ? (() => { const la = corners.map((c) => c[0]), ln = corners.map((c) => c[1]); const [a, b2, c2, d2] = [Math.min(...la), Math.max(...la), Math.min(...ln), Math.max(...ln)]; return [[a, c2], [a, d2], [b2, d2], [b2, c2]] as Array<[number, number]>; })() : null;
    return {
      id: lot.location_id, name_en: lot.name_en, name_ar: lot.name_ar, campus_id: lot.campus_id, audience: lot.audience, detection: lot.detection,
      lat: lot.lat, lng: lot.lng, entry: [lot.entry_lat, lot.entry_lng], polygon,
      ...s,
      walk,
      // Each sensor reports within seconds of a change; a heartbeat every 10 minutes proves it is alive.
      updated_at: new Date(new Date(c.iso).getTime() - (hash(`${lot.location_id}|${Math.floor(c.hour * 12)}`) % 90) * 1000).toISOString(),
      bays: q.bays ? bays.map((b) => { const st = bayState(b, lot.audience, c.date, c.weekday, c.hour); return { id: b.id, n: b.ordinal, kind: b.kind, polygon: pj<Array<[number, number]>>(b.polygon, []), status: st.status, since: hhmm(st.since), closed_reason: b.closed_reason }; }) : undefined
    };
  });
  const totals = lots.reduce((acc, l) => ({ total: acc.total + l.usable, free: acc.free + l.free }), { total: 0, free: 0 });
  ok(res, {
    mode: c.live ? 'live' : 'replay', observed_at: c.iso, time: hhmm(c.hour), date: c.date, weekday: c.weekday,
    target: target ? { id: target.id, name_en: target.name_en, name_ar: target.name_ar } : null,
    lots, totals, can_manage: hasRole(u, 'security'),
    note: 'Simulated bay sensors for the prototype. Lot outlines are traced from the campus map; bays are generated inside them.'
  });
}));

/** Campus security cones off a bay (maintenance, event) or reopens it. */
parkingRouter.post('/map/parking/bays/:id', h((req, res) => {
  const u = requireUser(req);
  if (!hasRole(u, 'security')) throw forbidden('Only campus security can close or reopen parking bays');
  const b = parse(z.object({ closed: z.boolean(), reason: z.string().trim().max(120).optional() }), req.body);
  const bay = db().get<BayRow>('SELECT * FROM parking_bays WHERE id = ?', req.params.id as string);
  if (!bay) throw notFound('Bay not found');
  db().update('parking_bays', bay.id, { closed: b.closed ? 1 : 0, closed_reason: b.closed ? (b.reason || 'Closed by campus security') : null });
  audit(u.id, b.closed ? 'parking.bay.close' : 'parking.bay.open', 'parking_bay', bay.id, { reason: b.reason ?? null });
  ok(res, { id: bay.id, closed: b.closed });
}));

