import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { onTestFinished } from 'vitest';

/**
 * A fresh directory under tmpdir, removed when the calling test finishes.
 * rmSync removes symlinks without following them, so a project's links to
 * the built libs leave the libs alone.
 */
export function tempDir(prefix = 'nexusdi-cli-'): string {
  const dir = mkdtempSync(join(tmpdir(), prefix));
  onTestFinished(() => rmSync(dir, { recursive: true, force: true }));
  return dir;
}
