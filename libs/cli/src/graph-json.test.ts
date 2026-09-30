import { describe, expect, it } from 'vitest';

import { parseGraphJson } from './graph-json.js';

const GOOD = {
  modules: [
    { id: 'm0', name: 'Meridian', global: false, imports: [], exports: ['p0'] },
  ],
  providers: [
    {
      id: 'p0',
      token: 'NavCharts',
      module: 'm0',
      lifetime: 'singleton',
      kind: 'class',
      eager: true,
      async: false,
      implementation: 'StellarCharts',
    },
    {
      id: 'request',
      token: 'REQUEST',
      module: 'm0',
      lifetime: 'scoped',
      kind: 'value',
      eager: true,
      async: false,
      implementation: null,
    },
  ],
  edges: [{ from: 'p0', to: 'request', kind: 'required' }],
};

function messageOf(value: unknown): string {
  try {
    parseGraphJson(JSON.stringify(value), 'graph.json');
  } catch (error) {
    expect(error).toMatchObject({ exitCode: 2 });
    return (error as Error).message;
  }
  return 'no throw';
}

describe('parseGraphJson', () => {
  it('returns a well-formed graph unchanged', () => {
    expect(parseGraphJson(JSON.stringify(GOOD), 'graph.json')).toEqual(GOOD);
  });

  it('fills a missing implementation with null', () => {
    const [first, second] = GOOD.providers;
    const bare: Record<string, unknown> = { ...first };
    delete bare['implementation'];
    const graph = parseGraphJson(
      JSON.stringify({ ...GOOD, providers: [bare, second] }),
      'graph.json',
    );
    expect(graph.providers[0]?.implementation).toBeNull();
  });

  it('exits 2 for text that is not JSON', () => {
    expect(() => parseGraphJson('{', 'graph.json')).toThrow(/not JSON/);
  });

  it('names the first bad path', () => {
    expect(
      messageOf({ ...GOOD, providers: [{ ...GOOD.providers[0], module: 3 }] }),
    ).toContain('providers[0].module');
    expect(messageOf({ ...GOOD, edges: undefined })).toContain('edges');
    expect(
      messageOf({
        ...GOOD,
        providers: [{ ...GOOD.providers[0], kind: 'magic' }],
      }),
    ).toContain('providers[0].kind');
  });

  it('rejects an edge to an unknown provider', () => {
    expect(
      messageOf({
        ...GOOD,
        edges: [{ from: 'p0', to: 'p9', kind: 'required' }],
      }),
    ).toContain('edges[0].to');
  });

  it('rejects a provider in an unknown module', () => {
    expect(
      messageOf({
        ...GOOD,
        providers: [{ ...GOOD.providers[0], module: 'm7' }],
      }),
    ).toContain('providers[0].module');
  });

  it.each(['call', 'href', 'interpolate', 'end', 'm0', 'p', 'p0x', 'P0', ''])(
    'rejects a provider id that core does not write: %j',
    (id) => {
      const message = messageOf({
        ...GOOD,
        providers: [{ ...GOOD.providers[0], id }, GOOD.providers[1]],
        edges: [],
      });
      expect(message).toContain(`providers[0].id is ${JSON.stringify(id)}`);
      expect(message).toContain('provider ids are p<n> or request');
    },
  );

  it.each(['p0', 'request', 'module', 'm', 'call'])(
    'rejects a module id that core does not write: %j',
    (id) => {
      expect(
        messageOf({
          ...GOOD,
          modules: [{ ...GOOD.modules[0], id }],
        }),
      ).toContain('module ids are m<n>');
    },
  );

  it('rejects two providers with the same id', () => {
    expect(
      messageOf({
        ...GOOD,
        providers: [GOOD.providers[0], GOOD.providers[0], GOOD.providers[1]],
      }),
    ).toContain('providers[1].id is "p0", which an earlier entry already uses');
  });

  it('rejects two modules with the same id', () => {
    expect(
      messageOf({ ...GOOD, modules: [GOOD.modules[0], GOOD.modules[0]] }),
    ).toContain('modules[1].id is "m0", which an earlier entry already uses');
  });
});
