import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { freshDb, startServer, type TestServer } from './helpers.ts';
import { computeRoute } from '../server/modules/campus/map.ts';
import { upsertEntry } from '../server/core/calendar.ts';
import type { RouteResult } from '../server/modules/campus/map.ts';

let s: TestServer;
beforeAll(async () => { freshDb(); s = await startServer(); });
afterAll(async () => { await s.close(); });

describe('campus routing (Dijkstra over path_edges)', () => {
  it('finds a walking route between two named places with steps and a polyline', async () => {
    const r = await s.as('u_student').get<RouteResult>('/campus/map/route?from=ryd_gate_main&to=ryd_library&mode=walking');
    expect(r.status).toBe(200);
    const d = r.body.data!;
    expect(d.found).toBe(true);
    expect(d.distance_m).toBeGreaterThan(0);
    expect(d.duration_min).toBe(Math.max(1, Math.round(d.distance_m / 1.3 / 60)));
    expect(d.polyline.length).toBeGreaterThanOrEqual(2);
    expect(d.steps.length).toBeGreaterThan(0);
    expect(d.steps[d.steps.length - 1].to).toBe('ryd_library');
    expect(d.polyline[0]).toEqual([d.from!.lat, d.from!.lng]);
  });

  it('accessible mode avoids stairs: a floor-2 room in a building with an elevator is reachable, one without is not', () => {
    const walk = computeRoute('ryd_gate_main', 'ryd_room_c220', 'walking');
    expect(walk.found).toBe(true);
    expect(walk.stairsSegments).toBe(1);
    expect(walk.steps.some((st) => st.kind === 'stairs')).toBe(true);
    const acc = computeRoute('ryd_gate_main', 'ryd_room_c220', 'accessible');
    expect(acc.found).toBe(true);
    expect(acc.stairsSegments).toBe(0);
    expect(acc.steps.some((st) => st.kind === 'elevator')).toBe(true);
    expect(acc.steps.some((st) => st.kind === 'stairs')).toBe(false);
    expect(acc.distance_m).toBeGreaterThanOrEqual(walk.distance_m);
    expect(acc.duration_min).toBe(Math.max(1, Math.round(acc.distance_m / 1.0 / 60)));
    // Tuwaiq (blocks E–H) has stairs only in the demo graph → no step-free route, with an explanation and no polyline
    const noLift = computeRoute('ryd_gate_main', 'ryd_room_b204', 'accessible');
    expect(noLift.found).toBe(false);
    expect(noLift.reason_code).toBe('no_step_free_route');
    expect(noLift.polyline.length).toBe(0);
    expect(computeRoute('ryd_gate_main', 'ryd_room_b204', 'walking').found).toBe(true);
    // unknown accessibility is disclosed
    expect(typeof acc.unknownAccessibilitySegments).toBe('number');
  });

  it('unreachable maintenance store returns found:false and never a straight line', async () => {
    const r = await s.as('u_student').get<RouteResult>('/campus/map/route?from=ryd_library&to=ryd_old_store');
    expect(r.status).toBe(200);
    expect(r.body.data!.found).toBe(false);
    expect(r.body.data!.reason_code).toBe('no_edges');
    expect(r.body.data!.polyline).toEqual([]);
    expect(r.body.data!.steps).toEqual([]);
  });

  it('refuses cross-campus routes with an explanation', () => {
    const r = computeRoute('ryd_library', 'khb_library', 'walking');
    expect(r.found).toBe(false);
    expect(r.reason_code).toBe('cross_campus');
  });

  it('Khobar synthetic graph routes and labels geometry as synthetic', async () => {
    const r = await s.as('u_student2').get<RouteResult>('/campus/map/route?from=khb_gate&to=khb_room_e205&mode=accessible');
    expect(r.body.data!.found).toBe(true);
    expect(r.body.data!.steps.some((st) => st.kind === 'elevator')).toBe(true);
    expect(r.body.data!.warnings.some((w) => /Khobar/.test(w))).toBe(true);
    const locs = await s.as('u_student2').get<Array<{ id: string; geometry_status: string; polygon?: unknown }>>('/campus/map/locations?campus=khobar');
    expect(locs.body.data!.every((l) => l.geometry_status === 'synthetic')).toBe(true);
    const ryd = await s.as('u_student').get<Array<{ id: string; geometry_status: string; polygon?: number[][] | null }>>('/campus/map/locations?campus=riyadh&kind=building');
    expect(ryd.body.data!.some((l) => l.geometry_status === 'osm' && Array.isArray(l.polygon) && l.polygon.length > 3)).toBe(true);
  });

  it('search includes the building name for rooms and next-class prefill reads the calendar', async () => {
    const q = await s.as('u_student').get<Array<{ id: string; building_name_en: string | null }>>('/campus/map/locations?campus=riyadh&q=auditorium');
    expect(q.body.data!.some((l) => l.id === 'ryd_room_c220' && !!l.building_name_en)).toBe(true);
    upsertEntry('u_student', { source_type: 'section', source_id: 'sec_map_test:2026-09-28:09:30', title: 'SWE 302 (test)', kind: 'class', start_at: '2026-09-28T09:30:00+03:00', end_at: '2026-09-28T10:45:00+03:00', location_id: 'ryd_room_c115', immovable: true });
    const nc = await s.as('u_student').get<{ entry: { location_id: string } | null; location: { id: string } | null }>('/campus/map/next-class');
    expect(nc.status).toBe(200);
    expect(nc.body.data!.location?.id).toBeTruthy();
  });
});

describe('Riyadh campus layer from the annotated campus map', () => {
  it('has the five numbered gates and the labelled buildings', async () => {
    const r = await s.as('u_student').get<Array<{ id: string; name_en: string; kind: string }>>('/campus/map/locations?campus=riyadh');
    const names = r.body.data!.map((x) => x.name_en);
    for (const n of [1, 2, 3, 4, 5]) expect(names.some((x) => new RegExp(`^Gate ${n}\\b`).test(x))).toBe(true);
    for (const b of ['Najd Building', 'Tuwaiq Building', 'Main Building', 'Library', 'Sports Center', 'YU Mosque', 'Ahad Auditorium', 'Al Yamamah Hall', 'E203 Classroom', 'C004 Chemistry Lab']) expect(names.some((x) => x.startsWith(b))).toBe(true);
  });

  it('every pair of places is connected and no route cuts through an unrelated building', async () => {
    const r = await s.as('u_student').get<Array<{ id: string; kind: string; building_id: string | null }>>('/campus/map/locations?campus=riyadh');
    const places = r.body.data!.filter((x) => !x.building_id && x.id !== 'ryd_old_store');
    const relayKinds = new Set(['gate', 'entrance']);
    const kindOf = new Map(places.map((p) => [p.id, p.kind]));
    let checked = 0;
    for (const a of places) for (const b of places) {
      if (a.id === b.id) continue;
      const route = computeRoute(a.id, b.id, 'walking');
      expect(route.found, `${a.id} -> ${b.id}`).toBe(true);
      const through = route.steps.slice(0, -1).map((st) => st.to).filter((id) => kindOf.has(id) && !relayKinds.has(kindOf.get(id)!));
      expect(through, `${a.id} -> ${b.id} passes through ${through.join(', ')}`).toEqual([]);
      checked++;
    }
    expect(checked).toBeGreaterThan(900);
  });
});
