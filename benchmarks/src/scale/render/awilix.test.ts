import { describe, expect, it } from 'vitest';

import { graphOf } from '../shapes.ts';
import { six, sixWithAlias } from '../six.ts';
import { renderAwilix } from './awilix.ts';

describe('renderAwilix', () => {
  const files = renderAwilix(six());

  it('renders one file per module of a two-module graph', () => {
    expect(Object.keys(files).sort()).toEqual([
      'app.ts',
      'counter.ts',
      'cradle.ts',
      'm0.ts',
      'm1.ts',
    ]);
    expect(files['app.ts']).toMatchInlineSnapshot(`
      "// Scale app: mixed at 6 providers, awilix plain.
      // Docs: https://github.com/jeffijoe/awilix#readme (13.0.5), sections
      // Injection modes, asFunction(), asClass(), asValue() and
      // container.register(), read 2026-10-01.
      // PROXY injection and strict mode, as the Meridian-8 fixture sets them;
      // the README warns that CLASSIC breaks under minification.
      // Every registration is .singleton(), since awilix defaults to transient.
      // Constructors and factories take the cradle and rename the names they
      // destructure to d0, d1, ...
      // Departures: fields for dependencies, because Node's type stripping
      // rejects parameter properties. awilix documents no module unit, so each
      // graph module is a register<Module>(container) function making one
      // container.register({...}) call; create calls them in module order.
      import { InjectionMode, createContainer, type AwilixContainer } from 'awilix';

      import { built } from './counter.ts';
      import type { Cradle } from './cradle.ts';
      import { registerM0 } from './m0.ts';
      import { registerM1 } from './m1.ts';

      const T: readonly (keyof Cradle)[] = [
        'p0',
        'p1',
        'p2',
        'p3',
        'p4',
        'p5',
      ];

      export const scale = {
        count: 6,
        entries: [4, 5],
        target: 4,
        packages: ['awilix'],
        built,
        create: (): AwilixContainer<Cradle> => {
          const container = createContainer<Cradle>({
            injectionMode: InjectionMode.PROXY,
            strict: true,
          });
          registerM0(container);
          registerM1(container);
          return container;
        },
        get: (handle: AwilixContainer<Cradle>, index: number): unknown =>
          handle.resolve(T[index]),
      };
      "
    `);
    expect(files['cradle.ts']).toMatchInlineSnapshot(`
      "import type { P1, P2 } from './m0.ts';
      import type { P3, P4, P5 } from './m1.ts';

      export interface IP0 {
        readonly id: 'p0';
      }

      /** Every registration by name, as the PROXY cradle resolves it. */
      export interface Cradle {
        p0: IP0;
        p1: P1;
        p2: P2;
        p3: P3;
        p4: P4;
        p5: P5;
      }
      "
    `);
    expect(files['m0.ts']).toMatchInlineSnapshot(`
      "import { asClass, asFunction, asValue, type AwilixContainer } from 'awilix';

      import { __scaleBuilt } from './counter.ts';
      import type { Cradle, IP0 } from './cradle.ts';

      export class P1 {
        readonly id = 'p1';
        readonly d0: IP0;
        constructor({ p0: d0 }: Cradle) {
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

      export function registerM0(container: AwilixContainer<Cradle>): void {
        container.register({
          p0: asValue({ id: 'p0' }),
          p1: asClass(P1).singleton(),
          p2: asFunction(({ p0: d0, p1: d1 }: Cradle): P2 => {
            const made = new P2(d0, d1);
            __scaleBuilt(2, 'factory');
            return made;
          }).singleton(),
        });
      }
      "
    `);
    expect(files['m1.ts']).toMatchInlineSnapshot(`
      "import { asClass, type AwilixContainer } from 'awilix';

      import { __scaleBuilt } from './counter.ts';
      import type { Cradle } from './cradle.ts';
      import type { P1, P2 } from './m0.ts';

      export class P3 {
        readonly id = 'p3';
        readonly d0: P1;
        constructor({ p1: d0 }: Cradle) {
          this.d0 = d0;
          __scaleBuilt(3, 'class');
        }
      }

      export class P4 {
        readonly id = 'p4';
        readonly d0: P2;
        readonly d1: P3;
        constructor({ p2: d0, p3: d1 }: Cradle) {
          this.d0 = d0;
          this.d1 = d1;
          __scaleBuilt(4, 'class');
        }
      }

      export class P5 {
        readonly id = 'p5';
        readonly d0: P3;
        constructor({ p3: d0 }: Cradle) {
          this.d0 = d0;
          __scaleBuilt(5, 'class');
        }
      }

      export function registerM1(container: AwilixContainer<Cradle>): void {
        container.register({
          p3: asClass(P3).singleton(),
          p4: asClass(P4).singleton(),
          p5: asClass(P5).singleton(),
        });
      }
      "
    `);
  });

  it('registers each module with one container.register call', () => {
    for (const file of ['m0.ts', 'm1.ts'])
      expect(files[file].match(/container\.register\(\{\n/g)).toHaveLength(1);
    expect(files['app.ts']).toContain('injectionMode: InjectionMode.PROXY,');
    expect(files['app.ts']).toContain('strict: true,');
  });

  it('refuses an async factory, which awilix cannot resolve', () => {
    const graph = six();
    graph.providers[2].kind = 'async-factory';
    expect(() => renderAwilix(graph)).toThrow(/async/);
  });

  it('renders one class per file for wide and deep, registered in create', () => {
    for (const shape of ['wide', 'deep'] as const) {
      const rendered = renderAwilix(graphOf(shape, 50));
      expect(Object.keys(rendered)).toHaveLength(53);
      expect(rendered['p49.ts']).toContain('export class P49 {');
      expect(rendered['app.ts']).toContain('p49: asClass(P49).singleton(),');
      expect(
        rendered['app.ts'].match(/container\.register\(\{\n/g),
      ).toHaveLength(1);
    }
  });

  it('renders an alias in its documented form, with its target type', () => {
    const files = renderAwilix(sixWithAlias());
    expect(files['m1.ts']).toContain("p6: aliasTo('p5'),");
    expect(files['m1.ts']).toContain(
      "import { asClass, aliasTo, type AwilixContainer } from 'awilix';",
    );
    expect(files['cradle.ts']).toContain('export type IP6 = P5;');
    expect(files['cradle.ts']).toContain('p6: IP6;');
  });
});
