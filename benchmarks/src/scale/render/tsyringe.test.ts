import { describe, expect, it } from 'vitest';

import { graphOf } from '../shapes.ts';
import { six, sixWithAlias } from '../six.ts';
import { renderTsyringe } from './tsyringe.ts';

describe('renderTsyringe', () => {
  const files = renderTsyringe(six());

  it('renders one file per module of a two-module graph', () => {
    expect(Object.keys(files).sort()).toEqual([
      'app.ts',
      'counter.ts',
      'm0.ts',
      'm1.ts',
    ]);
    expect(files['app.ts']).toMatchInlineSnapshot(`
      "// Scale app: mixed at 6 providers, tsyringe decorated.
      // Docs: https://github.com/microsoft/tsyringe#readme (4.10.0), sections
      // singleton(), inject(), Factory provider, instanceCachingFactory and
      // Registry, read 2026-10-01.
      // Every class is @singleton() and every factory instanceCachingFactory,
      // since tsyringe defaults to transient. Factories and values register
      // under string tokens, as the Meridian-8 fixture registers NavCharts.
      // Each graph module with factories or values is one @registry([...])
      // class. tsyringe has no module visibility, so the global container is
      // flat and every registration is visible everywhere.
      // create returns the global container: @singleton() and @registry
      // register when their files load.
      // Departures: fields for dependencies, because Node's type stripping
      // rejects parameter properties.
      import 'reflect-metadata';
      import {
        container,
        type DependencyContainer,
        type InjectionToken,
      } from 'tsyringe';

      import { built } from './counter.ts';
      import { P1 } from './m0.ts';
      import { P3, P4, P5 } from './m1.ts';

      const T: readonly InjectionToken[] = [
        'p0' as InjectionToken,
        P1 as InjectionToken,
        'p2' as InjectionToken,
        P3 as InjectionToken,
        P4 as InjectionToken,
        P5 as InjectionToken,
      ];

      export const scale = {
        count: 6,
        entries: [4, 5],
        target: 4,
        packages: ['reflect-metadata', 'tsyringe'],
        built,
        create: (): DependencyContainer => container,
        get: (handle: DependencyContainer, index: number): unknown =>
          handle.resolve(T[index]),
      };
      "
    `);
    expect(files['m0.ts']).toMatchInlineSnapshot(`
      "import { inject, instanceCachingFactory, registry, singleton } from 'tsyringe';

      import { __scaleBuilt } from './counter.ts';

      export interface IP0 {
        readonly id: 'p0';
      }

      @singleton()
      export class P1 {
        readonly id = 'p1';
        readonly d0: IP0;
        constructor(@inject('p0') d0: IP0) {
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

      @registry([
        { token: 'p0', useValue: { id: 'p0' } },
        {
          token: 'p2',
          useFactory: instanceCachingFactory<P2>((c) => {
            const d0 = c.resolve<IP0>('p0');
            const d1 = c.resolve(P1);
            const made = new P2(d0, d1);
            __scaleBuilt(2, 'factory');
            return made;
          }),
        },
      ])
      export class M0 {}
      "
    `);
    expect(files['m1.ts']).toMatchInlineSnapshot(`
      "import { inject, singleton } from 'tsyringe';

      import { __scaleBuilt } from './counter.ts';
      import { P1, P2 } from './m0.ts';

      @singleton()
      export class P3 {
        readonly id = 'p3';
        readonly d0: P1;
        constructor(d0: P1) {
          this.d0 = d0;
          __scaleBuilt(3, 'class');
        }
      }

      @singleton()
      export class P4 {
        readonly id = 'p4';
        readonly d0: P2;
        readonly d1: P3;
        constructor(@inject('p2') d0: P2, d1: P3) {
          this.d0 = d0;
          this.d1 = d1;
          __scaleBuilt(4, 'class');
        }
      }

      @singleton()
      export class P5 {
        readonly id = 'p5';
        readonly d0: P3;
        constructor(d0: P3) {
          this.d0 = d0;
          __scaleBuilt(5, 'class');
        }
      }
      "
    `);
  });

  it('registers factories and values in one @registry class per module', () => {
    expect(files['m0.ts']).toContain('@registry([');
    expect(files['m0.ts']).toContain('useFactory: instanceCachingFactory<P2>(');
    expect(files['m1.ts']).not.toContain('registry');
  });

  it('imports a module with no class the token table names for its registry', () => {
    const graph = six();
    graph.providers[1].kind = 'factory';
    expect(renderTsyringe(graph)['app.ts']).toContain("import './m0.ts';");
  });

  it('refuses an async factory, which tsyringe cannot resolve', () => {
    const graph = six();
    graph.providers[2].kind = 'async-factory';
    expect(() => renderTsyringe(graph)).toThrow(/async/);
  });

  it('renders one @singleton() class per file for wide and deep', () => {
    for (const shape of ['wide', 'deep'] as const) {
      const rendered = renderTsyringe(graphOf(shape, 50));
      expect(Object.keys(rendered)).toHaveLength(52);
      expect(rendered['p49.ts']).toContain('@singleton()');
      expect(rendered['app.ts']).toContain(
        'create: (): DependencyContainer => container,',
      );
    }
  });

  it('renders an alias in its documented form, with its target type', () => {
    const files = renderTsyringe(sixWithAlias());
    expect(files['m1.ts']).toContain("{ token: 'p6', useToken: P5 },");
    expect(files['m1.ts']).not.toContain('class P6');
    expect(files['m1.ts']).toContain('export type IP6 = P5;');
  });
});
