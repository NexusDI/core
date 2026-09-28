import { describe, expectTypeOf, it } from 'vitest';

import {
  errorBase,
  isNexusError,
  MissingProviderError,
  NexusError,
  type NexusErrorByCode,
  type NexusErrorCode,
} from './index.js';

describe('errorBase', () => {
  it('types the fields as own properties', () => {
    class A extends errorBase<'NEXUS_TEST_A', { contract: string }>(
      'NEXUS_TEST_A',
      'A',
    ) {}
    expectTypeOf(new A({ contract: 'x' }).contract).toEqualTypeOf<string>();
    expectTypeOf(new A({ contract: 'x' }).code).toEqualTypeOf<'NEXUS_TEST_A'>();
  });

  it('rejects a field named message, name, stack or cause', () => {
    // @ts-expect-error message is reserved
    errorBase<'NEXUS_TEST_B', { message: string }>('NEXUS_TEST_B', 'B');
    // @ts-expect-error name is reserved
    errorBase<'NEXUS_TEST_D', { name: string }>('NEXUS_TEST_D', 'D');
    // @ts-expect-error stack is reserved
    errorBase<'NEXUS_TEST_E', { stack: string }>('NEXUS_TEST_E', 'E');
    // @ts-expect-error cause is reserved
    errorBase<'NEXUS_TEST_C', { cause: string }>('NEXUS_TEST_C', 'C');
  });

  it('makes a package error assignable to NexusError', () => {
    class P extends errorBase<'NEXUS_TEST_P', { contract: string }>(
      'NEXUS_TEST_P',
      'P',
    ) {}
    expectTypeOf(new P({ contract: 'x' })).toMatchTypeOf<NexusError>();
  });
});

describe('MissingProviderError', () => {
  it('exposes its fields as typed own properties', () => {
    const error = new MissingProviderError({
      token: 'A',
      requester: null,
      module: 'Root',
      entry: null,
      nearMisses: [],
    });
    expectTypeOf(error.token).toEqualTypeOf<string>();
    expectTypeOf(error.requester).toEqualTypeOf<string | null>();
    expectTypeOf(error.code).toEqualTypeOf<'NEXUS_MISSING_PROVIDER'>();
  });

  it('spreads with the code after the fields, and rejects the code before them', () => {
    const error = new MissingProviderError({
      token: 'A',
      requester: null,
      module: 'Root',
      entry: null,
      nearMisses: [],
    });
    expectTypeOf(
      {
        ...error,
        code: error.code,
      }.code,
    ).toEqualTypeOf<'NEXUS_MISSING_PROVIDER'>();
    // @ts-expect-error TS2783: the spread's `code` overwrites the one before it
    void { code: error.code, ...error };
  });
});

describe('isNexusError', () => {
  it('narrows to the class of the code', () => {
    const value: unknown = undefined;
    if (isNexusError(value, 'NEXUS_MISSING_PROVIDER'))
      expectTypeOf(value).toEqualTypeOf<MissingProviderError>();
  });

  it('knows every core code', () => {
    expectTypeOf<keyof NexusErrorByCode>().toEqualTypeOf<NexusErrorCode>();
  });
});
