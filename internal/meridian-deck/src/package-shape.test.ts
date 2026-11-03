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

  it('has the entries of the extension principle, the view and the fakes apart from the state', () => {
    expect(
      Object.keys(manifest.exports).filter((key) => key !== './package.json'),
    ).toEqual(['.', './view', './testing']);
    const state = manifest.exports['.'] as Record<string, string>;
    const view = manifest.exports['./view'] as Record<string, string>;
    expect(state['@nexusdi/source']).toBe('./src/state/index.ts');
    expect(view['@nexusdi/source']).toBe('./src/view/index.ts');
    const testing = manifest.exports['./testing'] as Record<string, string>;
    expect(testing['@nexusdi/source']).toBe('./src/testing/index.ts');
    expect(Object.keys(testing)).toEqual(Object.keys(state));
  });
});

describe('the imports of the package', () => {
  it('keeps Pixi out of the state entry', () => {
    for (const { file, text } of sources('state')) {
      expect(text, file).not.toMatch(/from 'pixi\.js|from "pixi\.js|'pixi\.js/);
    }
  });

  it('keeps Pixi out of the testing entry', () => {
    for (const { file, text } of sources('testing')) {
      expect(text, file).not.toMatch(/from 'pixi\.js|from "pixi\.js|'pixi\.js/);
    }
  });

  it('imports nothing from meridian-systems at run time in the state and testing entries', () => {
    for (const { file, text } of [...sources('state'), ...sources('testing')]) {
      const runtime = text
        .split('\n')
        .filter((line) => !/^\s*import type\b/.test(line));
      expect(runtime.join('\n'), file).not.toMatch(
        /@nexusdi\/meridian-systems/,
      );
    }
  });

  it('lets the testing entry reach the state through relative imports only', () => {
    for (const { file, text } of sources('testing')) {
      expect(text, file).not.toMatch(/@nexusdi\/meridian-deck/);
      expect(text, file).not.toMatch(/\.\.\/view/);
    }
  });

  it('imports neither meridian-ui nor the docs app (P5)', () => {
    for (const { file, text } of [
      ...sources('state'),
      ...sources('view'),
      ...sources('testing'),
    ]) {
      expect(text, file).not.toMatch(/@nexusdi\/meridian-ui|apps\/docs/);
    }
  });

  it('lets the view reach the state through relative imports and nothing else of the package', () => {
    for (const { file, text } of sources('view')) {
      expect(text, file).not.toMatch(/@nexusdi\/meridian-deck/);
    }
  });
});
