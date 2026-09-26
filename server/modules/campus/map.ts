import { Router } from 'express';
import { z } from 'zod';
import { db, pj } from '../../core/db.ts';
import { h, ok, parse, notFound, bad } from '../../core/http.ts';
import { requireUser } from '../../core/auth.ts';

import { haversine } from '../../seed/geo.ts';
import { nowLocalIso, type LocationRow } from './shared.ts';

export const mapRouter = Router();

// ------------------------------------------------------------------ graph
interface EdgeRow { id: string; campus_id: string; from_id: string; to_id: string; meters: number; kind: string; accessible: 'yes' | 'no' | 'unknown'; bidirectional: number; source: string }
interface Adj { to: string; edge: EdgeRow }

export type RouteMode = 'walking' | 'accessible';
export const WALK_SPEED_MPS: Record<RouteMode, number> = { walking: 1.3, accessible: 1.0 };

export interface RouteStep { from: string; from_name_en: string; from_name_ar: string; to: string; to_name_en: string; to_name_ar: string; kind: string; meters: number; instruction_en: string; instruction_ar: string; accessible: 'yes' | 'no' | 'unknown' }
export interface RouteResult {
  found: boolean;
  reason?: string;
  reason_code?: 'same_location' | 'cross_campus' | 'no_edges' | 'no_step_free_route' | 'disconnected' | 'unknown_location';
  mode: RouteMode;
  from: ReturnType<typeof publicLocation> | null;
  to: ReturnType<typeof publicLocation> | null;
  distance_m: number;
  duration_min: number;
  steps: RouteStep[];
  polyline: Array<[number, number]>;
  warnings: string[];
  unknownAccessibilitySegments: number;
  stairsSegments: number;
  nodes: number;
}

function polygonOf(l: LocationRow): Array<[number, number]> | null {
  const tag = pj<string[]>(l.tags, []).find((t) => t.startsWith('polygon:'));
  if (!tag) return null;
  try { return JSON.parse(tag.slice(8)) as Array<[number, number]>; } catch { return null; }
}

export function publicLocation(l: LocationRow, opts: { polygon?: boolean } = {}) {
  const tags = pj<string[]>(l.tags, []).filter((t) => !t.startsWith('polygon:'));
  const building = l.building_id ? db().get<LocationRow>('SELECT id, name_en, name_ar FROM campus_locations WHERE id = ?', l.building_id) : null;
  return {
    id: l.id, campus_id: l.campus_id, kind: l.kind, name_en: l.name_en, name_ar: l.name_ar, building_id: l.building_id,
    building_name_en: building?.name_en ?? null, building_name_ar: building?.name_ar ?? null, floor: l.floor, lat: l.lat, lng: l.lng,
    accessible: l.accessible, tags, description_en: l.description_en, geometry_status: l.geometry_status, searchable: !!l.searchable,
    polygon: opts.polygon === false ? undefined : polygonOf(l)
  };
}

function loadGraph(campusId: string) {
  const nodes = new Map<string, LocationRow>();
  for (const n of db().all<LocationRow>('SELECT * FROM campus_locations WHERE campus_id = ?', campusId)) nodes.set(n.id, n);
  const edges = db().all<EdgeRow>('SELECT * FROM path_edges WHERE campus_id = ?', campusId);
  return { nodes, edges };
}

function buildAdjacency(edges: EdgeRow[], mode: RouteMode): Map<string, Adj[]> {
  const adj = new Map<string, Adj[]>();
  const push = (a: string, b: string, edge: EdgeRow) => { if (!adj.has(a)) adj.set(a, []); adj.get(a)!.push({ to: b, edge }); };
  for (const e of edges) {
    if (mode === 'accessible' && (e.accessible === 'no' || e.kind === 'stairs')) continue;
    push(e.from_id, e.to_id, e);
    if (e.bidirectional) push(e.to_id, e.from_id, e);
  }
  return adj;
}

/** Tiny binary min-heap keyed on distance. */
class MinHeap {
  private a: Array<{ id: string; d: number }> = [];
  get size() { return this.a.length; }
  push(id: string, d: number) { this.a.push({ id, d }); let i = this.a.length - 1; while (i > 0) { const p = (i - 1) >> 1; if (this.a[p].d <= this.a[i].d) break; [this.a[p], this.a[i]] = [this.a[i], this.a[p]]; i = p; } }
  pop() { const top = this.a[0]; const last = this.a.pop()!; if (this.a.length) { this.a[0] = last; let i = 0; for (;;) { const l = 2 * i + 1, r = l + 1; let m = i; if (l < this.a.length && this.a[l].d < this.a[m].d) m = l; if (r < this.a.length && this.a[r].d < this.a[m].d) m = r; if (m === i) break; [this.a[m], this.a[i]] = [this.a[i], this.a[m]]; i = m; } } return top; }
}

/** Dijkstra over path_edges. Returns the ordered node ids and the edges used, or null when unreachable. */
/** `relay(node, next, prev)` decides whether the search may continue through `node` (the origin always may). */
export type Relay = (node: string, next: string, prev: string | undefined) => boolean;

export function dijkstra(adj: Map<string, Adj[]>, from: string, to: string, relay?: Relay): { nodes: string[]; edges: EdgeRow[]; meters: number } | null {
  const dist = new Map<string, number>([[from, 0]]);
  const prev = new Map<string, { node: string; edge: EdgeRow }>();
  const done = new Set<string>();
  const heap = new MinHeap();
  heap.push(from, 0);
  while (heap.size) {
    const { id, d } = heap.pop();
    if (done.has(id)) continue;
    done.add(id);
    if (id === to) break;
    for (const { to: nb, edge } of adj.get(id) ?? []) {
      if (relay && id !== from && !relay(id, nb, prev.get(id)?.node)) continue;
      const nd = d + edge.meters;
      if (nd < (dist.get(nb) ?? Infinity)) { dist.set(nb, nd); prev.set(nb, { node: id, edge }); heap.push(nb, nd); }
    }
  }
  if (!dist.has(to)) return null;
  const nodes: string[] = [to];
  const edges: EdgeRow[] = [];
  let cur = to;
  while (cur !== from) { const p = prev.get(cur)!; edges.unshift(p.edge); nodes.unshift(p.node); cur = p.node; }
  return { nodes, edges, meters: dist.get(to)! };
}

const KIND_EN: Record<string, string> = { walkway: 'walkway', road: 'service road', crossing: 'crossing', indoor: 'indoor corridor', stairs: 'stairs', elevator: 'elevator', ramp: 'ramp' };
const KIND_AR: Record<string, string> = { walkway: 'الممشى', road: 'طريق الخدمة', crossing: 'المعبر', indoor: 'الممر الداخلي', stairs: 'الدرج', elevator: 'المصعد', ramp: 'المنحدر' };

function instruction(kind: string, meters: number, to: LocationRow, isLast: boolean): { en: string; ar: string } {
  const m = Math.round(meters);
  const named = to.searchable === 1 || to.kind !== 'junction';
  const target = named ? to.name_en : null;
  const targetAr = named ? to.name_ar : null;
  switch (kind) {
    case 'stairs': return { en: `Take the stairs to ${target ?? 'the next floor'}${to.floor ? ` (floor ${to.floor})` : ''}`, ar: `اصعد الدرج إلى ${targetAr ?? 'الدور التالي'}${to.floor ? ` (الدور ${to.floor})` : ''}` };
    case 'elevator': return { en: `Take the elevator to ${target ?? 'the next floor'}${to.floor ? ` (floor ${to.floor})` : ''}`, ar: `استخدم المصعد إلى ${targetAr ?? 'الدور التالي'}${to.floor ? ` (الدور ${to.floor})` : ''}` };
    case 'ramp': return { en: `Use the step-free ramp to ${target ?? 'the entrance'} (${m} m)`, ar: `استخدم المنحدر إلى ${targetAr ?? 'المدخل'} (${m} م)` };
    case 'indoor': return { en: `Go inside to ${target ?? 'the corridor'} (${m} m indoors)`, ar: `ادخل إلى ${targetAr ?? 'الممر'} (${m} م داخل المبنى)` };
    case 'crossing': return { en: `Cross at the crossing towards ${target ?? 'the path'} (${m} m)`, ar: `اعبر المعبر باتجاه ${targetAr ?? 'المسار'} (${m} م)` };
    default:
      if (target) return { en: `${isLast ? 'Arrive at' : 'Walk to'} ${target} along the ${KIND_EN[kind] ?? kind} (${m} m)`, ar: `${isLast ? 'تصل إلى' : 'امشِ إلى'} ${targetAr} عبر ${KIND_AR[kind] ?? kind} (${m} م)` };
      return { en: `Continue along the ${KIND_EN[kind] ?? kind} (${m} m)`, ar: `تابع على ${KIND_AR[kind] ?? kind} (${m} م)` };
  }
}

/** Merge consecutive edges of the same kind between unnamed junctions into readable steps. */
function toSteps(path: { nodes: string[]; edges: EdgeRow[] }, nodes: Map<string, LocationRow>): RouteStep[] {
  const steps: RouteStep[] = [];
  let cur: { from: string; kind: string; meters: number; acc: 'yes' | 'no' | 'unknown' } | null = null;
  const worst = (a: 'yes' | 'no' | 'unknown', b: 'yes' | 'no' | 'unknown') => (a === 'no' || b === 'no' ? 'no' : a === 'unknown' || b === 'unknown' ? 'unknown' : 'yes');
  const flush = (toId: string, isLast: boolean) => {
    if (!cur) return;
    const from = nodes.get(cur.from)!, to = nodes.get(toId)!;
    const ins = instruction(cur.kind, cur.meters, to, isLast);
    steps.push({ from: from.id, from_name_en: from.name_en, from_name_ar: from.name_ar, to: to.id, to_name_en: to.name_en, to_name_ar: to.name_ar, kind: cur.kind, meters: Math.round(cur.meters), instruction_en: ins.en, instruction_ar: ins.ar, accessible: cur.acc });
    cur = null;
  };
  for (let i = 0; i < path.edges.length; i++) {
    const e = path.edges[i];
    const a = path.nodes[i], b = path.nodes[i + 1];
    const bNode = nodes.get(b)!;
    if (cur && cur.kind === e.kind) { cur.meters += e.meters; cur.acc = worst(cur.acc, e.accessible); }
    else { flush(a, false); cur = { from: a, kind: e.kind, meters: e.meters, acc: e.accessible }; }
    const named = bNode.kind !== 'junction';
    if (named || i === path.edges.length - 1) flush(b, i === path.edges.length - 1);
  }
  return steps;
}

export function computeRoute(fromId: string, toId: string, mode: RouteMode): RouteResult {
  const from = db().get<LocationRow>('SELECT * FROM campus_locations WHERE id = ?', fromId);
  const to = db().get<LocationRow>('SELECT * FROM campus_locations WHERE id = ?', toId);
  const base: RouteResult = { found: false, mode, from: from ? publicLocation(from, { polygon: false }) : null, to: to ? publicLocation(to, { polygon: false }) : null, distance_m: 0, duration_min: 0, steps: [], polyline: [], warnings: [], unknownAccessibilitySegments: 0, stairsSegments: 0, nodes: 0 };
  if (!from || !to) return { ...base, reason_code: 'unknown_location', reason: 'Origin or destination is not a known campus location.' };
  if (from.id === to.id) return { ...base, found: true, reason_code: 'same_location', reason: 'You are already at the destination.', polyline: [[from.lat, from.lng]] };
  if (from.campus_id !== to.campus_id) return { ...base, reason_code: 'cross_campus', reason: `${from.name_en} is on the ${from.campus_id} campus and ${to.name_en} on the ${to.campus_id} campus. Walking routes are computed within one campus only – travel between Riyadh and Al Khobar is a ~400 km trip (car/flight), not shown here.` };
  const { nodes, edges } = loadGraph(from.campus_id);
  const degree = (id: string) => edges.filter((e) => e.from_id === id || e.to_id === id).length;
  if (degree(to.id) === 0) return { ...base, reason_code: 'no_edges', reason: `${to.name_en} has no connected pedestrian path in the campus graph, so no walking route can be shown. (No straight-line fallback is drawn: it would not be a real path.)` };
  if (degree(from.id) === 0) return { ...base, reason_code: 'no_edges', reason: `${from.name_en} has no connected pedestrian path in the campus graph.` };
  const adj = buildAdjacency(edges, mode);
  // Places are destinations, not shortcuts: only path junctions, gates and entrances relay a route; a building relays
  // only into (or out of) its own rooms. Falls back to the unrestricted graph if that leaves no path.
  const relay: Relay = (id, nb, prevId) => {
    const n = nodes.get(id);
    if (!n) return true;
    if (n.kind === 'junction' || n.kind === 'entrance' || n.kind === 'gate') return true;
    const isRoomOf = (child: string | undefined, parent: string) => { const c = child ? nodes.get(child) : undefined; return !!c && c.building_id === parent && c.kind !== 'entrance'; };
    if (isRoomOf(nb, id)) return true;                 // building -> one of its rooms
    if (n.building_id && n.building_id === nb) return true; // room -> its building
    if (isRoomOf(prevId, id)) return true;             // leaving a building after coming out of one of its rooms
    return false;
  };
  const path = dijkstra(adj, from.id, to.id, relay) ?? dijkstra(adj, from.id, to.id);
  if (!path) {
    if (mode === 'accessible' && dijkstra(buildAdjacency(edges, 'walking'), from.id, to.id)) {
      return { ...base, reason_code: 'no_step_free_route', reason: `No step-free route: reaching ${to.name_en} requires stairs and no elevator or ramp is recorded for its building. A walking route exists – switch mode to see it, or contact Student Affairs for assistance (demo data: accessibility attributes are unverified).` };
    }
    return { ...base, reason_code: 'disconnected', reason: `No path connects ${from.name_en} and ${to.name_en} in the campus graph.` };
  }
  const steps = toSteps(path, nodes);
  const unknown = path.edges.filter((e) => e.accessible === 'unknown').length;
  const stairs = path.edges.filter((e) => e.kind === 'stairs').length;
  const warnings: string[] = [];
  if (stairs > 0) warnings.push(`This route uses stairs (${stairs} segment${stairs > 1 ? 's' : ''}). Switch to accessible mode for a step-free route where one exists.`);
  if (unknown > 0) warnings.push(`${unknown} segment${unknown > 1 ? 's have' : ' has'} unverified accessibility (OpenStreetMap or synthetic connector without wheelchair tags).`);
  if (path.nodes.some((n) => nodes.get(n)?.geometry_status === 'synthetic')) warnings.push('Rooms are placed at their building footprint and indoor segments are synthetic; floor plans are not modelled.');
  if (from.campus_id === 'khobar') warnings.push('Khobar campus layout is a synthetic approximation (centre from OpenStreetMap neighbourhood node); positions are unverified.');
  const speed = WALK_SPEED_MPS[mode];
  return {
    ...base,
    found: true,
    distance_m: Math.round(path.meters),
    duration_min: Math.max(1, Math.round(path.meters / speed / 60)),
    steps,
    polyline: path.nodes.map((n) => { const l = nodes.get(n)!; return [l.lat, l.lng] as [number, number]; }),
    warnings,
    unknownAccessibilitySegments: unknown,
    stairsSegments: stairs,
    nodes: path.nodes.length
  };
}

// ------------------------------------------------------------------ routes
mapRouter.get('/map/campuses', h((_req, res) => {
  const rows = db().all('SELECT * FROM campuses ORDER BY id');
  ok(res, rows.map((c) => ({ ...c, boundary: pj<Array<[number, number]>>(c.boundary, []), locations: db().count('campus_locations', 'campus_id = ? AND searchable = 1', c.id), edges: db().count('path_edges', 'campus_id = ?', c.id) })));
}));

mapRouter.get('/map/locations', h((req, res) => {
  const q = parse(z.object({ campus: z.string().optional(), q: z.string().optional(), kind: z.string().optional(), all: z.string().optional() }), req.query);
  const where: string[] = [q.all === '1' ? '1=1' : 'searchable = 1'];
  const params: unknown[] = [];
  if (q.campus) { where.push('campus_id = ?'); params.push(q.campus); }
  if (q.kind) { where.push('kind = ?'); params.push(q.kind); }
  let rows = db().all<LocationRow>(`SELECT * FROM campus_locations WHERE ${where.join(' AND ')} ORDER BY kind, name_en`, ...params);
  if (q.q && q.q.trim()) {
    const needle = q.q.trim().toLowerCase();
    rows = rows.filter((l) => {
      const b = l.building_id ? db().get<LocationRow>('SELECT name_en, name_ar FROM campus_locations WHERE id = ?', l.building_id) : null;
      const hay = [l.name_en, l.name_ar, l.kind, l.id, ...pj<string[]>(l.tags, []).filter((t) => !t.startsWith('polygon:')), b?.name_en ?? '', b?.name_ar ?? ''].join(' ').toLowerCase();
      return needle.split(/\s+/).every((w) => hay.includes(w));
    });
  }
  ok(res, rows.map((l) => publicLocation(l)));
}));

mapRouter.get('/map/locations/:id', h((req, res) => {
  const l = db().get<LocationRow>('SELECT * FROM campus_locations WHERE id = ?', req.params.id as string);
  if (!l) throw notFound('Location not found');
  const edges = db().count('path_edges', 'from_id = ? OR to_id = ?', l.id, l.id);
  const rooms = db().all<LocationRow>('SELECT * FROM campus_locations WHERE building_id = ? ORDER BY floor, name_en', l.id).map((r) => publicLocation(r, { polygon: false }));
  const upcoming = db().all("SELECT id, title_en, title_ar, start_at, end_at, kind FROM events WHERE location_id = ? AND end_at >= ? AND status <> 'cancelled' AND kind <> 'personal' ORDER BY start_at LIMIT 5", l.id, nowLocalIso());
  ok(res, { ...publicLocation(l), connected_edges: edges, reachable: edges > 0, rooms, upcoming_events: upcoming });
}));

mapRouter.get('/map/route', h((req, res) => {
  const q = parse(z.object({ from: z.string().min(1), to: z.string().min(1), mode: z.enum(['walking', 'accessible']).optional(), campus: z.string().optional() }), req.query);
  ok(res, computeRoute(q.from, q.to, q.mode ?? 'walking'));
}));

mapRouter.get('/map/next-class', h((req, res) => {
  const u = requireUser(req);
  const now = nowLocalIso();
  const entry = db().get("SELECT * FROM calendar_entries WHERE owner_id = ? AND kind = 'class' AND end_at >= ? AND location_id IS NOT NULL ORDER BY start_at LIMIT 1", u.id, now)
    ?? db().get("SELECT * FROM calendar_entries WHERE owner_id = ? AND kind IN ('event','exam') AND end_at >= ? AND location_id IS NOT NULL ORDER BY start_at LIMIT 1", u.id, now);
  if (!entry) return ok(res, { entry: null, location: null, note: 'No upcoming class with a room on your calendar.' });
  const loc = db().get<LocationRow>('SELECT * FROM campus_locations WHERE id = ?', entry.location_id as string);
  ok(res, { entry: { ...entry, immovable: !!entry.immovable, meta: pj(entry.meta, {}) }, location: loc ? publicLocation(loc, { polygon: false }) : null });
}));

mapRouter.get('/map/nearby', h((req, res) => {
  const q = parse(z.object({ location: z.string().min(1), radius: z.coerce.number().min(20).max(1000).optional() }), req.query);
  const l = db().get<LocationRow>('SELECT * FROM campus_locations WHERE id = ?', q.location);
  if (!l) throw notFound('Location not found');
  const radius = q.radius ?? 150;
  const rows = db().all<LocationRow>('SELECT * FROM campus_locations WHERE campus_id = ? AND searchable = 1 AND id <> ? AND building_id IS NULL', l.campus_id, l.id)
    .map((r) => ({ loc: publicLocation(r, { polygon: false }), meters: Math.round(haversine(l.lat, l.lng, r.lat, r.lng)) }))
    .filter((r) => r.meters <= radius)
    .sort((a, b) => a.meters - b.meters);
  ok(res, { center: publicLocation(l, { polygon: false }), radius_m: radius, items: rows });
}));

// guard against accidental misuse: /map/route requires both ends
mapRouter.get('/map', h(() => { throw bad('Use /map/campuses, /map/locations, /map/route'); }));
