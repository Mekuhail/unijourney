import type { SeedContext } from '../../seed/context.ts';
import { j } from '../../core/db.ts';
import { localToIso, nowIso } from '../../core/clock.ts';
import { upsertEntry } from '../../core/calendar.ts';
import { createDocumentFromBuffer } from '../../core/documents.ts';
import { makePdf } from '../../seed/fixtures.ts';
import { COURSES, CURRICULUM_SOURCE, REQUIREMENTS, requirementCredits, COURSE_BY_CODE } from './curriculum.ts';
import { meetingOccurrences, resetCaches, type Meeting } from './common.ts';
import { taskCalendarSync } from './study.ts';

// ---------------------------------------------------------------- helpers
const SLOTS: Record<string, [string, string]> = { A: ['08:00', '09:15'], B: ['09:30', '10:45'], C: ['11:00', '12:15'], D: ['13:00', '14:15'], E: ['14:30', '15:45'] };
const DAYS: Record<string, number[]> = { ST: [0, 2], MW: [1, 3], TR: [2, 4], SUN: [0], MON: [1], TUE: [2], WED: [3], THU: [4] };
const INSTRUCTORS = ['Dr. Mohammed Al-Zahrani', 'Dr. Amal Al-Qahtani', 'Dr. Khalid Al-Shammari', 'Dr. Noha Al-Rashid', 'Dr. Fahad Al-Malki', 'Dr. Reem Al-Juhani', 'Dr. Yousef Al-Ghamdi', 'Dr. Huda Al-Saleh', 'Dr. Tariq Al-Amri', 'Dr. Lama Al-Subaie', 'Dr. Saad Al-Mutlaq', 'Dr. Maha Al-Harthi', 'Dr. Bandar Al-Otaibi', 'Dr. Dalal Al-Anazi'];
const GRADES = ['A', 'A-', 'B+', 'B', 'A', 'B+', 'A-', 'B', 'A', 'B+'];

export function sectionId(term: string, code: string, no: string) {
  return `sec_${term}_${code.replace(/\s+/g, '').toLowerCase()}_${no}`;
}
export function attendanceId(studentId: string, code: string, date: string, start: string) {
  return `att_${studentId.replace(/^u_/, '')}_${code.replace(/\s+/g, '').toLowerCase()}_${date}_${start.replace(':', '')}`;
}

interface SectionSpec { code: string; no: string; days: string; slot: string; room: string; instr: number; campus?: string; cap?: number; enrolled?: number; term: string }

function meetingsFor(days: string, slot: string, room: string): Meeting[] {
  const [start, end] = SLOTS[slot];
  return DAYS[days].map((day) => ({ day, start, end, location_id: room }));
}

// ---------------------------------------------------------------- seed
export function seedAcademics(ctx: SeedContext) {
  const d = ctx.db;
  const now = nowIso();
  resetCaches();

  // 1. courses
  for (const c of COURSES) {
    d.insert('courses', { code: c.code, title_en: c.title_en, title_ar: c.title_ar, credits: c.credits, dept: c.dept, level: c.level, prereqs: j(c.prereqs), coreqs: j(c.coreqs ?? []), min_credits: c.min_credits ?? 0, category: c.category, description_en: c.description_en, source: CURRICULUM_SOURCE });
  }

  // 2. degree requirements
  for (const [program, reqs] of Object.entries(REQUIREMENTS)) {
    reqs.forEach((r, i) => d.insert('degree_requirements', { id: r.id, program_id: program, category: r.category, label_en: r.label_en, label_ar: r.label_ar, required_credits: requirementCredits(r), course_codes: j(r.course_codes), min_courses: r.min_courses ?? 0, sort: i }));
  }

  // 3. sections
  const T1 = ctx.term, T2 = ctx.nextTerm;
  const R = (code: string, no: string, days: string, slot: string, room: string, instr: number, extra: Partial<SectionSpec> = {}): SectionSpec => ({ code, no, days, slot, room: room.startsWith('khb') ? room : `ryd_room_${room}`, instr, term: T1, ...extra });
  const specs: SectionSpec[] = [
    // ---- current term 2026-1 (Riyadh)
    R('CIS 321', '01', 'ST', 'C', 'b204', 2, { cap: 30, enrolled: 28 }),
    R('CIS 316', '01', 'MW', 'C', 'b210', 3, { cap: 30, enrolled: 26 }),
    R('SWE 302', '01', 'MW', 'B', 'b101', 0, { cap: 35, enrolled: 31 }),
    R('SWE 312', '01', 'ST', 'D', 'b305', 1, { cap: 24, enrolled: 22 }),
    R('SWE 322', '01', 'MW', 'D', 'b305', 4, { cap: 24, enrolled: 20 }),
    R('CIS 491', '01', 'ST', 'E', 'c220', 6, { cap: 20, enrolled: 17 }),
    R('CIS 443', '01', 'MW', 'A', 'b312', 8, { cap: 25, enrolled: 23 }),
    R('SWE 321', '01', 'ST', 'B', 'c115', 7, { cap: 30, enrolled: 27 }),
    R('SWE 411', '01', 'MW', 'E', 'b204', 9, { cap: 30, enrolled: 25 }),
    R('SWE 413', '01', 'ST', 'A', 'b210', 10, { cap: 30, enrolled: 19 }),
    R('CIS 492', '01', 'ST', 'C', 'c220', 6, { cap: 20, enrolled: 15 }),
    R('SWE 401', '01', 'MW', 'B', 'c115', 11, { cap: 30, enrolled: 21 }),
    R('SWE 415', '01', 'ST', 'D', 'b204', 7, { cap: 30, enrolled: 18 }),
    R('SWE 412', '01', 'MW', 'E', 'b305', 12, { cap: 24, enrolled: 20 }),
    // ---- current term (Khobar, BCNE)
    R('CIS 202', 'K1', 'ST', 'B', 'khb_room_e205', 13, { campus: 'khobar', cap: 30, enrolled: 22 }),
    R('CNE 200', 'K1', 'MW', 'B', 'khb_room_e101', 10, { campus: 'khobar', cap: 24, enrolled: 21 }),
    R('MTH 204', 'K1', 'ST', 'C', 'khb_room_m120', 5, { campus: 'khobar', cap: 35, enrolled: 29 }),
    R('PHY 203', 'K1', 'MW', 'C', 'khb_room_m120', 8, { campus: 'khobar', cap: 35, enrolled: 27 }),
    R('ENG 201', 'K1', 'ST', 'D', 'khb_room_l110', 11, { campus: 'khobar', cap: 30, enrolled: 24 }),
    // ---- next term 2026-2 (Riyadh): two sections per course, demo cases marked
    R('SWE 300', '01', 'ST', 'B', 'b101', 0, { term: T2 }), R('SWE 300', '02', 'MW', 'C', 'b204', 3, { term: T2 }),
    R('SWE 301', '01', 'ST', 'C', 'b204', 1, { term: T2 }), R('SWE 301', '02', 'MW', 'B', 'b210', 9, { term: T2 }),
    R('SWE 302', '01', 'MW', 'B', 'b101', 0, { term: T2 }), R('SWE 302', '02', 'ST', 'D', 'c115', 12, { term: T2 }),
    R('SWE 312', '01', 'ST', 'D', 'b305', 1, { term: T2 }), R('SWE 312', '02', 'MW', 'E', 'b305', 4, { term: T2 }),
    R('SWE 322', '01', 'MW', 'D', 'b305', 4, { term: T2 }), R('SWE 322', '02', 'ST', 'E', 'b305', 12, { term: T2 }),
    R('CIS 304', '01', 'ST', 'A', 'b204', 2, { term: T2 }), R('CIS 304', '02', 'MW', 'D', 'b210', 8, { term: T2 }),
    R('CIS 321', '01', 'ST', 'C', 'b204', 2, { term: T2 }), R('CIS 321', '02', 'MW', 'A', 'b210', 10, { term: T2 }),
    R('CIS 386', '01', 'MW', 'C', 'c220', 6, { term: T2 }), R('CIS 386', '02', 'ST', 'E', 'c115', 11, { term: T2 }),
    R('CIS 383', '01', 'ST', 'B', 'b312', 8, { term: T2 }), R('CIS 383', '02', 'MW', 'D', 'b312', 13, { term: T2 }),
    R('CIS 381', '01', 'THU', 'C', 'c220', 11, { term: T2 }), R('CIS 381', '02', 'MON', 'E', 'c115', 5, { term: T2 }),
    R('CIS 316', '01', 'MW', 'C', 'b210', 3, { term: T2 }), R('CIS 316', '02', 'ST', 'A', 'b210', 12, { term: T2 }),
    R('MTH 301', '01', 'ST', 'B', 'c115', 5, { term: T2 }), R('MTH 301', '02', 'MW', 'A', 'c220', 13, { term: T2 }),
    R('MTH 304', '01', 'MW', 'B', 'c220', 5, { term: T2 }), R('MTH 304', '02', 'ST', 'D', 'c220', 13, { term: T2 }),
    // CIS 443 sec 01: nearly full (1 seat left). sec 02 time-conflicts with SWE 401 sec 01 (both ST 11:00).
    R('CIS 443', '01', 'MW', 'A', 'b312', 8, { term: T2, cap: 25, enrolled: 24 }), R('CIS 443', '02', 'ST', 'C', 'b312', 10, { term: T2 }),
    // SWE 321 sec 01: popular, FULL. sec 02 is in the Library (far from the Tuwaiq building) -> travel-gap check.
    R('SWE 321', '01', 'ST', 'B', 'c115', 7, { term: T2, cap: 30, enrolled: 30 }), R('SWE 321', '02', 'MW', 'C', 'lib_2f', 1, { term: T2, cap: 28 }),
    R('SWE 411', '01', 'MW', 'D', 'b204', 9, { term: T2 }), R('SWE 411', '02', 'ST', 'A', 'b101', 0, { term: T2 }),
    R('SWE 401', '01', 'ST', 'C', 'c115', 11, { term: T2 }), R('SWE 401', '02', 'MW', 'B', 'b204', 7, { term: T2 }),
    R('SWE 402', '01', 'ST', 'E', 'b210', 12, { term: T2 }), R('SWE 402', '02', 'MW', 'B', 'b305', 4, { term: T2 }),
    R('SWE 413', '01', 'MW', 'E', 'c220', 10, { term: T2 }), R('SWE 413', '02', 'ST', 'D', 'b204', 9, { term: T2 }),
    R('SWE 415', '01', 'ST', 'E', 'c220', 7, { term: T2 }), R('SWE 415', '02', 'MW', 'A', 'c115', 11, { term: T2 }),
    R('SWE 412', '01', 'MW', 'E', 'b312', 12, { term: T2 }), R('SWE 412', '02', 'ST', 'B', 'b305', 1, { term: T2 }),
    R('CIS 416', '01', 'ST', 'A', 'c220', 3, { term: T2 }), R('CIS 416', '02', 'MW', 'B', 'it_lab', 13, { term: T2 }),
    R('CIS 491', '01', 'ST', 'E', 'b101', 6, { term: T2, cap: 20 }), R('CIS 491', '02', 'MW', 'A', 'b101', 0, { term: T2, cap: 20 }),
    R('SWE 410', '01', 'THU', 'A', 'b101', 9, { term: T2 }), R('SWE 410', '02', 'THU', 'D', 'b204', 7, { term: T2 }),
    R('CIS 492', '01', 'MW', 'D', 'c220', 6, { term: T2, cap: 20 }), R('CIS 492', '02', 'ST', 'A', 'c115', 6, { term: T2, cap: 20 }),
    R('SWE 414', '01', 'TR', 'D', 'c115', 10, { term: T2 }), R('SWE 414', '02', 'MW', 'A', 'b204', 2, { term: T2 }),
    R('NES 424', '01', 'TR', 'E', 'b312', 8, { term: T2 }), R('NES 424', '02', 'MW', 'C', 'b312', 13, { term: T2 }),
    R('NES 481', '01', 'ST', 'A', 'b312', 8, { term: T2 }), R('NES 481', '02', 'MW', 'B', 'b312', 10, { term: T2 }),
    R('MIS 432', '01', 'MW', 'D', 'c115', 11, { term: T2 }), R('MIS 432', '02', 'ST', 'C', 'c220', 5, { term: T2 }),
    R('CIS 222', '01', 'ST', 'B', 'b210', 3, { term: T2 }), R('CIS 222', '02', 'MW', 'E', 'b210', 12, { term: T2 }),
    // ---- next term (Khobar, BCNE year 2 semester 2)
    R('CIS 221', 'K1', 'ST', 'B', 'khb_room_e205', 13, { term: T2, campus: 'khobar' }), R('CIS 221', 'K2', 'MW', 'D', 'khb_room_e205', 5, { term: T2, campus: 'khobar' }),
    R('CNE 300', 'K1', 'MW', 'B', 'khb_room_e101', 10, { term: T2, campus: 'khobar', cap: 24 }), R('CNE 300', 'K2', 'ST', 'E', 'khb_room_e101', 8, { term: T2, campus: 'khobar', cap: 24 }),
    R('CNE 221', 'K1', 'ST', 'C', 'khb_room_m120', 13, { term: T2, campus: 'khobar' }),
    R('MTH 301', 'K1', 'MW', 'C', 'khb_room_m120', 5, { term: T2, campus: 'khobar' }),
    R('STT 103', 'K1', 'ST', 'D', 'khb_room_l110', 11, { term: T2, campus: 'khobar' }),
    R('ARB 202', 'K1', 'THU', 'C', 'khb_room_l110', 11, { term: T2, campus: 'khobar' }),
    R('ISL 202', 'K1', 'THU', 'D', 'khb_room_l110', 13, { term: T2, campus: 'khobar' }),
    R('CNE 303', 'K1', 'MW', 'D', 'khb_room_e101', 8, { term: T2, campus: 'khobar', cap: 24 })
  ];
  specs.forEach((s, i) => {
    const cap = s.cap ?? 30;
    const enrolled = s.enrolled ?? Math.min(cap - 3, 10 + ((i * 7) % 15));
    d.insert('course_sections', { id: sectionId(s.term, s.code, s.no), course_code: s.code, term: s.term, section_no: s.no, instructor: INSTRUCTORS[s.instr % INSTRUCTORS.length], campus_id: s.campus ?? 'riyadh', capacity: cap, enrolled, meetings: j(meetingsFor(s.days, s.slot, s.room)), status: 'open', notes: null });
  });

  // 4. transcripts
  let gi = 0;
  const completed = (student: string, term: string, codes: string[]) => {
    for (const code of codes) {
      const c = COURSE_BY_CODE.get(code)!;
      d.insert('transcript_entries', { id: `tr_${student.replace(/^u_/, '')}_${code.replace(/\s+/g, '').toLowerCase()}`, student_id: student, course_code: code, term, status: 'completed', grade: c.credits === 0 ? 'P' : GRADES[gi++ % GRADES.length], credits: c.credits, section_id: null, evidence: null, created_at: now });
    }
  };
  const enrolled = (student: string, term: string, entries: Array<[string, string]>) => {
    for (const [code, no] of entries) {
      const c = COURSE_BY_CODE.get(code)!;
      d.insert('transcript_entries', { id: `tr_${student.replace(/^u_/, '')}_${code.replace(/\s+/g, '').toLowerCase()}_${term}`, student_id: student, course_code: code, term, status: 'enrolled', grade: null, credits: c.credits, section_id: sectionId(term, code, no), evidence: null, created_at: now });
    }
  };
  const Y1S1 = ['CIS 103', 'CHM 101', 'MTH 106', 'ENG 101', 'ISL 101'];
  const Y1S2 = ['CIS 104', 'PHY 103', 'MTH 104', 'STT 103', 'ARB 102'];
  const Y2S1 = ['CIS 201', 'CIS 202', 'MIS 201', 'PHY 203', 'MTH 204', 'ISL 202'];
  const Y2S2 = ['CIS 221', 'SWE 202', 'NES 212', 'MTH 304', 'ENG 201', 'ARB 202'];
  const Y3S1 = ['CIS 304', 'CIS 386', 'CIS 383', 'SWE 300', 'SWE 301', 'MTH 301'];
  const Y3S2 = ['CIS 321', 'CIS 381', 'CIS 316', 'SWE 302', 'SWE 312', 'SWE 322'];

  // Sara (BSE level 6): Spring 2024 intake.
  const S = ctx.users.student;
  completed(S, '2023-2', [...Y1S1, 'PHL 101']);
  completed(S, '2024-1', [...Y1S2, 'PSY 101']);
  completed(S, '2024-2', Y2S1);
  completed(S, '2025-1', Y2S2);
  completed(S, '2025-2', Y3S1);
  enrolled(S, T1, [['CIS 321', '01'], ['CIS 316', '01'], ['SWE 302', '01'], ['SWE 312', '01'], ['SWE 322', '01']]);

  // Layan (BSE level 7): Fall 2023 intake.
  const L = ctx.users.lead;
  completed(L, '2023-1', [...Y1S1, 'SOS 101']);
  completed(L, '2023-2', [...Y1S2, 'PHL 101']);
  completed(L, '2024-1', Y2S1);
  completed(L, '2024-2', Y2S2);
  completed(L, '2025-1', Y3S1);
  completed(L, '2025-2', Y3S2);
  enrolled(L, T1, [['CIS 491', '01'], ['CIS 443', '01'], ['SWE 321', '01'], ['SWE 411', '01'], ['SWE 413', '01']]);

  // Noura (BSE level 8, graduating): Spring 2023 intake; ENG 103 transfer credit; co-op never taken.
  const G = ctx.users.graduating;
  completed(G, '2022-2', [...Y1S1, 'PHL 101']);
  d.insert('transcript_entries', { id: 'tr_graduating_eng103', student_id: G, course_code: 'ENG 103', term: '2022-2', status: 'equivalent', grade: 'TR', credits: 3, section_id: null, evidence: 'Transfer credit approved by Admissions & Registration (demo): "Introduction to Literature" from a previous institution accepted as ENG 103 equivalent. Ref TR-2022-118.', created_at: now });
  completed(G, '2023-1', Y1S2);
  completed(G, '2023-2', Y2S1);
  completed(G, '2024-1', Y2S2);
  completed(G, '2024-2', Y3S1);
  completed(G, '2025-1', Y3S2);
  completed(G, '2025-2', ['CIS 491', 'CIS 443', 'SWE 321', 'SWE 411', 'SWE 413', 'SWE 410', 'CSK 001']);
  enrolled(G, T1, [['CIS 492', '01'], ['SWE 401', '01'], ['SWE 415', '01'], ['SWE 412', '01']]);

  // Faisal (BCNE level 3, Khobar): Fall 2025 intake.
  const F = ctx.users.student2;
  completed(F, '2025-1', [...Y1S1, 'SOS 101']);
  completed(F, '2025-2', ['CIS 104', 'CNE 100', 'MTH 104', 'PHY 103', 'ARB 102', 'PSY 101']);
  enrolled(F, T1, [['CIS 202', 'K1'], ['CNE 200', 'K1'], ['MTH 204', 'K1'], ['PHY 203', 'K1'], ['ENG 201', 'K1']]);

  // 5. class calendar entries for every enrolled section (whole term) + two exams
  resetCaches();
  for (const student of [S, L, G, F]) seedClassCalendar(d, student, T1);
  const exam = (owner: string, id: string, title: string, date: string, start: string, end: string, room: string) =>
    upsertEntry(owner, { source_type: 'exam', source_id: id, title, kind: 'exam', start_at: localToIso(date, start), end_at: localToIso(date, end), location_id: room, location_text: roomName(d, room), immovable: true, link: '/academics/timetable' });
  exam(S, 'exam_cis321_mid_2026-1', 'CIS 321 · Midterm exam', '2026-10-20', '11:00', '13:00', 'ryd_room_b204');
  exam(S, 'exam_swe302_mid_2026-1', 'SWE 302 · Midterm exam', '2026-10-22', '09:30', '11:30', 'ryd_room_b101');

  // 6. attendance up to today
  const absences: Record<string, Array<{ code: string; date: string; start: string; status: string }>> = {
    [S]: [{ code: 'SWE 302', date: '2026-09-21', start: '09:30', status: 'absent' }, { code: 'CIS 321', date: '2026-09-22', start: '11:00', status: 'absent' }, { code: 'CIS 316', date: '2026-09-14', start: '11:00', status: 'late' }],
    [F]: [{ code: 'CNE 200', date: '2026-09-16', start: '09:30', status: 'absent' }]
  };
  for (const student of [S, F]) seedAttendance(d, student, T1, ctx.today, absences[student] ?? []);

  // 7. evidence documents (synthetic)
  const saraDoc = createDocumentFromBuffer(S, 'medical', 'sehhaty-sick-leave-demo.pdf', 'application/pdf', makePdf([
    'Sehhaty - Sick Leave Report (SYNTHETIC DEMO)', 'Ministry of Health e-services (demo rendering)', '',
    'Patient name: Sara Al-Otaibi', 'National ID: **** **** 118', 'Report No: SL-2026-000412', 'Issued by: Demo Medical Center', 'Physician: Dr. Demo Practitioner',
    'Diagnosis: acute upper respiratory infection (demo)', 'Sick leave from 21/09/2026 to 22/09/2026', 'Duration: 2 days', 'Issued on: 21/09/2026', '',
    'This document is synthetic demo data generated for the UniJourney prototype.', 'It is not an official Sehhaty report and carries no verification.'
  ], 'Sick leave report (demo)'), 'Sehhaty sick-leave report (demo)', { synthetic: true });
  createDocumentFromBuffer(S, 'event_evidence', 'hackathon-invitation-demo.pdf', 'application/pdf', makePdf([
    'Riyadh Student Hackathon 2026 - Invitation (SYNTHETIC DEMO)', 'Organizer: Demo Tech Community', 'Invitation ID: INV-2026-HCK-0173', '',
    'Participant: Sara Al-Otaibi', 'Team: UniJourney Builders', 'Event dates: 5 October 2026 to 6 October 2026', 'Venue: Demo Innovation Hub, Riyadh', '',
    'The participant is invited to represent Al Yamamah University (demo).', 'Synthetic document for prototype demonstration only.'
  ], 'Hackathon invitation (demo)'), 'Hackathon invitation (demo)', { synthetic: true });
  const faisalDoc = createDocumentFromBuffer(F, 'medical', 'sehhaty-sick-leave-demo-2.pdf', 'application/pdf', makePdf([
    'Sehhaty - Sick Leave Report (SYNTHETIC DEMO)', '', 'Patient name: Faisal Al-Dossari', 'Report No: SL-2026-000377', 'Issued by: Demo Medical Center Khobar',
    'Sick leave from 16/09/2026 to 17/09/2026', 'Duration: 2 days', '', 'Synthetic demo document. Not an official report.'
  ], 'Sick leave report (demo)'), 'Sehhaty sick-leave report (demo)', { synthetic: true });
  void saraDoc;

  // 8. study settings, tasks, baseline version (Sara)
  d.insert('study_settings', { student_id: S, daily_capacity_min: 180, weekday_capacity: j({ '5': 60 }), unavailable_dates: j(['2026-10-01']), updated_at: now });
  const tasks: Array<Record<string, unknown>> = [
    { id: 'task_sara_01', course_code: 'CIS 321', title: 'Read ch. 4 — process scheduling', effort_min: 90, deadline: '2026-09-29', scheduled_date: '2026-09-28', priority: 2 },
    { id: 'task_sara_02', course_code: 'CIS 321', title: 'Exam revision CIS 321 (quiz 2)', effort_min: 120, deadline: '2026-10-06', scheduled_date: '2026-10-05', locked: 1, priority: 1, notes: 'Locked: revision block agreed with study group.' },
    { id: 'task_sara_03', course_code: 'SWE 302', title: 'Architecture design document — first draft', effort_min: 120, deadline: '2026-10-03', scheduled_date: '2026-09-30', status: 'partial', progress: 40, actual_min: 50, priority: 1 },
    { id: 'task_sara_04', course_code: 'SWE 312', title: 'UI prototype in Figma (assignment 2)', effort_min: 90, deadline: '2026-10-05', scheduled_date: '2026-10-01', priority: 2 },
    { id: 'task_sara_05', course_code: 'CIS 316', title: 'Search algorithms problem set', effort_min: 60, deadline: '2026-09-26', scheduled_date: '2026-09-24', priority: 2 },
    { id: 'task_sara_06', course_code: 'SWE 322', title: 'REST API lab — implement endpoints', effort_min: 90, deadline: '2026-10-04', scheduled_date: '2026-10-02', priority: 2 },
    { id: 'task_sara_07', course_code: 'SWE 302', title: 'Weekly reading ch. 5 — architectural styles', effort_min: 45, deadline: '2026-10-07', scheduled_date: null, priority: 3 },
    { id: 'task_sara_08', course_code: 'CIS 321', title: 'Lab report 2 — memory management', effort_min: 60, deadline: '2026-10-08', scheduled_date: null, priority: 2 },
    { id: 'task_sara_09', course_code: null, title: 'Mock interview preparation', effort_min: 45, deadline: '2026-10-09', scheduled_date: '2026-10-08', locked: 1, priority: 3, notes: 'Locked: booked with the career centre.' },
    { id: 'task_sara_10', course_code: 'SWE 312', title: 'Group meeting notes and action items', effort_min: 30, deadline: '2026-10-02', scheduled_date: '2026-09-24', status: 'done', progress: 100, actual_min: 25, completed_at: localToIso('2026-09-24', '19:10') },
    { id: 'task_sara_11', course_code: null, title: 'Hackathon pitch deck (Riyadh Student Hackathon)', effort_min: 90, deadline: '2026-10-10', scheduled_date: null, priority: 2, source: 'event' }
  ];
  for (const t of tasks) {
    const row: Record<string, unknown> = { student_id: S, course_code: null, deadline: null, scheduled_date: null, locked: 0, status: 'todo', progress: 0, actual_min: 0, source: 'manual', resource_id: null, event_id: null, notes: null, priority: 2, history: j([{ at: now, action: 'created', by: 'seed' }]), created_at: now, updated_at: now, completed_at: null, ...t };
    d.insert('study_tasks', row);
    taskCalendarSync(S, row.id as string);
  }
  const snapshot = d.all('SELECT id, title, course_code, effort_min, deadline, scheduled_date, locked, status, progress, actual_min FROM study_tasks WHERE student_id = ?', S);
  d.insert('study_plan_versions', { id: 'spv_sara_baseline', student_id: S, label: 'Seeded baseline', reason: 'Initial plan created at seed time', snapshot: j({ tasks: snapshot }), created_at: now });

  // 9. an excuse request already under review (Faisal) so the reviewer queue is not empty
  const faisalAtt = attendanceId(F, 'CNE 200', '2026-09-16', '09:30');
  d.insert('excuse_requests', {
    id: 'exc_faisal_seed_01', student_id: F, attendance_ids: j([faisalAtt]), type: 'medical', reason: 'Fever and flu symptoms; treated at a clinic in Khobar (demo).', from_date: '2026-09-16', to_date: '2026-09-17', reference: 'SL-2026-000377',
    document_ids: j([faisalDoc.id]), extracted: j({ documentId: faisalDoc.id, provider: 'demo', textFound: true, fromDate: { value: '2026-09-16', confidence: 0.9, source: 'Sick leave from 16/09/2026 to 17/09/2026' }, toDate: { value: '2026-09-17', confidence: 0.9, source: 'Sick leave from 16/09/2026 to 17/09/2026' }, reference: { value: 'SL-2026-000377', confidence: 0.85, source: 'Report No: SL-2026-000377' }, patientName: { value: 'Faisal Al-Dossari', confidence: 0.7, source: 'Patient name: Faisal Al-Dossari' }, issuer: { value: 'Demo Medical Center Khobar', confidence: 0.6, source: 'Issued by: Demo Medical Center Khobar' }, note: 'Fields extracted from the document text layer.' }),
    event_id: null, status: 'under_review', portal_request_id: 'EX-2026-0088', review_department: 'Deanship of Student Affairs (demo)', reviewer_id: null, reviewer_note: null, revision: 2, payload_hash: '', approval_id: null, operation_id: 'op_seed_excuse_faisal',
    history: j([
      { at: localToIso('2026-09-18', '10:05'), action: 'created', by: F, note: 'Draft created from attendance record' },
      { at: localToIso('2026-09-18', '10:20'), action: 'evidence_attached', by: F, note: 'sehhaty-sick-leave-demo-2.pdf' },
      { at: localToIso('2026-09-18', '10:26'), action: 'approved', by: F, note: 'Student approved the final review' },
      { at: localToIso('2026-09-18', '10:27'), action: 'submitted', by: F, note: 'Demo submission EX-2026-0088' },
      { at: localToIso('2026-09-19', '08:40'), action: 'under_review', by: 'portal', note: 'Assigned to the reviewing department' }
    ]),
    created_at: localToIso('2026-09-18', '10:05'), updated_at: localToIso('2026-09-19', '08:40')
  });
  d.insert('portal_operations', { id: 'op_seed_excuse_faisal', kind: 'excuse', student_id: F, payload_hash: 'seed', idempotency_key: 'excuse:exc_faisal_seed_01:r2:seed', status: 'committed', result: j({ portal_request_id: 'EX-2026-0088', simulated: true }), created_at: localToIso('2026-09-18', '10:27'), completed_at: localToIso('2026-09-18', '10:27') });
}

function roomName(d: SeedContext['db'], id: string): string {
  const r = d.get('SELECT name_en FROM campus_locations WHERE id = ?', id);
  return (r?.name_en as string) ?? id;
}

/** Creates class calendar entries for every meeting occurrence of the student's enrolled sections in a term. */
export function seedClassCalendar(d: SeedContext['db'], studentId: string, term: string) {
  const rows = d.all(`SELECT s.*, c.title_en FROM transcript_entries t JOIN course_sections s ON s.id = t.section_id JOIN courses c ON c.code = s.course_code WHERE t.student_id = ? AND t.term = ? AND t.status = 'enrolled'`, studentId, term);
  for (const s of rows) {
    const meetings = JSON.parse(s.meetings as string) as Meeting[];
    for (const occ of meetingOccurrences({ meetings }, term)) {
      upsertEntry(studentId, {
        source_type: 'section', source_id: `${s.id}:${occ.date}:${occ.start}`, title: `${s.course_code} · ${s.title_en}`, kind: 'class',
        start_at: localToIso(occ.date, occ.start), end_at: localToIso(occ.date, occ.end), location_id: occ.location_id, location_text: occ.location_id ? roomName(d, occ.location_id) : null,
        immovable: true, link: '/academics/timetable', meta: { section_id: s.id, course_code: s.course_code }
      });
    }
  }
}

function seedAttendance(d: SeedContext['db'], studentId: string, term: string, today: string, overrides: Array<{ code: string; date: string; start: string; status: string }>) {
  const rows = d.all(`SELECT s.* FROM transcript_entries t JOIN course_sections s ON s.id = t.section_id WHERE t.student_id = ? AND t.term = ? AND t.status = 'enrolled'`, studentId, term);
  const now = nowIso();
  for (const s of rows) {
    const meetings = JSON.parse(s.meetings as string) as Meeting[];
    for (const occ of meetingOccurrences({ meetings }, term)) {
      if (occ.date >= today) continue;
      const o = overrides.find((x) => x.code === s.course_code && x.date === occ.date && x.start === occ.start);
      const status = o?.status ?? 'present';
      d.insert('attendance_records', { id: attendanceId(studentId, s.course_code as string, occ.date, occ.start), student_id: studentId, section_id: s.id, course_code: s.course_code, session_date: occ.date, start_time: occ.start, end_time: occ.end, location_id: occ.location_id, status, original_status: status, excuse_request_id: null, updated_at: now });
    }
  }
}
