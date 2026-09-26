import { Router } from 'express';
import type { AppModule } from '../index.ts';
import { opportunitiesRouter } from './routes-opportunities.ts';
import { applicationsRouter } from './routes-applications.ts';
import { emailsRouter } from './routes-emails.ts';
import { profileRouter } from './routes-profile.ts';
import { seedCareer } from './seed.ts';

/**
 * Career module: discovery (seeded demo feed + manual links), per-student tracker with attested "applied", interviews on
 * the shared calendar, synthetic hiring-email review and the graduation → career handoff. All records are owner-scoped;
 * staff roles have no access to career data.
 */
export const careerRouter = Router();
careerRouter.use(opportunitiesRouter);
careerRouter.use(applicationsRouter);
careerRouter.use(emailsRouter);
careerRouter.use(profileRouter);

export const careerModule: AppModule = {
  name: 'career',
  router: careerRouter,
  seed: seedCareer
};
