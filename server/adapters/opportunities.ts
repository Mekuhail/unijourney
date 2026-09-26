import { addDays } from '../core/clock.ts';

/**
 * OpportunitySourceAdapter. The prototype ships ONLY the deterministic demo provider: a synthetic feed that returns a
 * fixed set of labelled records when "Refresh demo feed" is pressed. No crawlers, no job boards, no external polling.
 * A real provider (careers pages, an ATS export, a university partner feed) would implement `fetchNew()` behind explicit
 * configuration and per-source rate limits; the module dedupes by (source, source_id) and by normalized URL so a provider
 * may safely return the same record twice.
 */
export interface OpportunityRecord {
  source: string;
  source_id: string;
  url: string;
  title: string;
  company: string;
  type: 'internship' | 'coop' | 'entry' | 'research' | 'competition';
  location: string;
  city: string;
  remote: 'onsite' | 'remote' | 'hybrid';
  field: string;
  skills: string[];
  eligibility: string;
  deadline: string | null;
  posted_at: string;
  description: string;
  salary?: string | null;
  status: 'active' | 'expired' | 'unverified' | 'demo';
}

export interface OpportunitySourceAdapter {
  name: string;
  provider: 'demo';
  simulated: true;
  /** Returns candidate records; the caller dedupes and labels them. */
  fetchNew(ctx: { today: string }): OpportunityRecord[];
}

export const demoOpportunitySource: OpportunitySourceAdapter = {
  name: 'demo-feed',
  provider: 'demo',
  simulated: true,
  fetchNew({ today }) {
    // Deterministic: the same two records every time (the module skips the ones it already has).
    return [
      {
        source: 'demo-feed', source_id: 'feed-2026-10-riyadh-frontend-intern', url: 'https://careers.example-demo.sa/aratech/frontend-intern-2027',
        title: 'Front-end Engineering Intern (React)', company: 'AraTech Digital', type: 'internship', location: 'Riyadh – Digital City', city: 'Riyadh', remote: 'hybrid',
        field: 'software', skills: ['React', 'TypeScript', 'CSS', 'Git'],
        eligibility: 'Current YU students in level 5 or above (software engineering, MIS or related).', deadline: addDays(today, 28), posted_at: today,
        description: 'Join the product team building customer portals for enterprise clients. You will pair with senior engineers on React components, accessibility fixes and design-system work. Eight weeks, paid stipend.', salary: 'SAR 3,000 / month stipend', status: 'demo'
      },
      {
        source: 'demo-feed', source_id: 'feed-2026-10-ai-lab-research-assistant', url: 'https://careers.example-demo.sa/national-ai-lab/student-research-assistant',
        title: 'Student Research Assistant – Arabic NLP', company: 'National AI Lab – demo', type: 'research', location: 'Riyadh', city: 'Riyadh', remote: 'onsite',
        field: 'data & ai', skills: ['Python', 'Machine Learning', 'SQL'],
        eligibility: 'Undergraduate students with at least one AI or data course; part-time during term.', deadline: addDays(today, 21), posted_at: today,
        description: 'Support a research group evaluating Arabic language models on dialect data. Tasks include dataset cleaning, running evaluation scripts and writing short reports. Ten hours per week alongside classes.', salary: null, status: 'demo'
      }
    ];
  }
};
