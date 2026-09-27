import { Router } from 'express';
import type { AppModule } from '../index.ts';
import { registerDocumentGrant } from '../../core/documents.ts';
import { overviewRouter } from './routes.overview.ts';
import { registrationRouter } from './routes.registration.ts';
import { attendanceRouter } from './routes.attendance.ts';
import { studyRouter } from './routes.study.ts';
import { plannerRouter } from './assessments.ts';
import { prereqsRouter } from './prereqs.ts';
import { seedAcademics } from './seed.ts';
import { reviewerCanOpenDocument } from './excuses.ts';

export const academicsRouter = Router();
academicsRouter.use(overviewRouter);
academicsRouter.use(registrationRouter);
academicsRouter.use(attendanceRouter);
academicsRouter.use(studyRouter);
academicsRouter.use(plannerRouter);
academicsRouter.use('/prereqs', prereqsRouter);

// Reviewers may open evidence only while the excuse request is in a review state.
registerDocumentGrant(reviewerCanOpenDocument);

export const academicsModule: AppModule = {
  name: 'academics',
  router: academicsRouter,
  seed: seedAcademics
};

export { computeDegreeAudit } from './audit.ts';
