import { readdirSync } from 'node:fs';
import { join, relative, sep } from 'node:path';

/**
 * Every file under a package directory, as the package-relative posix paths
 * stagedProblems (lib.mjs) compares against. tools/release/stage.mjs reads
 * the staged copy with it and scripts/verify-packaging.mjs the installed one.
 */
export const packageFiles = (root) =>
  readdirSync(root, { recursive: true, withFileTypes: true })
    .filter((entry) => entry.isFile())
    .map((entry) =>
      relative(root, join(entry.parentPath, entry.name)).split(sep).join('/'),
    );
