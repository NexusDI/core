import { errorBase, type ErrorTextPack } from '@nexusdi/core';

// A third-party package's error and its text pack, declared the way such a
// package declares them: a class from errorBase with its own docs base url,
// its code added to NexusErrorByCode by augmentation, and a pack that reads
// the hidden lookup and asks the kit for near misses.
export class DockingBayError extends errorBase<
  'ACME_DOCKING_BAY',
  { bay: string; module: string }
>('ACME_DOCKING_BAY', 'DockingBayError', 'https://acme.dev/errors/') {}

declare module '@nexusdi/core' {
  interface NexusErrorByCode {
    ACME_DOCKING_BAY: DockingBayError;
  }
}

/** What a DockingBayError looked up, stored as a hidden option. */
export interface DockingLookup {
  readonly token: unknown;
  readonly moduleId: string;
}

export const dockingText = {
  ACME_DOCKING_BAY: (error, _view, kit) => {
    const lookup = (error as { lookup?: DockingLookup }).lookup;
    return {
      message: `${error.module} asked for the ${error.bay} bay, which no module provides.`,
      fix: 'provide it: provide(DOCKING_BAY, { useClass: ShuttleBay }).',
      nearMisses:
        lookup === undefined
          ? []
          : kit.nearMisses(lookup.token, lookup.moduleId),
    };
  },
} satisfies ErrorTextPack;
