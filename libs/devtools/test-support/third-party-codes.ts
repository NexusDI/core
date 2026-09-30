import { errorBase, type ErrorTextPack, type NexusPlugin } from '@nexusdi/core';

// A third-party package's error, its text pack and a plugin that reports it
// from a check hook, declared the way such a package declares them.
export class ReactorOfflineError extends errorBase<
  'ACME_REACTOR_OFFLINE',
  { reactor: string }
>('ACME_REACTOR_OFFLINE', 'ReactorOfflineError', 'https://acme.dev/errors/') {}

declare module '@nexusdi/core' {
  interface NexusErrorByCode {
    ACME_REACTOR_OFFLINE: ReactorOfflineError;
  }
}

export const reactorText = {
  ACME_REACTOR_OFFLINE: (error) => ({
    message: `the ${error.reactor} reactor is offline.`,
    fix: 'start it before the container compiles.',
  }),
} satisfies ErrorTextPack;

/** Reports the aft reactor offline on every compile. */
export const reactorCheck: NexusPlugin = {
  name: 'acme:reactor',
  apiVersion: 1,
  compile: {
    check: (_view, report) => {
      report(new ReactorOfflineError({ reactor: 'aft' }));
    },
  },
};
