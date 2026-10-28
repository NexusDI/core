import {
  defineModule,
  provide,
  REQUEST,
  type NexusRequest,
} from '@nexusdi/core';

import { WATCH_LOG, type IWatchLog } from './contracts';

/**
 * One log per request, each entry prefixed with the request's mission. It
 * starts empty on every request, so an entry a page records is gone on the
 * next one.
 */
class WatchLog implements IWatchLog {
  static deps = [REQUEST] as const;
  readonly #entries: string[] = [];
  constructor(private readonly request: NexusRequest) {}
  record(entry: string) {
    this.#entries.push(`${this.request.mission.id}: ${entry}`);
  }
  entries() {
    return this.#entries;
  }
}

export const Watch = defineModule({
  name: 'Watch',
  providers: [provide(WATCH_LOG, { useClass: WatchLog, lifetime: 'scoped' })],
  exports: [WATCH_LOG],
});
