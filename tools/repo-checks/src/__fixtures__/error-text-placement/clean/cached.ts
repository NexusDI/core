import { CacheKeyError } from './errors.js';

export function Cached(key: string) {
  if (key === '')
    throw new CacheKeyError(
      { key },
      { text: 'a cache key is empty.\n  Fix: pass a non-empty key.' },
    );
  return (target: object) => target;
}
