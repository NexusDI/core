export {
  ExpectCommentError,
  readValueClaim,
  rewriteJsDoc,
  rewriteLine,
  rewriteMarkdown,
} from './expect-comments.ts';
export type { ValueClaim } from './expect-comments.ts';
export { expectComments } from './vite-plugin.ts';
export { docExampleSources, docExamples } from './vite-config.ts';
export {
  PREAMBLE_FILE,
  preamblePath,
  readPreamble,
  withPreamble,
} from './preamble.mjs';
export { RegionError, parseRegions, readRegion } from './regions.mjs';
export type { Region } from './regions.mjs';
export { expandRegions } from './mdx-region-loader.mjs';
