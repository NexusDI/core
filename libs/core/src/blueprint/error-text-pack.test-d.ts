import { describe, expectTypeOf, it } from 'vitest';

import { cacheText } from '../../test-support/third-party-pack.js';
import { AcmeCacheStoreError } from '../../test-support/third-party-codes.js';
import type {
  BlueprintView,
  ErrorText,
  ErrorTextKit,
  ErrorTextPack,
  MissingProviderError,
  NearMiss,
} from '../index.js';

type Entry<C extends keyof ErrorTextPack> = NonNullable<ErrorTextPack[C]>;

describe('ErrorTextPack', () => {
  it('accepts a pack for a code a package added to NexusErrorByCode', () => {
    expectTypeOf(cacheText).toExtend<ErrorTextPack>();
  });

  it('rejects an entry for a code no package added', () => {
    void ({
      // @ts-expect-error: ACME_UNKNOWN is not a key of NexusErrorByCode
      ACME_UNKNOWN: () => undefined,
    } satisfies ErrorTextPack);
  });

  it('passes an entry the class of its code', () => {
    expectTypeOf<
      Parameters<Entry<'ACME_CACHE_STORE'>>[0]
    >().toEqualTypeOf<AcmeCacheStoreError>();
    expectTypeOf<
      Parameters<Entry<'NEXUS_MISSING_PROVIDER'>>[0]
    >().toEqualTypeOf<MissingProviderError>();
  });

  it('passes an entry the view, or undefined, and the kit', () => {
    expectTypeOf<Parameters<Entry<'ACME_CACHE_STORE'>>[1]>().toEqualTypeOf<
      BlueprintView | undefined
    >();
    expectTypeOf<
      Parameters<Entry<'ACME_CACHE_STORE'>>[2]
    >().toEqualTypeOf<ErrorTextKit>();
  });

  it('lets an entry return undefined to leave the error to the next pack', () => {
    const pack = {
      ACME_CACHE_STORE: () => undefined,
    } satisfies ErrorTextPack;
    expectTypeOf(pack).toExtend<ErrorTextPack>();
    expectTypeOf<ReturnType<Entry<'ACME_CACHE_STORE'>>>().toEqualTypeOf<
      ErrorText | undefined
    >();
  });
});

describe('ErrorTextKit', () => {
  it('returns near misses for a token and a module id', () => {
    expectTypeOf<ErrorTextKit['nearMisses']>().toEqualTypeOf<
      (token: unknown, moduleId: string) => readonly NearMiss[]
    >();
  });
});
