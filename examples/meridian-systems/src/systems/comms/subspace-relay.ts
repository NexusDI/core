import { RelayError } from '../../errors';
import { formatNumber } from '../../text';

import {
  SUBSPACE_LINK_OPTIONS,
  type SubspaceLinkOptions,
  DEFAULT_RELAY_TIMEOUT,
  type ISubspaceLink,
  type SignOffReport,
} from './contracts';

/**
 * The subspace link over the fleet's HTTP relay. `NAV_CHARTS`'s factory calls
 * it once at startup, and no tick reads it.
 */
export class SubspaceRelay implements ISubspaceLink {
  static deps = [SUBSPACE_LINK_OPTIONS] as const;

  constructor(private readonly options: SubspaceLinkOptions) {}

  /**
   * Opens the link with the relay. The container runs this after it has built
   * the whole graph, so it follows the `NAV_CHARTS` download, and a Worker runs
   * it inside its first request. A relay that refuses or never answers fails
   * the build, as a failed chart download does.
   */
  async onInit(): Promise<void> {
    await this.#exchange('handshake', { method: 'POST' }, () => undefined);
  }

  /**
   * Tells the relay the ship is going offline, with the tick and the reactor
   * output. The array calls it while the reactor still runs. A relay that
   * refuses or stays silent past `relayTimeout` rejects with `RelayError`.
   */
  async signOff(report: SignOffReport): Promise<void> {
    await this.#exchange(
      'signoff',
      {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(report),
      },
      () => undefined,
    );
  }

  async receive<T>(channel: string): Promise<T> {
    return this.#exchange(channel, {}, (res) => res.json() as Promise<T>);
  }

  async #exchange<T>(
    channel: string,
    init: RequestInit,
    read: (res: Response) => T | Promise<T>,
  ): Promise<T> {
    const url = new URL(
      channel,
      this.options.relayUrl.endsWith('/')
        ? this.options.relayUrl
        : `${this.options.relayUrl}/`,
    );
    url.searchParams.set('frequency', String(this.options.frequency));
    const timeout = this.options.relayTimeout ?? DEFAULT_RELAY_TIMEOUT;
    // The signal covers the whole exchange, from connect to the last body byte.
    const signal = AbortSignal.timeout(timeout);
    try {
      const res = await fetch(url, { ...init, signal });
      if (!res.ok) {
        throw new Error(`The relay answered ${res.status} for ${channel}.`);
      }
      return await read(res);
    } catch (error) {
      if (signal.aborted) {
        throw new RelayError({
          channel,
          reason: 'timeout',
          expected: `within ${formatNumber(timeout, 0)} ms`,
        });
      }
      throw error;
    }
  }
}
