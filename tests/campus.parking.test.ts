import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { freshDb, startServer, type TestServer } from './helpers.ts';
import { db } from '../server/core/db.ts';
import { runMigrations } from '../server/core/migrations.ts';
import { setSetting } from '../server/core/settings.ts';

interface Bay { id: string; n: number; kind: string; polygon: Array<[number, number]>; status: string; since: string }
interface Lot { id: string; total: number; usable: number; free: number; occupied: number; unknown: number; closed: number; level: string; trend: string; full_by: string | null; detection: string; polygon: Array<[number, number]> | null; walk: { meters: number; minutes: number } | null; by_kind: Record<string, { total: number; free: number }>; bays?: Bay[] }
interface Parking { mode: string; time: string; lots: Lot[]; totals: { total: number; free: number }; can_manage: boolean }

let s: TestServer;
beforeAll(async () => { freshDb(); s = await startServer(); });
afterAll(async () => { await s.close(); });

describe('parking occupancy', () => {
  it('lays out 100–200 bays in the big lots and counts every bay exactly once', async () => {
    const r = await s.as('u_student').get<Parking>('/campus/map/parking?campus=riyadh&bays=1');
    expect(r.status).toBe(200);
    const lots = new Map(r.body.data!.lots.map((l) => [l.id, l]));
    expect(lots.get('ryd_parking_students')!.total).toBeGreaterThanOrEqual(150);
    expect(lots.get('ryd_parking_north')!.total).toBeGreaterThanOrEqual(100);
    for (const l of r.body.data!.lots) {
      expect(l.free + l.occupied + l.unknown + l.closed).toBe(l.total);
      if (l.detection === 'bay_sensor') {
        expect(l.bays!.length).toBe(l.total);
        expect(l.bays!.every((b) => b.polygon.length === 4)).toBe(true);
        expect(l.bays!.filter((b) => b.status === 'free').length).toBe(l.free);
      }
    }
    expect(lots.get('ryd_parking_najd')!.detection).toBe('entry_exit');
    expect(lots.get('ryd_parking_north')!.closed).toBe(3);
    expect(lots.get('ryd_parking')!.by_kind.disabled.total).toBe(2);
  });

  it('follows the university day: nearly empty at dawn, busy mid-morning, emptying at night', async () => {
    const at = async (t: string) => (await s.as('u_student').get<Parking>(`/campus/map/parking?campus=riyadh&at=${t}`)).body.data!;
    const dawn = await at('06:30'), morning = await at('10:00'), night = await at('20:30');
    const occ = (p: Parking) => p.totals.total - p.totals.free;
    expect(occ(morning)).toBeGreaterThan(occ(dawn) * 3);
    expect(occ(night)).toBeLessThan(occ(morning) / 2);
    expect(morning.mode).toBe('replay');
    const staff = morning.lots.find((l) => l.id === 'ryd_parking_2')!;
    expect(['full', 'limited']).toContain(staff.level);
    const live = (await s.as('u_student').get<Parking>('/campus/map/parking?campus=riyadh')).body.data!;
    expect(live.mode).toBe('live');
    expect(live.time).toBe('09:00');
  });

  it('bays next to the entrance fill before the far end of the lot', async () => {
    const r = (await s.as('u_student').get<Parking>('/campus/map/parking?campus=riyadh&at=08:30&bays=1')).body.data!;
    const lot = r.lots.find((l) => l.id === 'ryd_parking_students')!;
    const ranks = new Map(db().all<{ id: string; fill_rank: number }>("SELECT id, fill_rank FROM parking_bays WHERE lot_id = 'ryd_parking_students'").map((b) => [b.id, b.fill_rank]));
    const near = lot.bays!.filter((b) => ranks.get(b.id)! < 0.25), far = lot.bays!.filter((b) => ranks.get(b.id)! > 0.75);
    const share = (xs: Bay[]) => xs.filter((b) => b.status === 'occupied').length / xs.length;
    expect(share(near)).toBeGreaterThan(share(far));
  });

  it('estimates walking time to a destination and lets only security close bays', async () => {
    const r = (await s.as('u_student').get<Parking>('/campus/map/parking?campus=riyadh&to=ryd_bldg_a')).body.data!;
    expect(r.lots.find((l) => l.id === 'ryd_parking')!.walk!.minutes).toBeGreaterThan(0);
    expect(r.can_manage).toBe(false);
    expect((await s.as('u_student').post('/campus/map/parking/bays/ryd_parking_b010', { closed: true })).status).toBe(403);
    const sec = await s.as('u_security').post('/campus/map/parking/bays/ryd_parking_b010', { closed: true, reason: 'Delivery bay today' });
    expect(sec.status).toBe(200);
    const after = (await s.as('u_student').get<Parking>('/campus/map/parking?campus=riyadh&bays=1')).body.data!;
    expect(after.lots.find((l) => l.id === 'ryd_parking')!.bays!.find((b) => b.id === 'ryd_parking_b010')!.status).toBe('closed');
  });

  it('Khobar gets a sensor lot too, and the migration adds parking to an existing database once', async () => {
    const k = (await s.as('u_student2').get<Parking>('/campus/map/parking')).body.data!;
    expect(k.lots.map((l) => l.id)).toEqual(['khb_parking']);
    expect(k.lots[0].polygon).not.toBeNull();
    db().exec('DELETE FROM parking_bays'); db().exec('DELETE FROM parking_lots');
    setSetting('migrations_applied', ['community-social-v1']);
    expect(runMigrations(db())).toEqual(['parking-v1']);
    expect(db().count('parking_lots')).toBe(7);
    expect(runMigrations(db())).toEqual([]);
  });
});
