/**
 * Riyadh campus layer, rebuilt from the annotated campus map supplied by the team (server/seed/data/riyadh-campus-annotated.jpg,
 * 2000×901 px, Sept 2026). The image is georeferenced with an affine fit on the four street corners of the campus block
 * (Mahmoud Al-Homsi St × Jarir bin Al-Arqat St, × King Fahd Branch Rd, Amin Al-Shaibi St × Jarir, × King Fahd Branch Rd)
 * against OpenStreetMap; residuals ≈ 2 m, ≈ 0.33 m per pixel. OSM building footprints (way ids) are reused where they
 * coincide with a labelled building; everything else is traced from the image and flagged `approx`.
 */

// pixel (x, y) -> (lat, lng)
const LA = [0.0000012742857142830357, -0.000002675159235682981, 24.862828694085543];
const LN = [0.0000030200000000010913, 0.0000013821656051019181, 46.588532237579614];
export function px(x: number, y: number): [number, number] {
  return [LA[0] * x + LA[1] * y + LA[2], LN[0] * x + LN[1] * y + LN[2]];
}
export function pxPoly(points: Array<[number, number]>): Array<[number, number]> {
  return points.map(([x, y]) => px(x, y));
}
const rect = (x1: number, y1: number, x2: number, y2: number): Array<[number, number]> => [[x1, y1], [x2, y1], [x2, y2], [x1, y2]];

export type Access = 'yes' | 'no' | 'unknown';

export interface RiyadhPlace {
  id: string;
  en: string;
  ar: string;
  kind: string;
  /** OSM building way whose footprint and centroid are used. */
  osm?: number;
  /** Pixel position on the annotated map (used when there is no OSM footprint, or to override the label point). */
  at?: [number, number];
  /** Traced footprint in pixel space. */
  outline?: Array<[number, number]>;
  accessible: Access;
  tags: string[];
  note: string;
}

export const RIYADH_PLACES: RiyadhPlace[] = [
  // ---- Academic & administration
  { id: 'ryd_bldg_a', osm: 329022134, en: 'Main Building — Admissions & Registrar', ar: 'المبنى الرئيسي — القبول والتسجيل', kind: 'building', accessible: 'yes', tags: ['main building', 'admissions', 'registrar', 'finance'], note: 'Labelled "Main building" on the campus map; OSM footprint (4 floors).' },
  { id: 'ryd_bldg_b', osm: 846335861, en: 'Tuwaiq Building (Blocks E–H)', ar: 'مبنى طويق (المباني E–H)', kind: 'building', accessible: 'unknown', tags: ['tuwaiq', 'classrooms', 'e block', 'f block', 'g block', 'h block'], note: 'Blocks E/G and F/H with classrooms E101–E209, F101–F209, G101–G209 and the Tuwaiq auditorium, per the campus map.' },
  { id: 'ryd_bldg_c', at: [470, 400], outline: rect(195, 250, 588, 528), en: 'Najd Building', ar: 'مبنى نجد', kind: 'building', accessible: 'yes', tags: ['najd', 'classrooms', 'chemistry labs', 'computer labs', 'auditorium'], note: 'Classes, C004/C006 chemistry labs, D002–D005 first-floor classes, D201–D207 computer labs and the Najd auditorium. Outline traced from the campus map.' },
  { id: 'ryd_bldg_d', osm: 329022130, en: 'IT & Student Affairs', ar: 'تقنية المعلومات وشؤون الطلاب', kind: 'building', accessible: 'yes', tags: ['it', 'helpdesk', 'student affairs', 'clubs', 'counselling'], note: 'Labelled "IT and student affairs" on the campus map; OSM footprint.' },
  { id: 'ryd_it', osm: 329022135, en: 'Graduate Classes', ar: 'قاعات الدراسات العليا', kind: 'building', accessible: 'unknown', tags: ['graduate', 'postgraduate', 'learning hall'], note: 'Graduate classes and the graduates learning hall, per the campus map.' },
  { id: 'ryd_auditorium', osm: 329022132, at: [1492, 330], en: 'Ahad Auditorium', ar: 'مسرح أحد', kind: 'hall', accessible: 'unknown', tags: ['auditorium', 'events', 'talks'], note: 'Labelled "Ahad auditorium" on the campus map.' },
  { id: 'ryd_hall_yamamah', osm: 329022140, en: 'Al Yamamah Hall (Green Hall)', ar: 'قاعة اليمامة (الخضراء)', kind: 'hall', accessible: 'unknown', tags: ['hall', 'ceremonies', 'events'], note: 'قاعة اليمامة (الخضراء) on the campus map; OSM footprint.' },
  { id: 'ryd_library', osm: 329022141, en: 'Library (male campus)', ar: 'المكتبة (طلاب)', kind: 'library', accessible: 'yes', tags: ['library', 'study rooms', 'quiet'], note: 'Labelled "Library (males)" on the campus map; OSM footprint.' },

  // ---- Student life, sport, prayer, food
  { id: 'ryd_cafeteria', at: [345, 285], en: 'Students Lobby — restaurants & cafés (Archi)', ar: 'بهو الطلاب — المطاعم والمقاهي (ارتشي)', kind: 'cafe', accessible: 'yes', tags: ['food', 'coffee', 'archi', 'students lobby'], note: 'Inside the Najd building, per the campus map.' },
  { id: 'ryd_sports', osm: 329022142, en: 'Sports Center (male)', ar: 'المركز الرياضي (طلاب)', kind: 'hall', accessible: 'unknown', tags: ['sports', 'gym', 'fitness'], note: 'Labelled "Sports center (male)" on the campus map; OSM footprint.' },
  { id: 'ryd_field', at: [893, 465], en: 'Sports Field & Running Track', ar: 'الملعب ومضمار الجري', kind: 'outdoor', accessible: 'unknown', tags: ['field', 'track', 'football'], note: 'Oval track from OpenStreetMap.' },
  { id: 'ryd_padel', at: [1113, 676], en: 'YU Padel Courts', ar: 'ملاعب واي يو بادل', kind: 'outdoor', accessible: 'unknown', tags: ['padel', 'sports'], note: 'Per the campus map.' },
  { id: 'ryd_tennis', at: [210, 738], en: 'Tennis Court', ar: 'ملعب تنس', kind: 'outdoor', accessible: 'unknown', tags: ['tennis', 'sports'], note: 'Per the campus map.' },
  { id: 'ryd_mosque', osm: 329022160, en: 'YU Mosque', ar: 'مسجد الجامعة', kind: 'mosque', accessible: 'yes', tags: ['prayer', 'mosque'], note: 'OSM footprint.' },

  // ---- Residence (four identical 5-storey blocks, OSM)
  { id: 'ryd_annex_1', osm: 329022173, en: 'Residence — Block 1', ar: 'السكن — المبنى 1', kind: 'building', accessible: 'unknown', tags: ['residence', 'housing'], note: 'Residence area on the campus map; OSM footprint (5 floors).' },
  { id: 'ryd_annex_2', osm: 329022171, en: 'Residence — Block 2', ar: 'السكن — المبنى 2', kind: 'building', accessible: 'unknown', tags: ['residence', 'housing'], note: 'Residence area on the campus map; OSM footprint (5 floors).' },
  { id: 'ryd_annex_3', osm: 329022172, en: 'Residence — Block 3', ar: 'السكن — المبنى 3', kind: 'building', accessible: 'unknown', tags: ['residence', 'housing'], note: 'Residence area on the campus map; OSM footprint (5 floors).' },
  { id: 'ryd_residence_4', osm: 329022175, en: 'Residence — Block 4', ar: 'السكن — المبنى 4', kind: 'building', accessible: 'unknown', tags: ['residence', 'housing'], note: 'Residence row on the campus map; OSM footprint (5 floors).' },

  // ---- Gates
  { id: 'ryd_gate_main', at: [1800, 471], en: 'Gate 1 — Main entrance', ar: 'البوابة 1 — المدخل الرئيسي', kind: 'gate', accessible: 'yes', tags: ['gate 1', 'main gate', 'king fahd branch road', 'drop-off'], note: 'On King Fahd Branch Road, at the roundabout.' },
  { id: 'ryd_gate_2', at: [1398, 822], en: 'Gate 2', ar: 'البوابة 2', kind: 'gate', accessible: 'unknown', tags: ['gate 2', 'amin al-shaibi street', 'student parking'], note: 'On Amin Al-Shaibi Street.' },
  { id: 'ryd_gate_3', at: [92, 335], en: 'Gate 3', ar: 'البوابة 3', kind: 'gate', accessible: 'unknown', tags: ['gate 3', 'jarir bin al-arqat street', 'najd'], note: 'On Jarir bin Al-Arqat Street, next to Najd parking.' },
  { id: 'ryd_gate_4', at: [678, 90], en: 'Gate 4', ar: 'البوابة 4', kind: 'gate', accessible: 'unknown', tags: ['gate 4', 'mahmoud al-homsi street'], note: 'On Mahmoud Al-Homsi Street.' },
  { id: 'ryd_gate_5', at: [1363, 86], en: 'Gate 5', ar: 'البوابة 5', kind: 'gate', accessible: 'unknown', tags: ['gate 5', 'mahmoud al-homsi street'], note: 'On Mahmoud Al-Homsi Street.' },
  { id: 'ryd_security', at: [1745, 440], en: 'Security Office — Lost & Found desk', ar: 'مكتب الأمن — المفقودات', kind: 'security', accessible: 'yes', tags: ['security', 'lost and found', 'lost & found desk', 'gate 1'], note: 'Placed beside Gate 1 for the demo; the campus map does not show the security office.' },

  // ---- Parking
  { id: 'ryd_parking', at: [1745, 622], outline: rect(1712, 560, 1826, 700), en: 'Main Parking 1', ar: 'المواقف الرئيسية 1', kind: 'parking', accessible: 'unknown', tags: ['parking', 'main parking'], note: 'Per the campus map.' },
  { id: 'ryd_parking_2', at: [1745, 285], outline: rect(1712, 240, 1826, 330), en: 'Main Parking 2', ar: 'المواقف الرئيسية 2', kind: 'parking', accessible: 'unknown', tags: ['parking', 'main parking'], note: 'Per the campus map.' },
  { id: 'ryd_parking_north', at: [1030, 142], outline: rect(750, 112, 1285, 172), en: 'North Parking (Gates 4–5)', ar: 'المواقف الشمالية (البوابتان 4–5)', kind: 'parking', accessible: 'unknown', tags: ['parking'], note: 'Per the campus map.' },
  { id: 'ryd_parking_lot', at: [1560, 142], outline: rect(1440, 114, 1682, 172), en: 'Parking Lot (by the mosque)', ar: 'موقف سيارات (بجوار المسجد)', kind: 'parking', accessible: 'unknown', tags: ['parking', 'visitor'], note: 'Per the campus map.' },
  { id: 'ryd_parking_students', at: [1225, 790], outline: rect(880, 766, 1640, 822), en: 'Student Parking 2', ar: 'مواقف الطلاب 2', kind: 'parking', accessible: 'unknown', tags: ['parking', 'student parking', 'gate 2'], note: 'Per the campus map.' },
  { id: 'ryd_parking_najd', at: [130, 335], en: 'Najd Parking (Gate 3)', ar: 'مواقف نجد (البوابة 3)', kind: 'parking', accessible: 'unknown', tags: ['parking', 'najd', 'gate 3'], note: 'Per the campus map.' },

  // ---- Entrances (routing aids)
  { id: 'ryd_najd_entrance', at: [573, 250], en: 'Najd Building Entrance', ar: 'مدخل مبنى نجد', kind: 'entrance', accessible: 'unknown', tags: ['najd', 'entrance'], note: 'Per the campus map.' },
  { id: 'ryd_entrance_1', at: [726, 464], en: 'Tuwaiq Building Entrance', ar: 'مدخل مبنى طويق', kind: 'entrance', accessible: 'unknown', tags: ['tuwaiq', 'entrance'], note: 'Entrance node from OpenStreetMap.' },
  { id: 'ryd_entrance_2', at: [1599, 543], en: 'Main Building — South Entrance', ar: 'المبنى الرئيسي — المدخل الجنوبي', kind: 'entrance', accessible: 'unknown', tags: ['main building', 'entrance'], note: 'Entrance node from OpenStreetMap.' },
  { id: 'ryd_entrance_3', at: [1541, 470], en: 'Main Building — Roundabout Entrance', ar: 'المبنى الرئيسي — مدخل الدوار', kind: 'entrance', accessible: 'unknown', tags: ['main building', 'entrance'], note: 'Entrance node from OpenStreetMap.' },

  // ---- Demonstration of an unreachable destination
  { id: 'ryd_old_store', at: [280, 96], en: 'Maintenance Store (restricted — no pedestrian access)', ar: 'مستودع الصيانة (مقيد — لا يوجد ممر مشاة)', kind: 'building', accessible: 'no', tags: ['closed', 'restricted'], note: 'Demonstration of an unreachable destination: no path edge connects this location.' }
];

export interface RiyadhRoom { id: string; building: string; en: string; ar: string; floor: number; kind: string; accessible: Access; at?: [number, number] }

export const RIYADH_ROOMS: RiyadhRoom[] = [
  // Tuwaiq (blocks E–H): stairs only in the demo graph
  { id: 'ryd_room_b101', building: 'ryd_bldg_b', en: 'E101 Classroom', ar: 'قاعة E101', floor: 1, kind: 'room', accessible: 'unknown', at: [648, 560] },
  { id: 'ryd_room_b204', building: 'ryd_bldg_b', en: 'E203 Classroom', ar: 'قاعة E203', floor: 2, kind: 'room', accessible: 'unknown', at: [648, 580] },
  { id: 'ryd_room_b210', building: 'ryd_bldg_b', en: 'F203 Classroom', ar: 'قاعة F203', floor: 2, kind: 'room', accessible: 'unknown', at: [648, 638] },
  { id: 'ryd_room_g105', building: 'ryd_bldg_b', en: 'G105 Classroom', ar: 'قاعة G105', floor: 1, kind: 'room', accessible: 'unknown', at: [648, 676] },
  { id: 'ryd_room_tuwaiq_aud', building: 'ryd_bldg_b', en: 'Tuwaiq Auditorium', ar: 'مسرح طويق', floor: 0, kind: 'hall', accessible: 'unknown', at: [647, 718] },
  // Najd: lift assumed for the demo
  { id: 'ryd_room_c115', building: 'ryd_bldg_c', en: 'D003 Classroom (first floor)', ar: 'قاعة D003 (الدور الأول)', floor: 1, kind: 'room', accessible: 'yes', at: [367, 473] },
  { id: 'ryd_room_c220', building: 'ryd_bldg_c', en: 'Najd Auditorium', ar: 'مسرح نجد', floor: 1, kind: 'hall', accessible: 'yes', at: [433, 497] },
  { id: 'ryd_room_b305', building: 'ryd_bldg_c', en: 'D201 Computer Lab', ar: 'معمل الحاسب D201', floor: 2, kind: 'lab', accessible: 'unknown', at: [330, 512] },
  { id: 'ryd_room_b312', building: 'ryd_bldg_c', en: 'D205 Computer Lab (networks)', ar: 'معمل الحاسب D205 (الشبكات)', floor: 2, kind: 'lab', accessible: 'unknown', at: [380, 512] },
  { id: 'ryd_room_c004', building: 'ryd_bldg_c', en: 'C004 Chemistry Lab', ar: 'معمل الكيمياء C004', floor: 0, kind: 'lab', accessible: 'yes', at: [310, 434] },
  { id: 'ryd_room_c006', building: 'ryd_bldg_c', en: 'C006 Chemistry Lab', ar: 'معمل الكيمياء C006', floor: 0, kind: 'lab', accessible: 'yes', at: [270, 434] },
  // Main building
  { id: 'ryd_room_a102', building: 'ryd_bldg_a', en: 'Admissions Counter', ar: 'شباك القبول', floor: 0, kind: 'service', accessible: 'yes' },
  { id: 'ryd_room_a201', building: 'ryd_bldg_a', en: 'Registrar Office', ar: 'مكتب التسجيل', floor: 2, kind: 'service', accessible: 'yes' },
  // IT & Student Affairs, Library, Graduate classes
  { id: 'ryd_room_d105', building: 'ryd_bldg_d', en: 'Clubs Room (Student Affairs)', ar: 'غرفة الأندية (شؤون الطلاب)', floor: 1, kind: 'room', accessible: 'yes' },
  { id: 'ryd_room_lib_2f', building: 'ryd_library', en: 'Library Study Room (2F)', ar: 'غرفة الدراسة بالمكتبة (الدور الثاني)', floor: 2, kind: 'room', accessible: 'yes' },
  { id: 'ryd_room_it_lab', building: 'ryd_it', en: 'Graduates Learning Hall', ar: 'قاعة تعلم الخريجين', floor: 0, kind: 'hall', accessible: 'unknown', at: [1462, 598] }
];

/** Buildings where the demo graph adds an elevator in addition to stairs. */
export const RIYADH_LIFT_BUILDINGS = ['ryd_bldg_a', 'ryd_bldg_c', 'ryd_bldg_d', 'ryd_library'];

/** OSM way ids reused as outdoor/track shapes. */
export const RIYADH_FIELD_WAY = 329027171;

/**
 * Walkways traced from the campus map where OpenStreetMap has no footpath (mostly the west side: Najd, the residences
 * and Gate 3). Pixel polylines; vertices snap to existing path junctions within ~10 m. Accessibility unverified.
 */
export const RIYADH_WALKWAYS: Array<{ name: string; points: Array<[number, number]> }> = [
  { name: 'Gate 3 to Najd and the west road (between Najd and the residences)', points: [[130, 335], [130, 542], [300, 542], [480, 542], [600, 542], [690, 542]] },
  { name: 'Najd entrance to the west road', points: [[573, 250], [630, 250], [690, 250]] },
  { name: 'Najd north frontage to Gate 4 road', points: [[300, 238], [450, 238], [560, 238], [573, 250]] },
  { name: 'West road to the sports field', points: [[690, 465], [728, 465], [762, 465]] },
  { name: 'Residence south walk', points: [[150, 848], [330, 848], [500, 848], [700, 848], [744, 800]] },
  { name: 'Tuwaiq arcade to the west road (north)', points: [[717, 358], [690, 358]] },
  { name: 'Tuwaiq arcade to the west road (south)', points: [[715, 570], [690, 570]] }
];
