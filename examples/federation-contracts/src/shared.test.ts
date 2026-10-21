import { createRequire } from 'node:module';

import { describe, expect, it } from 'vitest';

import { meridianShared } from './shared.js';

const require = createRequire(import.meta.url);
const react: string = require('react/package.json').version;
const core: string = require('@nexusdi/core/package.json').version;

describe('meridianShared', () => {
  it('shares react and react-dom as singletons at the installed react version', () => {
    const shared = meridianShared();
    expect(shared['react']).toEqual({
      singleton: true,
      requiredVersion: react,
    });
    expect(shared['react-dom']).toEqual({
      singleton: true,
      requiredVersion: react,
    });
  });

  it("shares @nexusdi/core and @nexusdi/react as singletons at core's version", () => {
    const shared = meridianShared();
    expect(shared['@nexusdi/core']).toEqual({
      singleton: true,
      requiredVersion: core,
    });
    expect(shared['@nexusdi/react']).toEqual({
      singleton: true,
      requiredVersion: core,
    });
  });

  it('leaves the contracts, federation and decorators packages to each bundle', () => {
    expect(Object.keys(meridianShared()).sort()).toEqual([
      '@nexusdi/core',
      '@nexusdi/react',
      'react',
      'react-dom',
    ]);
  });

  it('drops only @nexusdi/core with core: false', () => {
    const { '@nexusdi/core': dropped, ...rest } = meridianShared();
    expect(dropped).toBeDefined();
    expect(meridianShared({ core: false })).toEqual(rest);
  });
});
