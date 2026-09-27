import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { freshDb, startServer, type TestServer } from './helpers.ts';
import { db } from '../server/core/db.ts';
import { campusAt } from '../server/modules/campus/map.ts';
import { offset } from '../server/seed/geo.ts';

interface Route { found: boolean; reason_code?: string; from: { id: string } | null; distance_m: number; steps: Array<{ from: string; instruction_en: string }>; polyline: Array<[number, number]> }

let s: TestServer;
beforeAll(async () => { freshDb(); s = await startServer(); });
afterAll(async () => { await s.close(); });

const at = (id: string) => db().get<{ lat: number; lng: number }>('SELECT lat, lng FROM campus_locations WHERE id = ?', id)!;

describe('current location on the campus map', () => {
  it('knows which campus a position is on, and treats anything farther than ~150 m outside as off campus', () => {
    const gate = at('ryd_gate_main');
    expect(campusAt(gate.lat, gate.lng)).toBe('riyadh');
    const khb = at('khb_main');
    expect(campusAt(khb.lat, khb.lng)).toBe('khobar');
    const far = offset(gate.lat, gate.lng, 0, 2000);
    expect(campusAt(far[0], far[1])).toBeNull();
    expect(campusAt(24.7136, 46.6753)).toBeNull(); // central Riyadh, not the campus
  });

  it('routes from the student’s position: a short first leg to the nearest path, then the campus route', async () => {
    const gate = at('ryd_gate_main');
    const me = offset(gate.lat, gate.lng, 30, -45);
    const r = await s.as('u_student').post<Route>('/campus/map/route/from-point', { lat: me[0], lng: me[1], accuracy: 15, to: 'ryd_library', mode: 'walking' });
    expect(r.status).toBe(200);
    expect(r.body.data!.found).toBe(true);
    expect(r.body.data!.from!.id).toBe('@me');
    expect(r.body.data!.polyline[0]).toEqual([me[0], me[1]]);
    expect(r.body.data!.steps[0].from).toBe('@me');
    expect(r.body.data!.distance_m).toBeGreaterThan(20);
  });

  it('refuses off-campus positions, other-campus destinations and very imprecise fixes', async () => {
    const off = await s.as('u_student').post<Route>('/campus/map/route/from-point', { lat: 24.7136, lng: 46.6753, to: 'ryd_library' });
    expect(off.body.data!.found).toBe(false);
    expect(off.body.data!.reason_code).toBe('off_campus');
    const khb = at('khb_main');
    expect((await s.as('u_student').post<Route>('/campus/map/route/from-point', { lat: khb.lat, lng: khb.lng, to: 'ryd_library' })).body.data!.reason_code).toBe('cross_campus');
    const gate = at('ryd_gate_main');
    expect((await s.as('u_student').post<Route>('/campus/map/route/from-point', { lat: gate.lat, lng: gate.lng, accuracy: 900, to: 'ryd_library' })).body.data!.reason_code).toBe('low_accuracy');
    expect((await s.as('u_student').post('/campus/map/route/from-point', { lat: 'x', lng: 1, to: 'ryd_library' })).status).toBe(400);
  });

  it('never stores the position', async () => {
    const before = db().count('audit_events');
    const gate = at('ryd_gate_main');
    await s.as('u_student').post('/campus/map/route/from-point', { lat: gate.lat, lng: gate.lng, to: 'ryd_library' });
    expect(db().count('audit_events')).toBe(before);
  });
});
