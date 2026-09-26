import { describe, it, expect, beforeEach } from 'vitest';
import { freshDb } from './helpers.ts';
import { createApproval, checkApproval, consumeApproval, invalidateApprovals, stableHash } from '../server/core/approvals.ts';
import { setClockOverride } from '../server/core/clock.ts';

describe('approvals bind exact payload revisions', () => {
  beforeEach(() => freshDb());

  it('valid when hash, revision and owner match', () => {
    const hash = stableHash({ term: '2026-2', section_ids: ['a', 'b'] });
    const a = createApproval('u_student', 'enrollment', 'prop_1', 1, hash);
    expect(checkApproval(a.id, { ownerId: 'u_student', entityId: 'prop_1', payloadHash: hash, revision: 1 }).result).toBe('valid');
    expect(stableHash({ section_ids: ['a', 'b'], term: '2026-2' })).toBe(hash); // key order independent
  });

  it('mismatch when the payload changed (material change invalidates)', () => {
    const hash = stableHash({ term: '2026-2', section_ids: ['a', 'b'] });
    const a = createApproval('u_student', 'enrollment', 'prop_1', 1, hash);
    const changed = stableHash({ term: '2026-2', section_ids: ['a', 'c'] });
    expect(checkApproval(a.id, { ownerId: 'u_student', entityId: 'prop_1', payloadHash: changed, revision: 2 }).result).toBe('mismatch');
    invalidateApprovals('enrollment', 'prop_1');
    expect(checkApproval(a.id, { ownerId: 'u_student', entityId: 'prop_1', payloadHash: hash, revision: 1 }).result).toBe('invalidated');
  });

  it('expires after the policy TTL and cannot be reused after consumption', () => {
    const hash = stableHash({ x: 1 });
    const a = createApproval('u_student', 'excuse', 'exc_1', 1, hash);
    consumeApproval(a.id);
    expect(checkApproval(a.id, { ownerId: 'u_student', entityId: 'exc_1', payloadHash: hash, revision: 1 }).result).toBe('consumed');
    const b = createApproval('u_student', 'excuse', 'exc_2', 1, hash);
    setClockOverride('2026-09-27T11:00:00+03:00'); // +2h > 30 min TTL
    expect(checkApproval(b.id, { ownerId: 'u_student', entityId: 'exc_2', payloadHash: hash, revision: 1 }).result).toBe('expired');
  });

  it('rejects another owner and missing ids', () => {
    const hash = stableHash({ x: 1 });
    const a = createApproval('u_student', 'excuse', 'exc_1', 1, hash);
    expect(checkApproval(a.id, { ownerId: 'u_lead', entityId: 'exc_1', payloadHash: hash, revision: 1 }).result).toBe('wrong_owner');
    expect(checkApproval('nope', { ownerId: 'u_student', entityId: 'exc_1', payloadHash: hash, revision: 1 }).result).toBe('missing');
  });

  it('a new approval for the same entity supersedes the previous one', () => {
    const hash = stableHash({ x: 1 });
    const a = createApproval('u_student', 'enrollment', 'p', 1, hash);
    const b = createApproval('u_student', 'enrollment', 'p', 2, stableHash({ x: 2 }));
    expect(checkApproval(a.id, { ownerId: 'u_student', entityId: 'p', payloadHash: hash, revision: 1 }).result).toBe('invalidated');
    expect(checkApproval(b.id, { ownerId: 'u_student', entityId: 'p', payloadHash: stableHash({ x: 2 }), revision: 2 }).result).toBe('valid');
  });
});
