import {
  COMMS_OPTIONS,
  type CommsOptions,
  type ISubspaceLink,
} from './contracts';

/**
 * The subspace link over the fleet's HTTP relay. `NAV_CHARTS`'s factory calls
 * it once at startup, and no tick reads it.
 */
export class SubspaceRelay implements ISubspaceLink {
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
