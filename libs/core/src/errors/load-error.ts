import { errorBase } from './nexus-error.js';

interface LoadFields {
  readonly module: string;
}

/** load() received a global module. */
export class LoadError extends errorBase<
  'NEXUS_LOAD_GLOBAL_MODULE',
  LoadFields
>('NEXUS_LOAD_GLOBAL_MODULE', 'LoadError') {}
