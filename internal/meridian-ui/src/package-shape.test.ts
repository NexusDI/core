import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const manifest = JSON.parse(
  readFileSync(join(import.meta.dirname, '..', 'package.json'), 'utf8'),
) as {
  name: string;
  private?: boolean;
  type?: string;
  sideEffects?: unknown;
  dependencies?: Record<string, string>;
  peerDependencies?: Record<string, string>;
  exports: Record<string, unknown>;
};

describe('the @nexusdi/meridian-ui manifest', () => {
  it('names the package after its folder and keeps it private', () => {
    expect(manifest.name).toBe('@nexusdi/meridian-ui');
    expect(manifest.private).toBe(true);
    expect(manifest.type).toBe('module');
  });

  it('declares no side effects and no runtime dependency', () => {
    expect(manifest.sideEffects).toBe(false);
    expect(manifest.dependencies ?? {}).toEqual({});
    expect(Object.keys(manifest.peerDependencies ?? {})).toEqual(['react']);
  });

  it('resolves the root entry through @nexusdi/source first', () => {
    const root = manifest.exports['.'] as Record<string, string>;
    expect(Object.keys(root)).toEqual([
      '@nexusdi/source',
      'types',
      'import',
      'default',
    ]);
    expect(root['@nexusdi/source']).toBe('./src/index.ts');
    expect(root['import']).toBe('./dist/index.js');
  });

  it('publishes the tokens entry without React', () => {
    const tokens = manifest.exports['./tokens'] as Record<string, string>;
    expect(tokens['@nexusdi/source']).toBe('./src/tokens/index.ts');
    expect(tokens['import']).toBe('./dist/tokens/index.js');
  });
});
