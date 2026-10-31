import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

const root = join(import.meta.dirname, '..');
const manifest = JSON.parse(
  readFileSync(join(root, 'package.json'), 'utf8'),
) as {
  name: string;
  private?: boolean;
  sideEffects?: unknown;
  dependencies: Record<string, string>;
  exports: Record<string, Record<string, string> | string>;
};

/** Every source file of a folder, tests left out. */
function sources(folder: string): { file: string; text: string }[] {
  const dir = join(import.meta.dirname, folder);
  return readdirSync(dir)
    .filter((name) => name.endsWith('.ts') && !name.endsWith('.test.ts'))
    .map((name) => ({
      file: `${folder}/${name}`,
      text: readFileSync(join(dir, name), 'utf8'),
    }));
}

describe('the @nexusdi/meridian-deck manifest', () => {
  it('is private, free of side effects and pins pixi.js at one version', () => {
    expect(manifest.name).toBe('@nexusdi/meridian-deck');
    expect(manifest.private).toBe(true);
    expect(manifest.sideEffects).toBe(false);
    expect(manifest.dependencies['pixi.js']).toBe('8.22.0');
  });

  it('has the two entries of the extension principle, the view apart from the state', () => {
    expect(
      Object.keys(manifest.exports).filter((key) => key !== './package.json'),
    ).toEqual(['.', './view']);
    const state = manifest.exports['.'] as Record<string, string>;
    const view = manifest.exports['./view'] as Record<string, string>;
    expect(state['@nexusdi/source']).toBe('./src/state/index.ts');
    expect(view['@nexusdi/source']).toBe('./src/view/index.ts');
  });
});

describe('the imports of the package', () => {
  it('keeps Pixi out of the state entry', () => {
    for (const { file, text } of sources('state')) {
      expect(text, file).not.toMatch(/from 'pixi\.js|from "pixi\.js|'pixi\.js/);
    }
  });

  it('imports neither meridian-ui nor the docs app (P5)', () => {
    for (const { file, text } of [...sources('state'), ...sources('view')]) {
      expect(text, file).not.toMatch(/@nexusdi\/meridian-ui|apps\/docs/);
    }
  });

  it('lets the view reach the state through relative imports and nothing else of the package', () => {
    for (const { file, text } of sources('view')) {
      expect(text, file).not.toMatch(/@nexusdi\/meridian-deck/);
    }
  });
});
