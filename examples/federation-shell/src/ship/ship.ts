import { Nexus, type NexusPlugin } from '@nexusdi/core';
import { devtools } from '@nexusdi/devtools';
import { errors } from '@nexusdi/errors';
import { federation } from '@nexusdi/federation';
import { federationText } from '@nexusdi/federation/text';

import { Meridian } from './meridian';

/** Whether this build registers devtools(): development and the e2e build. */
declare const MERIDIAN_DEVTOOLS: boolean | undefined;

export const withDevtools =
  typeof MERIDIAN_DEVTOOLS === 'boolean' && MERIDIAN_DEVTOOLS;

/** The shell's container, `ship`. */
export function createShip(): Promise<Nexus> {
  const plugins: NexusPlugin[] = [
    federation(),
    errors({ text: [federationText] }),
    ...(withDevtools ? [devtools()] : []),
  ];
  return Nexus.create(Meridian, { plugins });
}
