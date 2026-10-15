import { describe, expect, it } from 'vitest';

import { thrown } from '../../test-support/catch.js';
import { moduleDefinitionOf } from '../index.js';
import {
  declareModuleClass,
  defineModule,
  moduleInternals,
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

  it('keeps forRoot() unaffected by mutating the config object afterward', () => {
    const providers = [ReactorCore];
    const config = { name: 'Comms', options: COMMS_OPTIONS, providers };
    const Comms = defineModule(config);
    providers.push(class Other {});
    expect(Comms.forRoot({ frequency: 1 }).providers).toHaveLength(1);
  });

  it('throws NEXUS_INVALID_MODULE for a config without a name', () => {
    expect(thrown(() => defineModule({} as never))).toMatchObject({
      code: 'NEXUS_INVALID_MODULE',
      received: 'an object',
      path: [],
    });
  });

  it('returns a new module instance from every forRoot() call', () => {
    const Comms = defineModule({ name: 'Comms', options: COMMS_OPTIONS });
    expect(Comms.forRoot({ frequency: 1 })).not.toBe(
      Comms.forRoot({ frequency: 1 }),
    );
  });
});

describe('moduleDefinitionOf', () => {
  it('resolves a definition to itself and a registered class to its definition', () => {
    const Engineering = defineModule({ name: 'Engineering' });
    class Command {}
    expect(declareModuleClass(Command, { name: 'Command' })).toBe(Command);
    const definition = moduleDefinitionOf(Command);
    expect(moduleDefinitionOf(Engineering)).toBe(Engineering);
    expect(definition).toMatchObject({ name: 'Command' });
    expect(moduleDefinitionOf(definition)).toBe(definition);
    expect(moduleDefinitionOf(Command)).toBe(definition);
  });

  it('resolves nothing for other values', () => {
    expect(moduleDefinitionOf(ReactorCore)).toBeUndefined();
    expect(
      moduleDefinitionOf({
        name: 'Fake',
        imports: [],
        providers: [],
        exports: [],
        global: false,
      }),
    ).toBeUndefined();
    expect(moduleDefinitionOf(provide(ReactorCore))).toBeUndefined();
  });
});

describe('moduleInternals', () => {
  it('gives a configurable module a forRoot() that records the options value', () => {
    const Comms = defineModule({ name: 'Comms', options: COMMS_OPTIONS });
    const tuned = Comms.forRoot({ frequency: 1420 });
    expect(moduleInternals(tuned)).toEqual({
      base: Comms,
      options: COMMS_OPTIONS,
      schema: undefined,
      source: { kind: 'value', value: { frequency: 1420 } },
    });
    expect(moduleInternals(Comms)?.source).toBeUndefined();
  });

  it('records a factory passed to forRootAsync()', () => {
    const Comms = defineModule({ name: 'Comms', options: COMMS_OPTIONS });
    const useFactory = () => ({ frequency: 7 });
    expect(
      moduleInternals(Comms.forRootAsync({ useFactory, deps: [] }))?.source,
    ).toEqual({
      kind: 'factory',
      deps: [],
      useFactory,
    });
  });
});
