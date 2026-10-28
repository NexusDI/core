import { errorBase } from './nexus-error.js';

interface LoadContributionFields {
  readonly module: string;
  readonly token: string;
}

/** load() received a module that exports a contribution to a MultiToken. */
export class LoadContributionError extends errorBase<
  'NEXUS_LOAD_CONTRIBUTION',
  LoadContributionFields
>('NEXUS_LOAD_CONTRIBUTION', 'LoadContributionError') {}
