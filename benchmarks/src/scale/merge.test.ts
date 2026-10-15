import { describe, expect, it } from 'vitest';

import type { Design } from '../schema.ts';
import { SHAPES, type Shape } from './config.ts';
import { bundleSha256, mergeParts, type ScalePart } from './merge.ts';
import { fixtureScale, fixtureTimings } from './render.fixture.ts';

const scale = fixtureScale();
const base = fixtureTimings();
const design: Design = base.design['steady-get'];
const runner = (cpu: string) => ({
  os: 'Linux',
  cpu,
  cores: 4,
  memoryGb: 16,
  hosted: true,
  imageOs: 'ubuntu24',
  imageVersion: '20261001.1',
  kernel: '6.8.0',
});

function part(
  name: Shape | 'steady',
  over: Partial<ScalePart> = {},
): ScalePart {
  const shape = name === 'steady' ? 'mixed' : name;
  return {
    part: name,
    sha: 'abc1234',
    startedAt: `2026-10-14T0${SHAPES.indexOf(shape as Shape)}:00:00Z`,
    versions: base.versions,
    seed: 7,
    graphSeed: 20261001,
    scaleSha256: 'f'.repeat(64),
    protocol: 'settled',
    coreRef: {
      ref: 'workspace',
      tree: '4b825dc642cb6eb9a060e54bf8d69288fbee4904',
    },
    graphs: scale.graphs
      .filter((g) => g.shape === 'mixed')
      .map(({ shape: s, size, hash }) => ({ shape: s, size, hash })),
    cells: [],
    blocks: [
      {
        block: name === 'steady' ? 'steady-get' : name,
        runner: runner(`CPU for ${name}`),
        wallMs: 1000,
      },
    ],
    design:
      name === 'steady'
        ? { 'steady-get': design }
        : {
            'fresh-process': {
              shape: name,
              design,
            },
          },
    results: [],
    growth: [],
    marginal: [],
    bundles: [
      {
        library: 'nexusdi',
        variant: 'plain',
        shape: 'mixed',
        size: 50,
        sha256: 'a'.repeat(64),
      },
    ],
    ...over,
  } as ScalePart;
}
const all = () => [...SHAPES, 'steady' as const].map((n) => part(n));
const opts = { scale, scaleSha256: 'f'.repeat(64) };

describe('bundleSha256', () => {
  const bundle = (dir: string) =>
    `// tmp/${dir}/cells/scale-x/out/tsc/src/app.js\nexport const scale = 1;\n// tmp/${dir}/cells/scale-x/out/tsc/src/m0.js\nexport const m0 = 2;\n`;
  it('is the same for two builds that differ only in the consumer directory of the path comments', () => {
    expect(bundleSha256(bundle('consumer-aaa'))).toBe(
      bundleSha256(bundle('consumer-bbb')),
    );
  });
  it('is the same when a bundled package sits at another depth below the consumer', () => {
    const tslib = (path: string) =>
      `// ${path}/node_modules/tslib/tslib.es6.mjs\nexport const __decorate = 1;\n`;
    expect(bundleSha256(tslib('../../..'))).toBe(bundleSha256(tslib('../..')));
    expect(bundleSha256(tslib('../..'))).toBe(
      bundleSha256(
        '// node_modules/tslib/tslib.es6.mjs\nexport const __decorate = 1;\n',
      ),
    );
  });
  it('differs when the code differs', () => {
    expect(bundleSha256(bundle('c'))).not.toBe(
      bundleSha256(bundle('c').replace('= 2', '= 3')),
    );
  });
  it('is 64 hex digits', () => {
    expect(bundleSha256('x')).toMatch(/^[0-9a-f]{64}$/);
  });
});

describe('mergeParts', () => {
  it('merges every shape and the steady part into one file', () => {
    const { file } = mergeParts(all(), opts);
    expect(Object.keys(file.design['fresh-process']).sort()).toEqual(
      [...SHAPES].sort(),
    );
    expect(file.design['steady-get']).toEqual(design);
    expect(file.blocks.map((b) => b.block).sort()).toEqual(
      [...SHAPES, 'steady-get'].sort(),
    );
    expect(file.sha).toBe('abc1234');
    expect(file.scaleSha256).toBe(opts.scaleSha256);
    // The earliest part start is the run's.
    expect(file.startedAt).toBe('2026-10-14T00:00:00Z');
    // Each block keeps its own machine.
    expect(file.blocks.find((b) => b.block === 'wide')?.runner.cpu).toBe(
      'CPU for wide',
    );
  });
  it('lists the graphs once, sorted', () => {
    const { file } = mergeParts(all(), opts);
    expect(file.graphs).toEqual(
      scale.graphs
        .filter((g) => g.shape === 'mixed')
        .map(({ shape, size, hash }) => ({ shape, size, hash })),
    );
  });
  it.each([
    ['sha', { sha: 'zzz9999' }],
    ['seed', { seed: 8 }],
    ['graphSeed', { graphSeed: 1 }],
    ['coreRef', { coreRef: { ref: 'workspace', tree: 'x' } }],
    ['versions', { versions: { ...base.versions, node: '99.0.0' } }],
    ['scaleSha256', { scaleSha256: 'e'.repeat(64) }],
  ])('fails when a part differs in %s', (field, over) => {
    const parts = all();
    parts[2] = part('deep', over as Partial<ScalePart>);
    expect(() => mergeParts(parts, opts)).toThrow(
      new RegExp(`deep.*${field}|${field}.*deep`),
    );
  });
  it('fails when the parts validated against another scale.json than the merge job has', () => {
    expect(() =>
      mergeParts(all(), { ...opts, scaleSha256: 'a'.repeat(64) }),
    ).toThrow(/scale\.json.*[0-9a-f]{64}/);
  });
  it('fails when a graph hash disagrees with scale.json', () => {
    const parts = all();
    parts[1] = part('wide', {
      graphs: [{ shape: 'mixed', size: 50, hash: 'ffffffffffff' }],
    });
    expect(() => mergeParts(parts, opts)).toThrow(
      /wide.*mixed 50.*ffffffffffff/,
    );
  });
  it('fails when a shape is missing or present twice', () => {
    expect(() =>
      mergeParts(
        all().filter((p) => p.part !== 'modular'),
        opts,
      ),
    ).toThrow(/modular.*missing/);
    expect(() => mergeParts([...all(), part('wide')], opts)).toThrow(
      /wide.*twice/,
    );
  });
  it('fails when the steady part is missing or present twice', () => {
    expect(() =>
      mergeParts(
        all().filter((p) => p.part !== 'steady'),
        opts,
      ),
    ).toThrow(/steady.*missing/);
    expect(() => mergeParts([...all(), part('steady')], opts)).toThrow(
      /steady.*twice/,
    );
  });
  it('fails when a steady mixed bundle is not the one the mixed part built', () => {
    const parts = all();
    parts[parts.length - 1] = part('steady', {
      bundles: [
        {
          library: 'nexusdi',
          variant: 'plain',
          shape: 'mixed',
          size: 50,
          sha256: 'b'.repeat(64),
        },
      ],
    });
    expect(() => mergeParts(parts, opts)).toThrow(
      /steady.*nexusdi\/plain mixed 50.*bundle/,
    );
  });
  it('fails when steady times a mixed cell the mixed part did not build', () => {
    const parts = all();
    parts[parts.length - 1] = part('steady', {
      bundles: [
        {
          library: 'awilix',
          variant: 'plain',
          shape: 'mixed',
          size: 50,
          sha256: 'c'.repeat(64),
        },
      ],
    });
    expect(() => mergeParts(parts, opts)).toThrow(/awilix\/plain mixed 50/);
  });
  it('allows a partial run to leave shapes and the steady part out, still checking the rest', () => {
    const some = [part('mixed'), part('wide')];
    const { file } = mergeParts(some, {
      ...opts,
      partial: true,
      steadyFallback: design,
    });
    expect(Object.keys(file.design['fresh-process']).sort()).toEqual([
      'mixed',
      'wide',
    ]);
    expect(file.design['steady-get']).toEqual(design);
    expect(() =>
      mergeParts([part('mixed'), part('wide', { seed: 2 })], {
        ...opts,
        partial: true,
        steadyFallback: design,
      }),
    ).toThrow(/seed/);
  });
  it('lists a mixed cell once although the mixed and steady parts both built it', () => {
    const cell = {
      library: 'nexusdi' as const,
      variant: 'plain' as const,
      shape: 'mixed' as const,
      size: 50,
      outcome: 'pass' as const,
    };
    const parts = all();
    parts[0] = part('mixed', { cells: [cell] });
    parts[parts.length - 1] = part('steady', { cells: [cell] });
    expect(mergeParts(parts, opts).file.cells).toEqual([cell]);
  });
  it('fails when the steady part judged a mixed cell differently from the mixed part', () => {
    const cell = {
      library: 'inversify' as const,
      variant: 'decorated' as const,
      shape: 'mixed' as const,
      size: 1000,
      outcome: 'pass' as const,
    };
    const parts = all();
    parts[0] = part('mixed', { cells: [cell] });
    parts[parts.length - 1] = part('steady', {
      cells: [{ ...cell, outcome: 'runtime-error', message: 'boom' }],
    });
    expect(() => mergeParts(parts, opts)).toThrow(
      /steady.*inversify\/decorated mixed 1000.*runtime-error.*pass/,
    );
  });
  it('reports every problem at once', () => {
    const parts = all().filter((p) => p.part !== 'modular');
    parts[0] = part('mixed', { seed: 9 });
    let message = '';
    try {
      mergeParts(parts, opts);
    } catch (e) {
      message = (e as Error).message;
    }
    expect(message).toMatch(/seed/);
    expect(message).toMatch(/modular.*missing/);
  });
  it('records the settled protocol and refuses parts that differ in it', () => {
    expect(mergeParts(all(), opts).file.design.protocol).toBe('settled');
    const parts = all();
    parts[1] = part('wide', { protocol: 'timing' as never });
    expect(() => mergeParts(parts, opts)).toThrow(/wide.*protocol/);
  });
});
