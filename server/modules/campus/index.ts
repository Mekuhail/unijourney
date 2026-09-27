import { Router } from 'express';
import type { AppModule } from '../index.ts';
import { db } from '../../core/db.ts';
import { hasRole } from '../../core/auth.ts';
import { registerDocumentGrant } from '../../core/documents.ts';
import { clubsRouter } from './clubs.ts';
import { communityRouter } from './community.ts';
import { socialRouter } from './social.ts';
import { messagesRouter } from './messages.ts';
import { parkingRouter } from './parking.ts';
import { eventsRouter } from './events.ts';
import { resourcesRouter } from './resources.ts';
import { mapRouter } from './map.ts';
import { lostFoundRouter } from './lostfound.ts';
import { seedCampus } from './seed.ts';

export const campusRouter = Router();
campusRouter.use(clubsRouter);
campusRouter.use(communityRouter);
campusRouter.use(socialRouter);
campusRouter.use(messagesRouter);
campusRouter.use(parkingRouter);
campusRouter.use(eventsRouter);
campusRouter.use(resourcesRouter);
campusRouter.use(mapRouter);
campusRouter.use(lostFoundRouter);

/**
 * Document access grants owned by this module:
 *  - files attached to PUBLISHED resources are readable by any signed-in user (moderators may open pending ones);
 *  - lost-item photos are readable by campus security while attached to a request.
 * Medical documents are never granted here.
 */
registerDocumentGrant((doc, user) => {
  if (doc.kind === 'resource') {
    const r = db().get<{ status: string }>('SELECT status FROM resources WHERE document_id = ?', doc.id);
    if (!r) return false;
    if (r.status === 'published' || r.status === 'reported') return true;
    return hasRole(user, 'reviewer', 'registrar');
  }
  if (doc.kind === 'lost_item') {
    return hasRole(user, 'security') && !!db().get('SELECT 1 FROM lost_found_requests WHERE document_id = ?', doc.id);
  }
  return false;
});

export const campusModule: AppModule = {
  name: 'campus',
  router: campusRouter,
  seed: seedCampus
};
