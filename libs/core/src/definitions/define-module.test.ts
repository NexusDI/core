import { describe, expect, it } from 'vitest';

import { thrown } from '../../test-support/catch.js';
import {
  defineModule,
  moduleInternals,
  registerModuleClass,
  resolveModuleRef,
} from './define-module.js';
import { provide } from './provide.js';
import { Token } from './token.js';

class ReactorCore {}
const COMMS_OPTIONS = new Token<{ frequency: number }>('CommsOptions');

describe('defineModule', () => {
  it('returns a frozen definition with defaults for the omitted fields', () => {
    const Engineering = defineModule({
      name: 'Engineering',
      providers: [ReactorCore],
    });
    expect(Engineering).toMatchObject({
      name: 'Engineering',
      imports: [],
      providers: [ReactorCore],
      exports: [],
      global: false,
    });
    expect(Object.isFrozen(Engineering)).toBe(true);
    expect(Object.isFrozen(Engineering.providers)).toBe(true);
  });

  it('copies the arrays it receives', () => {
    const providers = [ReactorCore];
    const Engineering = defineModule({ name: 'Engineering', providers });
    providers.push(class Other {});
    expect(Engineering.providers).toHaveLength(1);
  });

  it('throws NEXUS_INVALID_MODULE for a config without a name', () => {
    expect(thrown(() => defineModule({} as never))).toMatchObject({
      code: 'NEXUS_INVALID_MODULE',
      received: 'an object',
      path: [],
    });
  });

  it('gives a configurable module a with() that records the options value', () => {
    const Comms = defineModule({ name: 'Comms', options: COMMS_OPTIONS });
    const tuned = Comms.with({ frequency: 1420 });
    expect(moduleInternals(tuned)).toEqual({
      base: Comms,
      options: COMMS_OPTIONS,
      schema: undefined,
      source: { kind: 'value', value: { frequency: 1420 } },
    });
    expect(moduleInternals(Comms)?.source).toBeUndefined();
  });

  it('records a factory passed to with()', () => {
    const Comms = defineModule({ name: 'Comms', options: COMMS_OPTIONS });
    const useFactory = () => ({ frequency: 7 });
    expect(
      moduleInternals(Comms.with({ deps: [], useFactory }))?.source,
    ).toEqual({
      kind: 'factory',
      deps: [],
      useFactory,
    });
  });

  it('returns a new module instance from every with() call', () => {
    const Comms = defineModule({ name: 'Comms', options: COMMS_OPTIONS });
    expect(Comms.with({ frequency: 1 })).not.toBe(Comms.with({ frequency: 1 }));
  });
});

describe('resolveModuleRef', () => {
  it('resolves a definition to itself and a registered class to its definition', () => {
    const Engineering = defineModule({ name: 'Engineering' });
    class Command {}
    registerModuleClass(Command, Engineering);
    expect(resolveModuleRef(Engineering)).toBe(Engineering);
    expect(resolveModuleRef(Command)).toBe(Engineering);
  });

  it('resolves nothing for other values', () => {
    expect(resolveModuleRef(ReactorCore)).toBeUndefined();
    expect(
      resolveModuleRef({
        name: 'Fake',
        imports: [],
        providers: [],
        exports: [],
        global: false,
      }),
    ).toBeUndefined();
    expect(resolveModuleRef(provide(ReactorCore))).toBeUndefined();
  });
});
