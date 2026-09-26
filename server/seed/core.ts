import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { Db } from '../core/db.ts';
import { j } from '../core/db.ts';
import { nowIso } from '../core/clock.ts';
import { haversine, offset } from './geo.ts';
import type { SeedContext } from './context.ts';
import { RIYADH_PLACES, RIYADH_ROOMS, RIYADH_LIFT_BUILDINGS, RIYADH_FIELD_WAY, RIYADH_WALKWAYS, px, pxPoly } from './riyadh-map.ts';

const here = path.dirname(fileURLToPath(import.meta.url));

// ------------------------------------------------------------------ personas (synthetic)
export function seedUsers(d: Db): SeedContext['users'] {
  const now = nowIso();
  const base = { locale: 'en', preferences: '{}', created_at: now };
  const rows = [
    { id: 'u_student', roles: ['student'], name_en: 'Sara Al-Otaibi', name_ar: 'سارة العتيبي', email: 'sara.demo@student.yu-demo.invalid', student_no: '202400118', program_id: 'bse', campus_id: 'riyadh', stage: 'current', level: 6, interests: ['web development', 'ai', 'hackathons', 'ui/ux'], skills: ['JavaScript', 'React', 'Java', 'SQL', 'Figma'], avatar_color: '#F0762B', department: null },
    { id: 'u_lead', roles: ['student', 'club_lead'], name_en: 'Layan Al-Harbi', name_ar: 'ليان الحربي', email: 'layan.demo@student.yu-demo.invalid', student_no: '202300077', program_id: 'bse', campus_id: 'riyadh', stage: 'current', level: 7, interests: ['community', 'web development', 'public speaking'], skills: ['TypeScript', 'Node.js', 'Leadership'], avatar_color: '#2E9E6B', department: null },
    { id: 'u_student2', roles: ['student'], name_en: 'Faisal Al-Dossari', name_ar: 'فيصل الدوسري', email: 'faisal.demo@student.yu-demo.invalid', student_no: '202500042', program_id: 'bcne', campus_id: 'khobar', stage: 'current', level: 3, interests: ['cybersecurity', 'iot', 'networking'], skills: ['Python', 'Linux', 'Packet Tracer'], avatar_color: '#2F6FDB', department: null },
    { id: 'u_applicant', roles: ['applicant'], name_en: 'Omar Al-Qahtani', name_ar: 'عمر القحطاني', email: 'omar.demo@applicant.yu-demo.invalid', student_no: null, program_id: null, campus_id: 'riyadh', stage: 'applicant', level: 0, interests: ['software engineering', 'games'], skills: ['Python basics'], avatar_color: '#C8975B', department: null },
    { id: 'u_graduating', roles: ['student'], name_en: 'Noura Al-Shehri', name_ar: 'نورة الشهري', email: 'noura.demo@student.yu-demo.invalid', student_no: '202200015', program_id: 'bse', campus_id: 'riyadh', stage: 'graduating', level: 8, interests: ['software architecture', 'cloud', 'fintech'], skills: ['Java', 'Spring', 'AWS', 'Docker', 'SQL', 'React'], avatar_color: '#8B5CF6', department: null },
    { id: 'u_reviewer', roles: ['reviewer'], name_en: 'Dr. Hala Al-Mutairi', name_ar: 'د. هالة المطيري', email: 'hala.demo@staff.yu-demo.invalid', student_no: null, program_id: null, campus_id: 'riyadh', stage: 'staff', level: 0, interests: [], skills: [], avatar_color: '#D99A1E', department: 'Deanship of Student Affairs (demo)' },
    { id: 'u_admissions', roles: ['admission_officer', 'registrar'], name_en: 'Reem Al-Ghamdi', name_ar: 'ريم الغامدي', email: 'reem.demo@staff.yu-demo.invalid', student_no: null, program_id: null, campus_id: 'riyadh', stage: 'staff', level: 0, interests: [], skills: [], avatar_color: '#0EA5A4', department: 'Admissions & Registration (demo)' },
    { id: 'u_security', roles: ['security'], name_en: 'Abdullah Al-Anazi', name_ar: 'عبدالله العنزي', email: 'security.demo@staff.yu-demo.invalid', student_no: null, program_id: null, campus_id: 'riyadh', stage: 'staff', level: 0, interests: [], skills: [], avatar_color: '#475569', department: 'Campus Security (demo)' },
    { id: 'u_operator', roles: ['operator'], name_en: 'Demo Operator', name_ar: 'مشغّل العرض', email: 'operator@yu-demo.invalid', student_no: null, program_id: null, campus_id: 'riyadh', stage: 'staff', level: 0, interests: [], skills: [], avatar_color: '#1E1B18', department: 'Hackathon demo control' }
  ];
  for (const r of rows) {
    d.insert('users', { ...base, ...r, roles: j(r.roles), interests: j(r.interests), skills: j(r.skills) });
  }
  return {
    student: 'u_student', lead: 'u_lead', student2: 'u_student2', applicant: 'u_applicant', graduating: 'u_graduating',
    reviewer: 'u_reviewer', admissions: 'u_admissions', security: 'u_security', operator: 'u_operator'
  };
}

// ------------------------------------------------------------------ campuses
interface OsmEl { type: string; id: number; lat?: number; lon?: number; tags?: Record<string, string>; geometry?: Array<{ lat: number; lon: number }> }

function centerOf(g: Array<{ lat: number; lon: number }>): [number, number] {
  const lats = g.map((p) => p.lat), lons = g.map((p) => p.lon);
  return [(Math.min(...lats) + Math.max(...lats)) / 2, (Math.min(...lons) + Math.max(...lons)) / 2];
}

export function seedCampuses(d: Db) {
  // ---------- Riyadh (OpenStreetMap footprints + paths, ODbL) ----------
  const osm = JSON.parse(fs.readFileSync(path.join(here, 'data', 'riyadh-osm.json'), 'utf8')) as { elements: OsmEl[] };
  const boundaryJson = JSON.parse(fs.readFileSync(path.join(here, 'data', 'riyadh-boundary.json'), 'utf8')) as { elements: OsmEl[] };
  const boundary = (boundaryJson.elements[0].geometry ?? []).map((p) => [p.lat, p.lon]);
  d.insert('campuses', {
    id: 'riyadh', name_en: 'Al Yamamah University – Riyadh Campus', name_ar: 'جامعة اليمامة – حرم الرياض', city_en: 'Riyadh', city_ar: 'الرياض',
    lat: px(955, 468)[0], lng: px(955, 468)[1], zoom: 17, boundary: j(boundary), osm_ref: 'way/221634202',
    geometry_status: 'osm', source_note: 'Building names, gates, parking and room numbers from the annotated YU campus map (Sept 2026), georeferenced to OpenStreetMap (≈2 m residual). Footprints and paths © OpenStreetMap contributors (ODbL); outlines not in OSM are traced from the campus map. Accessibility is unverified.'
  });

  const locById = new Map<string, { lat: number; lng: number }>();
  const addLoc = (row: Record<string, unknown>) => {
    d.insert('campus_locations', row);
    locById.set(row.id as string, { lat: row.lat as number, lng: row.lng as number });
  };

  const osmWays = new Map(osm.elements.filter((x) => x.type === 'way' && x.geometry).map((x) => [x.id, x]));
  const fieldWay = osmWays.get(RIYADH_FIELD_WAY);
  for (const p of RIYADH_PLACES) {
    const way = p.osm ? osmWays.get(p.osm) : undefined;
    const poly: Array<[number, number]> | null = way?.geometry ? way.geometry.map((g) => [g.lat, g.lon] as [number, number])
      : p.outline ? pxPoly(p.outline)
      : p.id === 'ryd_field' && fieldWay?.geometry ? fieldWay.geometry.map((g) => [g.lat, g.lon] as [number, number]) : null;
    const [lat, lng] = p.at ? px(p.at[0], p.at[1]) : way?.geometry ? centerOf(way.geometry) : px(0, 0);
    const extra = way ? [`osm:way/${way.id}`, `levels:${way.tags?.['building:levels'] ?? '?'}`] : [];
    addLoc({
      id: p.id, campus_id: 'riyadh', kind: p.kind, name_en: p.en, name_ar: p.ar, building_id: null, floor: 0, lat, lng,
      accessible: p.accessible, tags: j([...p.tags, ...extra, ...(poly ? [`polygon:${JSON.stringify(poly)}`] : [])]),
      description_en: p.note, geometry_status: way || p.id === 'ryd_field' ? 'osm' : 'approx', searchable: 1
    });
  }

  for (const r of RIYADH_ROOMS) {
    const b = locById.get(r.building)!;
    const [lat, lng] = r.at ? px(r.at[0], r.at[1]) : [b.lat, b.lng];
    addLoc({ id: r.id, campus_id: 'riyadh', kind: r.kind, name_en: r.en, name_ar: r.ar, building_id: r.building, floor: r.floor, lat, lng, accessible: r.accessible, tags: j(['room']), description_en: r.at ? 'Placed where the campus map labels it; floor plans are not modelled.' : 'Placed at its building; floor plans are not modelled.', geometry_status: r.at ? 'approx' : 'synthetic', searchable: 1 });
  }

  // ---------- Riyadh path graph from OSM pedestrian/service ways ----------
  const junctions = new Map<string, { id: string; lat: number; lng: number }>();
  let jn = 0;
  const junctionFor = (lat: number, lng: number) => {
    const key = `${lat.toFixed(6)},${lng.toFixed(6)}`;
    let n = junctions.get(key);
    if (!n) {
      n = { id: `ryd_j${++jn}`, lat, lng };
      junctions.set(key, n);
    }
    return n;
  };
  let en = 0;
  const addEdge = (from: string, to: string, meters: number, kind: string, accessible: string, source: string) => {
    d.insert('path_edges', { id: `ryd_e${++en}`, campus_id: 'riyadh', from_id: from, to_id: to, meters: Math.round(meters), kind, accessible, bidirectional: 1, source });
  };
  const inCampus = (lat: number, lng: number) => lat > 24.8600 && lat < 24.8655 && lng > 46.5885 && lng < 46.5958;
  for (const el of osm.elements) {
    if (el.type !== 'way' || !el.tags?.highway || !el.geometry) continue;
    const hw = el.tags.highway;
    if (!['pedestrian', 'footway', 'path', 'service', 'living_street'].includes(hw)) continue;
    const pts = el.geometry.filter((p) => inCampus(p.lat, p.lon));
    for (let i = 1; i < pts.length; i++) {
      const a = junctionFor(pts[i - 1].lat, pts[i - 1].lon);
      const b = junctionFor(pts[i].lat, pts[i].lon);
      const m = haversine(a.lat, a.lng, b.lat, b.lng);
      if (m < 0.5) continue;
      addEdge(a.id, b.id, m, hw === 'pedestrian' ? 'walkway' : 'road', hw === 'pedestrian' ? 'yes' : 'unknown', `osm:way/${el.id}`);
    }
  }
  // Walkways traced from the campus map (vertices snap to OSM junctions within 10 m).
  let wn = 0;
  const snapJunction = (lat: number, lng: number) => {
    let best: { id: string; lat: number; lng: number } | null = null, bm = Infinity;
    for (const n of junctions.values()) { const m = haversine(lat, lng, n.lat, n.lng); if (m < bm) { bm = m; best = n; } }
    if (best && bm <= 10) return best;
    const n = { id: `ryd_w${++wn}`, lat, lng };
    junctions.set(`w${wn}`, n);
    return n;
  };
  for (const w of RIYADH_WALKWAYS) {
    const pts = w.points.map(([x, y]) => { const [lat, lng] = px(x, y); return snapJunction(lat, lng); });
    for (let k = 1; k < pts.length; k++) { const a = pts[k - 1], b = pts[k]; const m = haversine(a.lat, a.lng, b.lat, b.lng); if (m >= 0.5) addEdge(a.id, b.id, m, 'walkway', 'unknown', 'annotated-map'); }
  }
  for (const n of junctions.values()) {
    d.insert('campus_locations', { id: n.id, campus_id: 'riyadh', kind: 'junction', name_en: 'Path junction', name_ar: 'تقاطع مسار', building_id: null, floor: 0, lat: n.lat, lng: n.lng, accessible: 'unknown', tags: '[]', description_en: '', geometry_status: 'osm', searchable: 0 });
  }
  // Connect named locations to the nearest junction(s) (synthetic connectors) - except the unreachable annex.
  const junctionList = [...junctions.values()];
  for (const [id, p] of locById) {
    if (id === 'ryd_old_store') continue;
    if (id.startsWith('ryd_room_')) continue;
    const nearest = junctionList.map((n) => ({ n, m: haversine(p.lat, p.lng, n.lat, n.lng) })).sort((a, b) => a.m - b.m).slice(0, 2);
    const close = nearest.filter(({ m }) => m < 140);
    for (const { n, m } of close.length ? close : nearest.slice(0, 1)) addEdge(id, n.id, m, 'walkway', 'unknown', 'synthetic-connector');
  }
  // Ensure the graph is connected: link every junction component to its nearest neighbour component.
  // Join path components over junctions only, so a building never becomes the bridge between two parts of the network.
  connectComponents(d, 'riyadh', junctionList, (a, b, m) => addEdge(a, b, m, 'walkway', 'unknown', 'synthetic-connector'));
  // Rooms: indoor edges to their building (stairs vs elevator to demonstrate accessible routing).
  for (const r of RIYADH_ROOMS) {
    if (r.floor === 0) { addEdge(r.building, r.id, 15, 'indoor', 'yes', 'synthetic'); continue; }
    addEdge(r.building, r.id, 20 + r.floor * 6, 'stairs', 'no', 'synthetic');
    const hasLift = RIYADH_LIFT_BUILDINGS.includes(r.building);
    if (hasLift) addEdge(r.building, r.id, 35 + r.floor * 4, 'elevator', 'yes', 'synthetic');
  }
  // Auditorium: front steps (not accessible) vs side ramp (accessible, longer)
  const aud = locById.get('ryd_auditorium')!;
  const [rl, rg] = offset(aud.lat, aud.lng, -25, 20);
  d.insert('campus_locations', { id: 'ryd_aud_ramp', campus_id: 'riyadh', kind: 'entrance', name_en: 'Ahad Auditorium side ramp', name_ar: 'المنحدر الجانبي لمسرح أحد', building_id: 'ryd_auditorium', floor: 0, lat: rl, lng: rg, accessible: 'yes', tags: '["ramp"]', description_en: 'Synthetic accessible entrance for demonstration.', geometry_status: 'synthetic', searchable: 0 });
  const nearAud = junctionList.map((n) => ({ n, m: haversine(rl, rg, n.lat, n.lng) })).sort((a, b) => a.m - b.m)[0];
  addEdge('ryd_aud_ramp', nearAud.n.id, nearAud.m + 30, 'ramp', 'yes', 'synthetic');
  addEdge('ryd_aud_ramp', 'ryd_auditorium', 12, 'ramp', 'yes', 'synthetic');

  // ---------- Khobar (approximate centre, synthetic layout; labelled) ----------
  seedKhobar(d);
}

function connectComponents(d: Db, campus: string, nodes: Array<{ id: string; lat: number; lng: number }>, link: (a: string, b: string, m: number) => void) {
  const edges = d.all<{ from_id: string; to_id: string }>('SELECT from_id, to_id FROM path_edges WHERE campus_id = ?', campus);
  const parent = new Map<string, string>();
  const find = (x: string): string => {
    if (!parent.has(x)) parent.set(x, x);
    let p = parent.get(x)!;
    while (p !== x) { x = p; p = parent.get(x)!; if (!p) { parent.set(x, x); p = x; } }
    return p;
  };
  const union = (a: string, b: string) => { const ra = find(a), rb = find(b); if (ra !== rb) parent.set(ra, rb); };
  for (const n of nodes) find(n.id);
  const inSet = new Set(nodes.map((n) => n.id));
  for (const e of edges) if (inSet.has(e.from_id) && inSet.has(e.to_id)) union(e.from_id, e.to_id);
  for (let guard = 0; guard < 50; guard++) {
    const comps = new Map<string, Array<{ id: string; lat: number; lng: number }>>();
    for (const n of nodes) { const r = find(n.id); if (!comps.has(r)) comps.set(r, []); comps.get(r)!.push(n); }
    if (comps.size <= 1) break;
    const [main, ...rest] = [...comps.values()].sort((a, b) => b.length - a.length);
    let best: { a: string; b: string; m: number } | null = null;
    for (const comp of rest) for (const x of comp) for (const y of main) {
      const m = haversine(x.lat, x.lng, y.lat, y.lng);
      if (!best || m < best.m) best = { a: x.id, b: y.id, m };
    }
    if (!best) break;
    link(best.a, best.b, best.m);
    union(best.a, best.b);
  }
}

// Khobar campus: no verified public geometry was found during research. Centre is approximate (Al Khobar, Eastern
// Province) and clearly labelled; the demo panel documents how to replace it.
export const KHOBAR_CENTER: [number, number] = [26.3740, 50.2182]; // Al Sadafah district (OSM neighbourhood node), per yue.yu.edu.sa "Locate us"

function seedKhobar(d: Db) {
  const [clat, clng] = KHOBAR_CENTER;
  const boundary = [offset(clat, clng, 140, -160), offset(clat, clng, 140, 160), offset(clat, clng, -140, 160), offset(clat, clng, -140, -160)];
  d.insert('campuses', {
    id: 'khobar', name_en: 'Al Yamamah University – Khobar Campus', name_ar: 'جامعة اليمامة – حرم الخبر', city_en: 'Al Khobar', city_ar: 'الخبر',
    lat: clat, lng: clng, zoom: 17, boundary: j(boundary), osm_ref: null, geometry_status: 'approx',
    source_note: 'Khobar campus: the university lists Al Sadafah district (yue.yu.edu.sa). Centre uses the OpenStreetMap neighbourhood node; building layout is synthetic and unverified. Replace KHOBAR_CENTER in server/seed/core.ts with surveyed coordinates.'
  });
  const B = (id: string, en: string, ar: string, kind: string, n: number, e: number, acc: 'yes' | 'no' | 'unknown', tags: string[]) => {
    const [lat, lng] = offset(clat, clng, n, e);
    d.insert('campus_locations', { id, campus_id: 'khobar', kind, name_en: en, name_ar: ar, building_id: null, floor: 0, lat, lng, accessible: acc, tags: j(tags), description_en: 'Synthetic demo layout (position not verified).', geometry_status: 'synthetic', searchable: 1 });
    return { id, lat, lng };
  };
  const main = B('khb_main', 'Main Building (Admissions, Registrar, Student Affairs)', 'المبنى الرئيسي (القبول والتسجيل وشؤون الطلاب)', 'building', 0, 0, 'yes', ['main', 'admissions', 'registrar', 'student affairs']);
  const eng = B('khb_eng', 'Engineering & Architecture Block', 'مبنى الهندسة والعمارة', 'building', 90, 80, 'unknown', ['engineering', 'labs']);
  const law = B('khb_law', 'Law & Business Block', 'مبنى القانون والأعمال', 'building', 90, -80, 'yes', ['law', 'business']);
  const lib = B('khb_library', 'Library', 'المكتبة', 'library', -70, 90, 'yes', ['library']);
  const cafe = B('khb_cafe', 'Cafeteria', 'الكافتيريا', 'cafe', -70, -90, 'yes', ['food']);
  const sec = B('khb_security', 'Security Desk (Gate 1)', 'مكتب الأمن (البوابة 1)', 'security', -120, 0, 'yes', ['security', 'lost and found']);
  const gate = B('khb_gate', 'Gate 1', 'البوابة 1', 'gate', -135, 0, 'yes', ['gate']);
  const mosque = B('khb_mosque', 'Mosque', 'المسجد', 'mosque', 40, -130, 'yes', ['prayer']);
  const parking = B('khb_parking', 'Parking', 'المواقف', 'parking', -120, -140, 'unknown', ['parking']);
  const rooms = [
    { id: 'khb_room_e101', b: eng, en: 'E-101 Networks Lab', ar: 'معمل الشبكات E-101', floor: 1 },
    { id: 'khb_room_e205', b: eng, en: 'E-205 Classroom', ar: 'فصل E-205', floor: 2 },
    { id: 'khb_room_l110', b: law, en: 'L-110 Classroom', ar: 'فصل L-110', floor: 1 },
    { id: 'khb_room_m120', b: main, en: 'M-120 Lecture Hall', ar: 'قاعة M-120', floor: 1 }
  ];
  for (const r of rooms) d.insert('campus_locations', { id: r.id, campus_id: 'khobar', kind: 'room', name_en: r.en, name_ar: r.ar, building_id: r.b.id, floor: r.floor, lat: r.b.lat, lng: r.b.lng, accessible: 'unknown', tags: '["room"]', description_en: 'Synthetic room.', geometry_status: 'synthetic', searchable: 1 });
  let en = 0;
  const edge = (a: { id: string; lat: number; lng: number }, b: { id: string; lat: number; lng: number }, kind = 'walkway', acc = 'yes') => {
    d.insert('path_edges', { id: `khb_e${++en}`, campus_id: 'khobar', from_id: a.id, to_id: b.id, meters: Math.round(haversine(a.lat, a.lng, b.lat, b.lng)), kind, accessible: acc, bidirectional: 1, source: 'synthetic' });
  };
  edge(gate, sec); edge(sec, main); edge(main, eng); edge(main, law); edge(main, lib); edge(main, cafe); edge(eng, lib); edge(law, cafe); edge(law, mosque); edge(cafe, parking); edge(sec, parking, 'crossing', 'unknown');
  for (const r of rooms) {
    d.insert('path_edges', { id: `khb_e${++en}`, campus_id: 'khobar', from_id: r.b.id, to_id: r.id, meters: 20 + r.floor * 6, kind: 'stairs', accessible: 'no', bidirectional: 1, source: 'synthetic' });
    d.insert('path_edges', { id: `khb_e${++en}`, campus_id: 'khobar', from_id: r.b.id, to_id: r.id, meters: 35 + r.floor * 4, kind: 'elevator', accessible: 'yes', bidirectional: 1, source: 'synthetic' });
  }
}

export function seedCore(d: Db): SeedContext['users'] {
  const users = seedUsers(d);
  seedCampuses(d);
  return users;
}
