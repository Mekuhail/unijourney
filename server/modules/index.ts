import type { Router } from 'express';
import type { SeedContext } from '../seed/context.ts';
import { admissionModule } from './admission/index.ts';
import { academicsModule } from './academics/index.ts';
import { campusModule } from './campus/index.ts';
import { careerModule } from './career/index.ts';
import { graduationModule } from './graduation/index.ts';

export interface AppModule {
  name: string;            // URL segment under /api/
  router: Router;
  seed?: (ctx: SeedContext) => void;   // runs inside a transaction after core seed, in module order
}

export const modules: AppModule[] = [admissionModule, academicsModule, campusModule, careerModule, graduationModule];
