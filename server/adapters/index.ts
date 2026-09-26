import { config } from '../core/config.ts';

/**
 * Integration boundary. Every adapter defaults to a deterministic demo provider. Real providers are
 * documented interfaces only; none is enabled in the prototype, even when keys are present, except
 * the optional AI intent adapter (explanations/parsing) and Google Maps tiles on the client.
 */
export function adapterStatus() {
  return [
    { name: 'UniversityPortalAdapter (EduGate-style)', provider: 'demo', real: false, note: 'Preview/submit enrollment, attendance and excuses against an in-process mock portal with atomic capacity checks, operation IDs and simulated timeouts. Real EduGate integration requires an authorized connector (not verified).' },
    { name: 'DocumentExtractionAdapter (Sehhaty report / event evidence)', provider: 'demo', real: false, note: 'Extracts dates and reference numbers from digital PDFs and plain text; images need manual entry (optional OCR not bundled). Extraction never authenticates a report.' },
    { name: 'OpportunitySourceAdapter', provider: 'demo', real: false, note: 'Seeded synthetic feed; "Refresh demo feed" adds labelled records. No crawlers, no external job boards.' },
    { name: 'MailboxAdapter (hiring emails)', provider: 'demo', real: false, note: 'Synthetic hiring emails classified by deterministic rules with a review queue for ambiguous matches. Gmail is not connected; a real provider needs scoped read-only consent per user.' },
    { name: 'NotificationAdapter (email)', provider: 'demo-outbox', real: false, note: 'Emails are rendered and stored in an outbox for preview. Nothing is sent.' },
    { name: 'MapAdapter', provider: config.googleMapsKey ? 'google-tiles + osm-graph' : 'osm-tiles + osm-graph', real: true, note: 'Riyadh campus footprints/paths from OpenStreetMap (ODbL). Khobar geometry is approximate and labelled. Routing runs on the local graph; accessibility attributes are unverified.' },
    { name: 'AIIntentAdapter', provider: config.anthropicKey ? `anthropic:${config.anthropicModel}` : 'deterministic-rules', real: !!config.anthropicKey, note: 'Parses preferences and study tasks and explains proposals. Business rules are always enforced outside the model; the demo works with no key.' }
  ];
}
