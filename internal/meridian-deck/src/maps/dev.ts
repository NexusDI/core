/**
 * True while the build is not a production build. The maps entry keeps its own
 * copy so that the main entry's bundle holds no chunk shared with it.
 */
export function inDevelopment(): boolean {
  try {
    return process.env.NODE_ENV !== 'production';
  } catch {
    return false;
  }
}
