import { cache } from '../feature.js';

export interface CacheNotes {
  readonly note: string;
}

export const cacheNotes = (): CacheNotes => ({ note: cache() });
