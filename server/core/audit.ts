import { db, j } from './db.ts';
import { newId } from './ids.ts';
import { nowIso } from './clock.ts';

export function audit(actorId: string | null, action: string, entityType: string, entityId: string, payload: unknown = {}) {
  db().insert('audit_events', {
    id: newId('aud'),
    actor_id: actorId,
    action,
    entity_type: entityType,
    entity_id: entityId,
    payload: j(payload),
    created_at: nowIso()
  });
}

export function auditTrail(entityType: string, entityId: string) {
  return db().all('SELECT * FROM audit_events WHERE entity_type = ? AND entity_id = ? ORDER BY created_at', entityType, entityId);
}
