import { defineModule, provide } from '@nexusdi/core';

import {
  COMMS_OPTIONS,
  SUBSPACE_LINK,
  type CommsOptions,
  type ISubspaceLink,
} from './contracts';

class SubspaceRelay implements ISubspaceLink {
  static deps = [COMMS_OPTIONS] as const;
  constructor(private readonly options: CommsOptions) {}
  async receive<T>(channel: string): Promise<T> {
    const url = new URL(
      channel,
      this.options.relayUrl.endsWith('/')
        ? this.options.relayUrl
        : `${this.options.relayUrl}/`,
    );
    url.searchParams.set('frequency', String(this.options.frequency));
    const res = await fetch(url);
    if (!res.ok) throw new Error(`relay answered ${res.status} for ${channel}`);
    return (await res.json()) as T;
  }
}

export const Comms = defineModule({
  name: 'Comms',
  options: COMMS_OPTIONS,
  providers: [provide(SUBSPACE_LINK, { useClass: SubspaceRelay })],
  exports: [SUBSPACE_LINK],
});
