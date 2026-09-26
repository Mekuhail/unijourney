import type { Approval } from '../../shared/types.ts';
import { db } from './db.ts';
import { newId, stableHash } from './ids.ts';
import { now, nowIso } from './clock.ts';
import { getPolicies } from './settings.ts';

export { stableHash };

/**
 * Approval records bind a student decision to an exact payload revision. Consequential actions
 * (portal submissions) must present a valid approval whose hash still matches the current payload.
 */
export function createApproval(ownerId: string, kind: Approval['kind'], entityId: string, revision: number, payloadHash: string): Approval {
  const ttl = getPolicies().approvalTtlMinutes.value;
  // Any earlier approval for the same entity is superseded.
  db().run(`UPDATE approvals SET status = 'invalidated', decided_at = ? WHERE kind = ? AND entity_id = ? AND status = 'approved'`, nowIso(), kind, entityId);
  const a: Approval = {
    id: newId('apr'),
    owner_id: ownerId,
    kind,
    entity_id: entityId,
    revision,
    payload_hash: payloadHash,
    status: 'approved',
    expires_at: new Date(now().getTime() + ttl * 60000).toISOString(),
    idempotency_key: `${kind}:${entityId}:r${revision}:${payloadHash.slice(0, 16)}`,
    created_at: nowIso(),
    decided_at: null
  };
  db().insert('approvals', a as unknown as Record<string, unknown>);
  return a;
}

export function getApproval(id: string): Approval | null {
  return (db().get<Approval>('SELECT * FROM approvals WHERE id = ?', id) as Approval) ?? null;
}

export type ApprovalCheck = 'valid' | 'expired' | 'invalidated' | 'consumed' | 'mismatch' | 'missing' | 'wrong_owner';

export function checkApproval(id: string | null | undefined, expect: { ownerId: string; entityId: string; payloadHash: string; revision: number }): { result: ApprovalCheck; approval: Approval | null } {
  if (!id) return { result: 'missing', approval: null };
  const a = getApproval(id);
  if (!a) return { result: 'missing', approval: null };
  if (a.owner_id !== expect.ownerId) return { result: 'wrong_owner', approval: a };
  if (a.entity_id !== expect.entityId) return { result: 'mismatch', approval: a };
  if (a.status === 'consumed') return { result: 'consumed', approval: a };
  if (a.status === 'invalidated') return { result: 'invalidated', approval: a };
  if (a.status === 'expired' || new Date(a.expires_at).getTime() < now().getTime()) {
    if (a.status !== 'expired') db().run(`UPDATE approvals SET status = 'expired' WHERE id = ?`, id);
    return { result: 'expired', approval: { ...a, status: 'expired' } };
  }
  if (a.payload_hash !== expect.payloadHash || a.revision !== expect.revision) return { result: 'mismatch', approval: a };
  return { result: 'valid', approval: a };
}

export function consumeApproval(id: string) {
  db().run(`UPDATE approvals SET status = 'consumed', decided_at = ? WHERE id = ?`, nowIso(), id);
}

export function invalidateApprovals(kind: Approval['kind'], entityId: string) {
  db().run(`UPDATE approvals SET status = 'invalidated', decided_at = ? WHERE kind = ? AND entity_id = ? AND status = 'approved'`, nowIso(), kind, entityId);
}

export function listApprovals(ownerId: string): Approval[] {
  return db().all<Approval>('SELECT * FROM approvals WHERE owner_id = ? ORDER BY created_at DESC LIMIT 100', ownerId);
}
