import type { CacheText } from './text.js';
import { label } from './shared.js';

export const cache = (text?: CacheText): string => label(text?.name ?? 'cache');
