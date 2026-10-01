import { describe, expect, it } from 'vitest';

import { graphOf } from '../shapes.ts';
import { six } from '../six.ts';
import { renderNeedleDi } from './needle-di.ts';

describe('renderNeedleDi', () => {
  const files = renderNeedleDi(six());

  it('renders one file per module of a two-module graph', () => {
    expect(Object.keys(files).sort()).toEqual([
      'app.ts',
      'counter.ts',
      'm0.ts',
      'm1.ts',
      'tokens.ts',
    ]);
    expect(files['app.ts']).toMatchInlineSnapshot(`
      "// Scale app: mixed at 6 providers, needle-di decorated.
      // Docs: https://needle-di.io (1.2.1), pages Injection, Tokens, Providers,
      // Binding and Async injection, read 2026-10-01.
      // needle-di documents singletons only, so no lifetime is set.
      // A sync factory injects with inject(); an async factory takes the
      // container and awaits container.getAsync per dependency, since inject()
      // throws for an async provider and its context ends at the first await.
      // For the same reason a sync factory whose closure holds an async provider
      // is bound async: true, as the Async injection page requires for indirect
      // async dependencies; it does no other await.
      // Departures: initializer injection, which the Injection page documents;
      // it recommends constructor parameter properties, which Node's type
      // stripping rejects.
      // needle-di documents no module unit, so each graph module with
      // factories or values is a register<Module>(container) function making
      // one container.bindAll(...) call; create calls them in module order.
      // Every class binds on first get.
      import { Container, type Token } from '@needle-di/core';

      import { built } from './counter.ts';
      import { P1, registerM0 } from './m0.ts';
      import { P3, P4, P5 } from './m1.ts';
      import { TP0, TP2 } from './tokens.ts';

      const T: readonly Token<unknown>[] = [
        TP0 as Token<unknown>,
        P1 as Token<unknown>,
        TP2 as Token<unknown>,
        P3 as Token<unknown>,
        P4 as Token<unknown>,
        P5 as Token<unknown>,
      ];

      export const scale = {
        count: 6,
        entries: [4, 5],
        target: 4,
        packages: ['@needle-di/core'],
        built,
        create: (): Container => {
          const container = new Container();
          registerM0(container);
          return container;
        },
        get: (handle: Container, index: number): unknown => handle.get(T[index]),
      };
      "
    `);
    expect(files['m0.ts']).toMatchInlineSnapshot(`
      "import { type Container, inject, injectable } from '@needle-di/core';

      import { __scaleBuilt } from './counter.ts';
      import { TP0, type IP0, TP2 } from './tokens.ts';

      @injectable()
      export class P1 {
        readonly id = 'p1';
        readonly d0 = inject(TP0);
        constructor() {
          __scaleBuilt(1, 'class');
        }
      }

      export class P2 {
        readonly id = 'p2';
        readonly d0: IP0;
        readonly d1: P1;
        constructor(d0: IP0, d1: P1) {
          this.d0 = d0;
          this.d1 = d1;
        }
      }

      export function registerM0(container: Container): void {
        container.bindAll(
          { provide: TP0, useValue: { id: 'p0' } },
          {
            provide: TP2,
            useFactory: (): P2 => {
              const d0 = inject(TP0);
              const d1 = inject(P1);
              const made = new P2(d0, d1);
              __scaleBuilt(2, 'factory');
              return made;
            },
          },
        );
      }
      "
    `);
    expect(files['m1.ts']).toMatchInlineSnapshot(`
      "import { inject, injectable } from '@needle-di/core';

      import { __scaleBuilt } from './counter.ts';
      import { P1 } from './m0.ts';
      import { TP2 } from './tokens.ts';

      @injectable()
      export class P3 {
        readonly id = 'p3';
        readonly d0 = inject(P1);
        constructor() {
          __scaleBuilt(3, 'class');
        }
      }

      @injectable()
      export class P4 {
        readonly id = 'p4';
        readonly d0 = inject(TP2);
        readonly d1 = inject(P3);
        constructor() {
          __scaleBuilt(4, 'class');
        }
      }

      @injectable()
      export class P5 {
        readonly id = 'p5';
        readonly d0 = inject(P3);
        constructor() {
          __scaleBuilt(5, 'class');
        }
      }
      "
    `);
    expect(files['tokens.ts']).toMatchInlineSnapshot(`
      "import { InjectionToken } from '@needle-di/core';

      import type { P2 } from './m0.ts';

      export interface IP0 {
        readonly id: 'p0';
      }
      export const TP0 = new InjectionToken<IP0>('p0');
      export const TP2 = new InjectionToken<P2>('p2');
      "
    `);
  });

  it('binds factories and values in one bindAll per module, classes on first get', () => {
    expect(files['m0.ts'].match(/container\.bindAll\(/g)).toHaveLength(1);
    expect(files['m1.ts']).not.toContain('bindAll');
    expect(files['app.ts']).not.toContain('registerM1');
  });

  it('renders an async factory that awaits before it constructs, and getAsync', () => {
    const graph = six();
    graph.providers[2].kind = 'async-factory';
    const rendered = renderNeedleDi(graph);
    expect(rendered['m0.ts']).toContain(`    {
      provide: TP2,
      async: true,
      useFactory: async (c: Container): Promise<P2> => {
        const d0 = await c.getAsync(TP0);
        const d1 = await c.getAsync(P1);
        await Promise.resolve();
        const made = new P2(d0, d1);
        __scaleBuilt(2, 'async-factory');
        return made;
      },
    },`);
    expect(rendered['app.ts']).toContain(
      'getAsync: (handle: Container, index: number): Promise<unknown> =>',
    );
    expect(files['app.ts']).not.toContain('getAsync:');
  });

  it('binds a sync factory async when its closure holds an async provider', () => {
    const graph = six();
    graph.providers[2].kind = 'async-factory';
    // p5 reaches the async p2 through the class p4.
    graph.providers[5].kind = 'factory';
    graph.providers[5].deps = [4];
    const m1 = renderNeedleDi(graph)['m1.ts'];
    expect(m1).toContain(`    {
      provide: TP5,
      async: true,
      useFactory: async (c: Container): Promise<P5> => {
        const d0 = await c.getAsync(P4);
        const made = new P5(d0);
        __scaleBuilt(5, 'factory');
        return made;
      },
    },`);
  });

  it('renders one @injectable() class per file for wide and deep', () => {
    for (const shape of ['wide', 'deep'] as const) {
      const rendered = renderNeedleDi(graphOf(shape, 50));
      expect(Object.keys(rendered)).toHaveLength(52);
      expect(rendered['p49.ts']).toContain('@injectable()');
      expect(rendered['app.ts']).toContain(
        'create: (): Container => new Container(),',
      );
    }
  });
});
