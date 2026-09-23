import { describe, expectTypeOf, it } from 'vitest';

import { defineModule, type ModuleDefinition } from './define-module.js';
import { provide } from './provide.js';
import type { StandardSchemaV1 } from './standard-schema.js';
import { Token } from './token.js';

interface CommsOptions {
  frequency: number;
}
const COMMS_OPTIONS = new Token<CommsOptions>('CommsOptions');
class SubspaceLink {
  constructor(readonly options: CommsOptions) {}
}
const schema: StandardSchemaV1<unknown, CommsOptions> = {
  '~standard': {
    version: 1,
    vendor: 'test',
    validate: (value) => ({ value: value as CommsOptions }),
  },
};

const Engineering = defineModule({ name: 'Engineering' });
const Comms = defineModule({
  name: 'Comms',
  options: COMMS_OPTIONS,
  schema,
  providers: [provide(SubspaceLink, { deps: [COMMS_OPTIONS] })],
  exports: [SubspaceLink],
});

describe('defineModule', () => {
  it('returns a plain definition without with()', () => {
    expectTypeOf(Engineering).toEqualTypeOf<ModuleDefinition>();
    // @ts-expect-error a module without options has no with()
    Engineering.with;
  });

  it('checks a with() value against the options token', () => {
    expectTypeOf(
      Comms.with({ frequency: 1420 }),
    ).toEqualTypeOf<ModuleDefinition>();
    // @ts-expect-error frequency is a number
    Comms.with({ frequency: 'high' });
  });

  it('types a with() factory from its deps', () => {
    Comms.with({
      deps: [SubspaceLink],
      useFactory: (link) => {
        expectTypeOf(link).toEqualTypeOf<SubspaceLink>();
        return { frequency: link.options.frequency + 1 };
      },
    });
  });

  it('accepts only a schema whose output matches the options type', () => {
    const wrong: StandardSchemaV1<unknown, { band: string }> = {
      '~standard': {
        version: 1,
        vendor: 'test',
        validate: () => ({ value: { band: 'x' } }),
      },
    };
    // @ts-expect-error the schema produces { band }, not CommsOptions
    defineModule({ name: 'Bad', options: COMMS_OPTIONS, schema: wrong });
  });
});
