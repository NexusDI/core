import { label } from './shared.js';

export interface CacheText {
  readonly name: string;
}

export const cacheText = { name: label('cache') };
