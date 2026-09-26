import type { Db } from '../core/db.ts';

export interface SeedContext {
  db: Db;
  /** Persona ids created by the core seed. */
  users: {
    student: string;      // current student (BSE, level 6)
    lead: string;         // student + club lead
    student2: string;     // Khobar CNE student
    applicant: string;
    graduating: string;
    reviewer: string;
    admissions: string;
    security: string;
    operator: string;
  };
  today: string;          // YYYY-MM-DD (demo clock)
  term: string;           // current term id
  nextTerm: string;
}
