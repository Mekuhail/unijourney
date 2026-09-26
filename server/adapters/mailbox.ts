/**
 * MailboxAdapter. Real Gmail / Microsoft 365 sync is NOT connected in the prototype and is intentionally left as an
 * interface only. A real provider needs: scoped read-only consent per student, tokens stored server-side per user,
 * a disconnect action that deletes the tokens and imported messages, and a filter so that only hiring-related mail is
 * ever classified (unrelated or medical inbox content must never reach the classifier, notes or logs).
 *
 * The demo provider generates synthetic hiring emails from fictional domains so the review flow can be demonstrated.
 * Email text is treated as untrusted data: it is classified with deterministic keyword rules and never executed or
 * used as instructions.
 */
export interface MailboxMessage {
  from_address: string;
  subject: string;
  snippet: string;
  body: string;
  received_at: string;
}

export interface MailboxAdapter {
  name: string;
  provider: 'demo';
  connected: false;
  simulated: true;
  /** Returns one synthetic message chosen deterministically from `seq` (how many were simulated before). */
  simulateMessage(ctx: { nowIso: string; seq: number; companies: string[] }): MailboxMessage;
}

const TEMPLATES: Array<(company: string, domain: string) => Omit<MailboxMessage, 'received_at'>> = [
  (c, d) => ({ from_address: `talent@${d}`, subject: `${c}: your technical assessment link`, snippet: 'Please complete the online assessment within 5 days.', body: `Hello,\n\nThank you for applying to ${c}. As the next step, please complete the online technical assessment using the link below within 5 days.\n\nAssessment link: https://assess.example-demo.sa/${d.split('.')[0]}/start\n\nBest regards,\nTalent Acquisition (demo)` }),
  (c, d) => ({ from_address: `recruiting@${d}`, subject: `Interview invitation – ${c}`, snippet: 'We would like to invite you to a 45-minute interview next week.', body: `Dear candidate,\n\nWe enjoyed reviewing your application to ${c} and would like to invite you to a 45-minute video interview next week. Please reply with two time slots that suit you.\n\nKind regards,\nRecruiting Team (demo)` }),
  (c, d) => ({ from_address: `no-reply@${d}`, subject: `Update on your application to ${c}`, snippet: 'After careful consideration we will not be moving forward at this time.', body: `Dear candidate,\n\nThank you for your interest in ${c}. After careful consideration we regret to inform you that we will not be moving forward with your application at this time. We encourage you to apply for future openings.\n\nRegards,\n${c} Careers (demo)` }),
  (c, d) => ({ from_address: `offers@${d}`, subject: `${c} – offer letter`, snippet: 'We are pleased to offer you the internship position.', body: `Dear candidate,\n\nWe are pleased to offer you the internship position at ${c}. Please find the offer details attached and confirm your acceptance within 7 days.\n\nWarm regards,\nPeople Operations (demo)` })
];

export function demoDomain(company: string): string {
  const slug = company.toLowerCase().replace(/\(.*?\)/g, '').replace(/[–-]\s*demo/g, '').replace(/[^a-z0-9]+/g, '').slice(0, 24) || 'company';
  return `${slug}.example-demo.sa`;
}

export const demoMailbox: MailboxAdapter = {
  name: 'demo-mailbox',
  provider: 'demo',
  connected: false,
  simulated: true,
  simulateMessage({ nowIso, seq, companies }) {
    const company = companies[seq % Math.max(1, companies.length)] ?? 'Demo Company';
    const tpl = TEMPLATES[seq % TEMPLATES.length];
    return { ...tpl(company, demoDomain(company)), received_at: nowIso };
  }
};
