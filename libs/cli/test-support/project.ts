import { mkdirSync, mkdtempSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const LIBS = fileURLToPath(new URL('../../', import.meta.url));

/**
 * A project outside the workspace, so nothing resolves through the
 * workspace's node_modules: only the @nexusdi packages named here, linked
 * to their built libs, and the files given.
 */
export function makeProject(
  files: Readonly<Record<string, string>>,
  packages: readonly string[],
): string {
  const root = mkdtempSync(join(tmpdir(), 'nexusdi-cli-project-'));
  writeFileSync(join(root, 'package.json'), JSON.stringify({ type: 'module' }));
  mkdirSync(join(root, 'node_modules', '@nexusdi'), { recursive: true });
  for (const name of packages)
    symlinkSync(
      join(LIBS, name),
      join(root, 'node_modules', '@nexusdi', name),
      'dir',
    );
  for (const [path, source] of Object.entries(files)) {
    mkdirSync(dirname(join(root, path)), { recursive: true });
    writeFileSync(join(root, path), source);
  }
  return root;
}
