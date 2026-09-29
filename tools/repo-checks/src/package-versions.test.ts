import { workspaceRoot } from '@nx/devkit';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

interface Manifest {
  readonly version: string;
  readonly dependencies?: Record<string, string>;
  readonly peerDependencies?: Record<string, string>;
}

const libs = readdirSync(join(workspaceRoot, 'libs')).filter((dir) =>
  existsSync(join(workspaceRoot, 'libs', dir, 'package.json')),
);
const read = (dir: string): Manifest =>
  JSON.parse(
    readFileSync(join(workspaceRoot, 'libs', dir, 'package.json'), 'utf-8'),
  ) as Manifest;
const core = read('core');
/** Packages that ship beside core without extending it. */
const NO_PEER = new Set(['core', 'codemod']);

describe('libs package versions', () => {
  it.each(libs)('holds %s at the version core has', (dir) => {
    expect(read(dir).version).toBe(core.version);
  });

  it.each(libs.filter((dir) => !NO_PEER.has(dir)))(
    'gives %s an exact peer dependency on @nexusdi/core',
    (dir) => {
      expect(read(dir).peerDependencies?.['@nexusdi/core']).toBe(core.version);
    },
  );

  it.each(libs)('pins every @nexusdi dependency of %s exactly', (dir) => {
    for (const [name, range] of Object.entries(read(dir).dependencies ?? {}))
      if (name.startsWith('@nexusdi/')) expect(range).toBe(core.version);
  });
});
