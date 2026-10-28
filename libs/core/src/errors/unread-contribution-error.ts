import { errorBase } from './nexus-error.js';

interface UnreadContributionFields {
  readonly token: string;
  readonly module: string;
  readonly provider: string;
}

/** A module keeps a contribution to a MultiToken private, and no provider can read it. */
export class UnreadContributionError extends errorBase<
  'NEXUS_UNREAD_CONTRIBUTION',
  UnreadContributionFields
>('NEXUS_UNREAD_CONTRIBUTION', 'UnreadContributionError') {}
