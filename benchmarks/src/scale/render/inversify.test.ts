import { describe, expect, it } from 'vitest';

import { graphOf } from '../shapes.ts';
import { six } from '../six.ts';
import { renderInversify } from './inversify.ts';

describe('renderInversify', () => {
  const files = renderInversify(six());

  it('renders one file per module of a two-module graph', () => {
    expect(Object.keys(files).sort()).toEqual([
      'app.ts',
      'counter.ts',
      'm0.ts',
      'm1.ts',
      'tokens.ts',
    ]);
    expect(files['app.ts']).toMatchInlineSnapshot(`
      "// Scale app: mixed at 6 providers, InversifyJS decorated.
      // Docs: https://inversify.io/docs/introduction/getting-started/ (8.2.3),
      // https://inversify.io/docs/api/container-module/,
      // https://inversify.io/docs/api/binding-syntax/#toresolvedvalue and
      // https://inversify.io/docs/api/container/#getasync, read 2026-10-01.
      // Every binding is a singleton, since InversifyJS defaults to transient.
      // new Container() keeps the getting-started default jitless: true; the
      // docs offer jitless: false for speed where unsafe-eval is allowed.
      // A ContainerModule has no imports or exports, so the container is flat
      // and every binding is visible everywhere.
      // Departures: fields for dependencies, because Node's type stripping
      // rejects parameter properties.
      import { Container, type ServiceIdentifier } from 'inversify';

      import { built } from './counter.ts';
      import { M0, P1 } from './m0.ts';
      import { M1, P3, P4, P5 } from './m1.ts';
      import { TP0, TP2 } from './tokens.ts';

      const T: readonly ServiceIdentifier[] = [
        TP0 as ServiceIdentifier,
        P1 as ServiceIdentifier,
        TP2 as ServiceIdentifier,
        P3 as ServiceIdentifier,
        P4 as ServiceIdentifier,
        P5 as ServiceIdentifier,
      ];

      export const scale = {
        count: 6,
        entries: [4, 5],
        target: 4,
        packages: ['inversify'],
        built,
        create: (): Container => {
          const container = new Container();
          container.load(M0, M1);
          return container;
        },
        get: (handle: Container, index: number): unknown => handle.get(T[index]),
      };
      "
    `);
    expect(files['m0.ts']).toMatchInlineSnapshot(`
      "import {
        ContainerModule,
        type ContainerModuleLoadOptions,
        inject,
        injectable,
      } from 'inversify';

      import { __scaleBuilt } from './counter.ts';
      import { TP0, type IP0, TP2 } from './tokens.ts';

      @injectable()
      export class P1 {
        readonly id = 'p1';
        readonly d0: IP0;
        constructor(@inject(TP0) d0: IP0) {
          this.d0 = d0;
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

      export const M0 = new ContainerModule(
        (options: ContainerModuleLoadOptions) => {
          options.bind<IP0>(TP0).toConstantValue({ id: 'p0' });
          options.bind(P1).toSelf().inSingletonScope();
          options.bind<P2>(TP2)
            .toResolvedValue(
              (d0: IP0, d1: P1): P2 => {
                const made = new P2(d0, d1);
                __scaleBuilt(2, 'factory');
                return made;
              },
              [TP0, P1],
            )
            .inSingletonScope();
        },
      );
      "
    `);
    expect(files['m1.ts']).toMatchInlineSnapshot(`
      "import {
        ContainerModule,
        type ContainerModuleLoadOptions,
        inject,
        injectable,
      } from 'inversify';

      import { __scaleBuilt } from './counter.ts';
      import { P1, P2 } from './m0.ts';
      import { TP2 } from './tokens.ts';

      @injectable()
      export class P3 {
        readonly id = 'p3';
        readonly d0: P1;
        constructor(@inject(P1) d0: P1) {
          this.d0 = d0;
          __scaleBuilt(3, 'class');
        }
      }

      @injectable()
      export class P4 {
        readonly id = 'p4';
        readonly d0: P2;
        readonly d1: P3;
        constructor(@inject(TP2) d0: P2, @inject(P3) d1: P3) {
          this.d0 = d0;
          this.d1 = d1;
          __scaleBuilt(4, 'class');
        }
      }

      @injectable()
      export class P5 {
        readonly id = 'p5';
        readonly d0: P3;
        constructor(@inject(P3) d0: P3) {
          this.d0 = d0;
          __scaleBuilt(5, 'class');
        }
      }

      export const M1 = new ContainerModule(
        (options: ContainerModuleLoadOptions) => {
          options.bind(P3).toSelf().inSingletonScope();
          options.bind(P4).toSelf().inSingletonScope();
          options.bind(P5).toSelf().inSingletonScope();
        },
      );
      "
    `);
    expect(files['tokens.ts']).toMatchInlineSnapshot(`
      "export interface IP0 {
        readonly id: 'p0';
      }
      export const TP0 = Symbol.for('p0');
      export const TP2 = Symbol.for('p2');
      "
    `);
  });

  it('renders an async factory that awaits before it constructs, and getAsync', () => {
    const graph = six();
    graph.providers[2].kind = 'async-factory';
    const rendered = renderInversify(graph);
    expect(rendered['m0.ts']).toContain(`    options.bind<P2>(TP2)
      .toResolvedValue(
        async (d0: IP0, d1: P1): Promise<P2> => {
          await Promise.resolve();
          const made = new P2(d0, d1);
          __scaleBuilt(2, 'async-factory');
          return made;
        },
        [TP0, P1],
      )
      .inSingletonScope();`);
    expect(rendered['app.ts']).toContain(
      'getAsync: (handle: Container, index: number): Promise<unknown> =>',
    );
    expect(files['app.ts']).not.toContain('getAsync');
  });

  it('renders one class per file for wide and deep, bound in create', () => {
    for (const shape of ['wide', 'deep'] as const) {
      const rendered = renderInversify(graphOf(shape, 50));
      expect(Object.keys(rendered)).toHaveLength(52);
      expect(rendered['p49.ts']).toContain('@injectable()');
      expect(rendered['app.ts']).toContain(
        'container.bind(P49).toSelf().inSingletonScope();',
      );
    }
  });
});
