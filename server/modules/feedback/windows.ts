import { CURRENT_TERM, TERM_LABELS } from '../../core/settings.ts';
import { todayIso } from '../../core/clock.ts';

/**
 * Feedback windows. End-of-term feedback for the last completed term stays open for a few weeks; the current term runs
 * a mid-term check-in. Public KPI pages use the last three completed terms only, and only end-of-term responses, so
 * nothing about a course in progress is published while students are still being graded.
 */
export const END_TERM = '2025-2';
export const PUBLIC_TERMS = ['2024-2', '2025-1', '2025-2'];

export const WINDOWS = {
  end_of_term: { term: END_TERM, opens_on: '2026-05-10', closes_on: '2026-10-08' },
  mid_term: { term: CURRENT_TERM, opens_on: '2026-09-20', closes_on: '2026-10-15' }
} as const;

export type Phase = keyof typeof WINDOWS;

export function windowState(phase: Phase) {
  const w = WINDOWS[phase];
  const today = todayIso();
  const label = TERM_LABELS[w.term] ?? { en: w.term, ar: w.term };
  return { phase, term: w.term, term_label_en: label.en, term_label_ar: label.ar, opens_on: w.opens_on, closes_on: w.closes_on, open: today >= w.opens_on && today <= w.closes_on };
}

export function termLabelOf(term: string) {
  return TERM_LABELS[term] ?? { en: term, ar: term };
}
