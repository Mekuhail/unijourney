import { Router } from 'express';
import { gate } from '../../core/auth.ts';
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
// Student-only areas (role → capability matrix in shared/access.ts). Staff endpoints (/review/*) keep their own role checks.
academicsRouter.use(['/overview', '/timetable'], gate('academics'));
academicsRouter.use(['/audit', '/plan'], gate('degreePlan'));
academicsRouter.use(['/sections', '/proposals', '/peers'], gate('registration'));
academicsRouter.use(['/attendance', '/excuses'], gate('attendance'));
academicsRouter.use(['/study', '/planner/items', '/planner/quick'], gate('study'));
academicsRouter.get('/planner', gate('study')); // /planner/emails and /planner/demo keep their own checks
academicsRouter.use('/gpa', gate('gpa'));
academicsRouter.use('/prereqs', gate('prereqs'));
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
