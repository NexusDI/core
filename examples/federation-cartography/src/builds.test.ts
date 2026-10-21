import { resolve } from 'node:path';

import { MERIDIAN_CONTRACT_VERSION } from '@nexusdi/federation-contracts/version';
import { meridianShared } from '@nexusdi/federation-contracts/shared';
import { describe, expect, it } from 'vitest';

import { MERIDIAN_CONTRACT_VERSION as DRIFT_VERSION } from '../drift/version';
import main, { mainBuild } from '../rspack.config';
import drift, { driftBuild } from '../rspack.config.drift';
import unshared, { unsharedBuild } from '../rspack.config.unshared';

type Factory = (
  env: object,
  argv: { mode: string },
) => {
  output: { path: string };
  module: {
    rules: { test?: unknown; resolve?: { alias?: Record<string, string> } }[];
  };
};

const render = (config: unknown) =>
  (config as Factory)({}, { mode: 'production' });

/** The rule that gives some modules' imports their own aliases. */
const aliasRule = (config: unknown) =>
  render(config).module.rules.find((rule) => rule.resolve?.alias);

/** The aliases a rule applies to imports from the contracts package's build. */
const contractAliases = (config: unknown) => aliasRule(config)?.resolve?.alias;

const root = resolve(import.meta.dirname, '..');

describe('the drift build', () => {
  it('sits one minor above the shell contract', () => {
    const [major, minor] = MERIDIAN_CONTRACT_VERSION.split('.').map(Number);
    expect(DRIFT_VERSION).toBe(`${major}.${minor + 1}.0`);
  });

  it('aliases the contract version to drift/version.ts', () => {
    expect(contractAliases(drift)).toEqual({
      '@nexusdi/federation-contracts/version': resolve(
        root,
        'drift/version.ts',
      ),
    });
  });

  it("applies the alias to the contracts package's build alone", () => {
    const test = aliasRule(drift)?.test as RegExp;
    expect(
      test.test(resolve(root, '../federation-contracts/dist/index.js')),
    ).toBe(true);
    expect(test.test(resolve(root, 'drift/version.ts'))).toBe(false);
  });

  it('shares what the shell shares, into dist/drift', () => {
    expect(driftBuild.shared).toEqual(meridianShared());
    expect(render(drift).output.path).toBe(resolve(root, 'dist/drift'));
  });
});

describe('the unshared build', () => {
  it('leaves @nexusdi/core out of shared, into dist/unshared', () => {
    expect(unsharedBuild.shared).toEqual(meridianShared({ core: false }));
    expect(contractAliases(unshared)).toBeUndefined();
    expect(render(unshared).output.path).toBe(resolve(root, 'dist/unshared'));
  });
});

describe('the main build', () => {
  it('shares meridianShared() with no alias, into dist/main', () => {
    expect(mainBuild.shared).toEqual(meridianShared());
    expect(contractAliases(main)).toBeUndefined();
    expect(render(main).output.path).toBe(resolve(root, 'dist/main'));
  });
});
