import { resolve } from 'node:path';

import { MERIDIAN_CONTRACT_VERSION } from '@nexusdi/federation-contracts/version';
import { meridianShared } from '@nexusdi/federation-contracts/shared';
import { describe, expect, it } from 'vitest';

import { MERIDIAN_CONTRACT_VERSION as DRIFT_VERSION } from '../drift/version';
import main from '../rspack.config';
import drift from '../rspack.config.drift';
import unshared from '../rspack.config.unshared';

type Factory = (
  env: object,
  argv: { mode: string },
) => {
  output: { path: string; uniqueName: string };
  devServer: { port: number };
  module: {
    rules: { test?: unknown; resolve?: { alias?: Record<string, string> } }[];
  };
  plugins: { _options?: { shared?: unknown; exposes?: unknown } }[];
};

const render = (config: unknown) =>
  (config as Factory)({}, { mode: 'production' });

/** The rule that gives some modules' imports their own aliases. */
const aliasRule = (config: unknown) =>
  render(config).module.rules.find((rule) => rule.resolve?.alias);

/** The aliases a rule applies to imports from the contracts package's build. */
const contractAliases = (config: unknown) => aliasRule(config)?.resolve?.alias;

/** The `shared` object the build hands the federation plugin. */
const sharedOf = (config: unknown) =>
  render(config).plugins.find((plugin) => plugin._options?.shared)?._options
    ?.shared;

/** The folder rspack runs in, which the builds write `dist/` under. */
const root = process.cwd();
const driftDir = resolve(import.meta.dirname, '../drift');

describe('the drift build', () => {
  it('sits one minor above the shell contract', () => {
    const [major, minor] = MERIDIAN_CONTRACT_VERSION.split('.').map(Number);
    expect(DRIFT_VERSION).toBe(`${major}.${minor + 1}.0`);
  });

  it('aliases the contract version to drift/version.ts', () => {
    expect(contractAliases(drift)).toEqual({
      '@nexusdi/federation-contracts/version': resolve(driftDir, 'version.ts'),
    });
  });

  it("applies the alias to the contracts package's build alone", () => {
    const test = aliasRule(drift)?.test as RegExp;
    expect(
      test.test(resolve(driftDir, '../../federation-contracts/dist/index.js')),
    ).toBe(true);
    expect(test.test(resolve(driftDir, 'version.ts'))).toBe(false);
  });

  it('shares what the shell shares, into dist/drift', () => {
    expect(sharedOf(drift)).toEqual(meridianShared());
    expect(render(drift).output.path).toBe(resolve(root, 'dist/drift'));
  });
});

describe('the unshared build', () => {
  it('leaves @nexusdi/core out of shared, into dist/unshared', () => {
    expect(sharedOf(unshared)).toEqual(meridianShared({ core: false }));
    expect(contractAliases(unshared)).toBeUndefined();
    expect(render(unshared).output.path).toBe(resolve(root, 'dist/unshared'));
  });
});

describe('the main build', () => {
  it('shares meridianShared() with no alias, into dist/main', () => {
    expect(sharedOf(main)).toEqual(meridianShared());
    expect(contractAliases(main)).toBeUndefined();
    expect(render(main).output.path).toBe(resolve(root, 'dist/main'));
  });

  it('exposes ./section and nothing else', () => {
    const exposes = render(main).plugins.find(
      (plugin) => plugin._options?.exposes,
    )?._options?.exposes;
    expect(exposes).toEqual({ './section': './src/index.ts' });
  });
});

describe('every build', () => {
  it.each([
    ['main', main],
    ['drift', drift],
    ['unshared', unshared],
  ])('serves %s under the name and port of the main build', (_, config) => {
    expect(render(config).output.uniqueName).toBe(
      render(main).output.uniqueName,
    );
    expect(render(config).devServer.port).toBe(render(main).devServer.port);
  });
});
