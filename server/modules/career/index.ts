import { Router } from 'express';
import { gate } from '../../core/auth.ts';
import type { AppModule } from '../index.ts';
import { opportunitiesRouter } from './routes-opportunities.ts';
import { applicationsRouter } from './routes-applications.ts';
import { emailsRouter } from './routes-emails.ts';
import { profileRouter } from './routes-profile.ts';
import { seedCareer } from './seed.ts';
import { portfolioRouter } from './portfolio.ts';
import { competitionsRouter } from './competitions.ts';

/**
 * Career module: discovery (seeded demo feed + manual links), competitions (own lifecycle), a portfolio with evidence-
 * weighted skills (LinkedIn export import, GitHub public API), per-student tracker with attested "applied", interviews on
 * the shared calendar, synthetic hiring-email review and the graduation → career handoff. All records are owner-scoped;
 * staff roles have no access to career data.
 */
export const careerRouter = Router();
careerRouter.use('/portfolio', gate('portfolio'));
careerRouter.use(['/competitions', '/competitions-live'], gate('competitions'));
careerRouter.use(['/opportunities', '/feed', '/applications', '/interviews', '/emails', '/settings', '/profile', '/skill-gaps', '/handoff'], gate('career'));
careerRouter.use(opportunitiesRouter);
careerRouter.use(applicationsRouter);
careerRouter.use(emailsRouter);
careerRouter.use(profileRouter);
careerRouter.use(portfolioRouter);
careerRouter.use(competitionsRouter);

export const careerModule: AppModule = {
  name: 'career',
  router: careerRouter,
  seed: seedCareer
};
