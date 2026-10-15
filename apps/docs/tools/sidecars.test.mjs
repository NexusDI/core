// @vitest-environment node
import { describe, expect, it } from 'vitest';

import { sidecarsOf } from './sidecars.mjs';

const project = { name: '@nexusdi/example' };

/** A case `statedBy` lists under `name`, with one popup on its one token. */
const stated = (name, id) => ({
  chain: [name, `keeps case ${id}`],
  generated: false,
  id,
});

const body = (pop) => ({
  where: 'libs/example/src/a.test.ts',
  line: 1,
  html: `<span data-pop="${pop}">x</span>`,
});

describe('sidecarsOf', () => {
  it('refuses two names that differ only by case', () => {
    const contents = {
      states: { Foo: [stated('Foo', 0)], foo: [stated('foo', 1)] },
    };

    expect(() =>
      sidecarsOf(
        project,
        contents,
        { 0: body(0), 1: body(1) },
        new Map([
          ['0', '<code>A</code>'],
          ['1', '<code>B</code>'],
        ]),
        new Set(['Foo', 'foo']),
      ),
    ).toThrow('@nexusdi/example states both Foo and foo');
  });

  it('carries only the popups its own cases point at', () => {
    const contents = {
      states: { Foo: [stated('Foo', 0)], Bar: [stated('Bar', 1)] },
    };
    const written = sidecarsOf(
      project,
      contents,
      { 0: body(0), 1: body(1) },
      new Map([
        ['0', '<code>A</code>'],
        ['1', '<code>B</code>'],
      ]),
      new Set(['Foo', 'Bar']),
    );

    expect(
      Object.fromEntries(written.map((each) => [each.name, each.sidecar])),
    ).toEqual({
      Foo: {
        package: '@nexusdi/example',
        name: 'Foo',
        bodies: { 0: body(0) },
        popups: { 0: '<code>A</code>' },
      },
      Bar: {
        package: '@nexusdi/example',
        name: 'Bar',
        bodies: { 1: body(1) },
        popups: { 1: '<code>B</code>' },
      },
    });
  });

  it('writes no sidecar for a describe that names no export', () => {
    const written = sidecarsOf(
      project,
      { states: { buildView: [stated('buildView', 0)] } },
      { 0: body(0) },
      new Map([['0', '<code>A</code>']]),
      new Set(['Nexus']),
    );

    expect(written).toEqual([]);
  });
});
