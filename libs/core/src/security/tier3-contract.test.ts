/**
 * Tier 3: out of scope, documented. No test here asserts a defence. Each pins
 * what the container does, so nobody reads the behaviour as one.
 */
import '../polyfill/symbol-metadata.js';

import { describe, expect, it } from 'vitest';

import { thrown } from '../../test-support/catch.js';
import { compile } from '../blueprint/compile.js';
import { defineModule, type ModuleDefinition } from '../index.js';

describe('SEC-201 metadata is trusted input (CWE-345)', () => {
  it('honours injection metadata written by hand through the global Symbol.for key', () => {
    class Spoofed {}
    Object.defineProperty(
      Spoofed,
      Symbol.metadata ?? Symbol.for('Symbol.metadata'),
      {
        value: {
          [Symbol.for('nexusdi.injectable')]: {
            deps: [],
            lifetime: 'transient',
          },
        },
      },
    );
    const bp = compile({
      root: defineModule({ name: 'Root', providers: [Spoofed] }),
    });
    expect(bp.providers.get('p0')).toMatchObject({ lifetime: 'transient' });
  });
});

describe('SEC-202 a module tree deeper than the call stack (CWE-674)', () => {
  it('ends in a RangeError, not a NexusError, for a 100,000-level import chain', () => {
    let module: ModuleDefinition = defineModule({ name: 'Floor' });
    for (let i = 0; i < 100_000; i++)
      module = defineModule({ name: `Deck${i}`, imports: [module] });
    expect(thrown(() => compile({ root: module }))).toBeInstanceOf(RangeError);
  });
});
