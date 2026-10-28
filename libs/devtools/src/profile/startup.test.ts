import { describe, expect, it } from 'vitest';

import { Token, defineModule, isNexusError, provide } from '@nexusdi/core';

import { rejected } from '../../test-support/catch.js';
import { profile, profileStartup } from '../index.js';

interface IReactorCore {
  readonly output: number;
}
const REACTOR = new Token<IReactorCore>('ReactorCore');
class FusionReactor implements IReactorCore {
  readonly output = 1.21;
  [Symbol.dispose]() {}
}
const Engineering = defineModule({
  name: 'Engineering',
  providers: [provide(REACTOR, { useClass: FusionReactor })],
});

describe('profileStartup', () => {
  it('creates, loads in order, disposes and resolves with the report', async () => {
    class Probe {}
    const report = await profileStartup(Engineering, {
      load: [defineModule({ name: 'Science', providers: [Probe] })],
    });
    expect(report.runs.map((r) => [r.kind, r.ok])).toEqual([
      ['create', true],
      ['load', true],
    ]);
    expect(report.dispose).toMatchObject({ errors: 0 });
  });

  it('runs two loads in order, each as a load run', async () => {
    class Probe {}
    class Lander {}
    const report = await profileStartup(Engineering, {
      load: [
        defineModule({ name: 'Science', providers: [Probe] }),
        defineModule({ name: 'Landing', providers: [Lander] }),
      ],
    });
    expect(report.runs.map((r) => [r.id, r.kind])).toEqual([
      [0, 'create'],
      [1, 'load'],
      [2, 'load'],
    ]);
    expect(report.runs[2]?.builds.map((b) => b.token)).toEqual(['Lander']);
  });

  it('loads a LoadEntry with a grant, so the module sees the granted exports', async () => {
    const HELM = new Token<string>('Helm');
    const COURSE = new Token<string>('Course');
    const Helm = defineModule({
      name: 'Helm',
      providers: [provide(HELM, { useValue: 'helm-1' })],
      exports: [HELM],
    });
    const Chart = defineModule({
      name: 'Chart',
      providers: [
        provide(COURSE, {
          useFactory: (helm: string) => helm,
          deps: [HELM],
        }),
      ],
    });
    const root = defineModule({ name: 'Root', imports: [Helm] });
    const report = await profileStartup(root, {
      load: [{ module: Chart, imports: [Helm] }],
    });
    expect(report.runs.map((r) => [r.kind, r.ok])).toEqual([
      ['create', true],
      ['load', true],
    ]);
    expect(report.runs[1]?.builds.map((b) => b.token)).toEqual(['Course']);
    const bare = await rejected(profileStartup(root, { load: [Chart] }));
    expect(isNexusError(bare)).toBe(true);
  });

  it.each([
    ['a string', 'Survey', 'the string "Survey"'],
    ['an empty object', {}, 'an object'],
    ['null', null, 'null'],
  ])(
    'rejects with core error that names the value for %s in the load list',
    async (_label, value, received) => {
      const error = await rejected(
        profileStartup(Engineering, { load: [value as never] }),
      );
      expect(isNexusError(error, 'NEXUS_INVALID_MODULE')).toBe(true);
      expect(error).toMatchObject({ received });
    },
  );

  it('disposes what create built when a load fails, and rejects with its error', async () => {
    const disposed: string[] = [];
    class Hull {
      [Symbol.dispose]() {
        disposed.push('Hull');
      }
    }
    class Breach {
      constructor() {
        throw new Error('hull breach');
      }
    }
    const profiler = profile();
    const error = await rejected(
      profileStartup(defineModule({ name: 'Root', providers: [Hull] }), {
        load: [defineModule({ name: 'Damaged', providers: [Breach] })],
        profiler,
      }),
    );
    expect(isNexusError(error, 'NEXUS_PROVIDER_FAILED')).toBe(true);
    expect(disposed).toEqual(['Hull']);
    expect(profiler.report().runs.map((r) => [r.kind, r.ok])).toEqual([
      ['create', true],
      ['load', false],
    ]);
  });

  it('rejects with the create error and leaves the partial report in the profiler', async () => {
    class Breach {
      constructor() {
        throw new Error('hull breach');
      }
    }
    const profiler = profile();
    await rejected(
      profileStartup(defineModule({ name: 'Root', providers: [Breach] }), {
        profiler,
      }),
    );
    expect(profiler.report().runs).toMatchObject([{ ok: false }]);
  });

  it('resolves when disposal fails, and counts the error', async () => {
    class Leaky {
      [Symbol.dispose]() {
        throw new Error('seal');
      }
    }
    const report = await profileStartup(
      defineModule({ name: 'Root', providers: [Leaky] }),
    );
    expect(report.dispose).toMatchObject({ errors: 1 });
  });
});
