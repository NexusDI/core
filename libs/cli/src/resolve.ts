import { createRequire } from 'node:module';
import { fileURLToPath, pathToFileURL } from 'node:url';

/** The file `specifier` resolves to from `fromFile`'s directory, or null. */
export function resolveFrom(
  specifier: string,
  fromFile: string,
): string | null {
  try {
    return createRequire(fromFile).resolve(specifier);
  } catch {
    return null;
  }
}

export async function importFile<T>(file: string): Promise<T> {
  return (await import(pathToFileURL(file).href)) as T;
}

/**
 * An optional peer: from the user's project first, so a one-off npx run
 * uses what the project installed, then from this package's own location.
 */
export async function importPeer<T>(
  specifier: string,
  fromFile: string,
): Promise<T | null> {
  const file =
    resolveFrom(specifier, fromFile) ??
    resolveFrom(specifier, fileURLToPath(import.meta.url));
  return file === null ? null : importFile<T>(file);
}
