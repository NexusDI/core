/**
 * True while the build is not a production build. Toolchains replace
 * `process.env.NODE_ENV` as a literal, and a page that has no `process` gets
 * `false`.
 */
export function inDevelopment(): boolean {
  try {
    return process.env.NODE_ENV !== 'production';
  } catch {
    return false;
  }
}
