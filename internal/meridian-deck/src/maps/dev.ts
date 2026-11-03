/**
 * True while the build is not a production build. The maps entry keeps its own
 * copy, so the build keeps `state/dev.ts` inside `index.js` and leaves the main
 * entry's bytes alone.
 */
export function inDevelopment(): boolean {
  try {
    return process.env.NODE_ENV !== 'production';
  } catch {
    return false;
  }
}
