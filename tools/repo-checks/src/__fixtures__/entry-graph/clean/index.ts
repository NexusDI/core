// The main entry reaches feature.ts and shared.ts. It names text.ts and
// devtools/ only in type positions, which the compiler erases.
export { cache } from './feature.js';
export type { CacheText } from './text.js';
export type { CacheNotes } from './devtools/notes.js';
