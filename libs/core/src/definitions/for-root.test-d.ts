import { describe, expectTypeOf, it } from 'vitest';
import * as z from 'zod';

import {
  type ConfigurableModule,
  type ConfigurableModuleConfig,
  defineModule,
} from './define-module.js';
import type { StandardSchemaV1 } from './standard-schema.js';
import { Token } from './token.js';

const OPTIONS = new Token<{ frequency: number }>('CommsOptions');
const LINK = new Token<{ band: string }>('Link');
const Comms = defineModule({ name: 'Comms', options: OPTIONS });

describe('forRoot', () => {
  it('checks the value against the options type', () => {
    Comms.forRoot({ frequency: 1 });
    // @ts-expect-error a string is not a number
    Comms.forRoot({ frequency: '1' });
  });
});

describe('forRootAsync', () => {
  it('types the factory parameters from deps', () => {
    Comms.forRootAsync({
      useFactory: (link) => {
        expectTypeOf(link).toEqualTypeOf<{ band: string }>();
        return { frequency: link.band.length };
      },
      deps: [LINK],
    });
    // @ts-expect-error the factory returns the wrong shape
    Comms.forRootAsync({ useFactory: async () => ({ band: 'x' }) });
  });

  it('has no with()', () => {
    // @ts-expect-error with() is gone
    Comms.with;
  });
});

/** A Standard Schema whose types say it reads `I` and produces `O`. */
function schemaOf<I, O>(): StandardSchemaV1<I, O> {
  return {
    '~standard': {
      version: 1,
      vendor: 'test',
      validate: (value) => ({ value: value as O }),
      types: { input: undefined as I, output: undefined as O },
    },
  };
}

interface TunedOptions {
  frequency: number;
  band: string;
}
const TUNED = new Token<TunedOptions>('TunedOptions');

describe('a schema with defaults', () => {
  const Tuned = defineModule({
    name: 'Tuned',
    options: TUNED,
    schema: schemaOf<{ frequency: number; band?: string }, TunedOptions>(),
  });

  it('lets forRoot() leave out a field the schema defaults', () => {
    Tuned.forRoot({ frequency: 1420 });
    // @ts-expect-error frequency has no default
    Tuned.forRoot({ band: 'S' });
    // @ts-expect-error band is a string
    Tuned.forRoot({ frequency: 1420, band: 7 });
  });

  it('lets the forRootAsync() factory return the schema input', () => {
    Tuned.forRootAsync({ useFactory: () => ({ frequency: 1420 }) });
    Tuned.forRootAsync({ useFactory: async () => ({ frequency: 1420 }) });
    // @ts-expect-error frequency has no default
    Tuned.forRootAsync({ useFactory: () => ({ band: 'S' }) });
  });

  it('keeps the options token at the schema output', () => {
    expectTypeOf(Tuned.options).toEqualTypeOf<Token<TunedOptions>>();
  });
});

describe('a schema that transforms', () => {
  const Parsed = defineModule({
    name: 'Parsed',
    options: new Token<{ frequency: number }>('ParsedOptions'),
    schema: schemaOf<{ frequency: string }, { frequency: number }>(),
  });

  it('types forRoot() with the input the schema reads', () => {
    Parsed.forRoot({ frequency: '1420' });
    // @ts-expect-error the schema reads a string
    Parsed.forRoot({ frequency: 1420 });
  });
});

describe('a schema without an input type', () => {
  const Loose = defineModule({
    name: 'Loose',
    options: TUNED,
    schema: schemaOf<unknown, TunedOptions>(),
  });

  it('types forRoot() with the options token', () => {
    Loose.forRoot({ frequency: 1420, band: 'S' });
    // @ts-expect-error band is required by the token
    Loose.forRoot({ frequency: 1420 });
  });
});

describe('a module without a schema', () => {
  it('types forRoot() with the options token', () => {
    const Plain = defineModule({ name: 'Plain', options: TUNED });
    expectTypeOf(Plain).toEqualTypeOf<ConfigurableModule<TunedOptions>>();
    // @ts-expect-error band is required by the token
    Plain.forRoot({ frequency: 1420 });
  });
});

describe('a zod schema', () => {
  const ZodSchema = z.object({
    frequency: z.number().default(1420),
    band: z.string().transform((band) => band.length),
  });
  const ZOD = new Token<z.output<typeof ZodSchema>>('ZodOptions');
  const Zod = defineModule({ name: 'Zod', options: ZOD, schema: ZodSchema });

  it('types forRoot() with the input zod declares', () => {
    Zod.forRoot({ band: 'S' });
    // @ts-expect-error band is a string before the transform
    Zod.forRoot({ band: 1 });
    // @ts-expect-error zod object input has no extra key
    Zod.forRoot({ band: 'S', extra: true });
  });

  it('accepts the options type named on the call', () => {
    const Named = defineModule<z.output<typeof ZodSchema>>({
      name: 'Named',
      options: ZOD,
      schema: ZodSchema,
    });
    expectTypeOf(Named).toEqualTypeOf<
      ConfigurableModule<z.output<typeof ZodSchema>>
    >();
  });
});

describe('ConfigurableModuleConfig', () => {
  it('holds a schema with any input for the options type', () => {
    const config: ConfigurableModuleConfig<TunedOptions> = {
      name: 'Tuned',
      options: TUNED,
      schema: schemaOf<{ frequency: number; band?: string }, TunedOptions>(),
    };
    expectTypeOf(config.options).toEqualTypeOf<Token<TunedOptions>>();
  });
});

describe('ConfigurableModule', () => {
  it('keeps a module with a narrower input from passing as one that takes the output', () => {
    const Ported = defineModule({
      name: 'Ported',
      options: new Token<{ port: number }>('PortedOptions'),
      schema: schemaOf<{ port: 80 | 443 }, { port: number }>(),
    });
    expectTypeOf(Ported).not.toExtend<ConfigurableModule<{ port: number }>>();
  });

  it('lets a module whose schema only adds defaults pass as one that takes the output', () => {
    const Tuned = defineModule({
      name: 'Tuned',
      options: TUNED,
      schema: schemaOf<{ frequency: number; band?: string }, TunedOptions>(),
    });
    expectTypeOf(Tuned).toExtend<ConfigurableModule<TunedOptions>>();
  });
});
