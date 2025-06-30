import { describe, it, expect, beforeEach } from 'vitest';
import { Module } from './module';
import { Token } from '../token';
import { getMetadata } from '../helpers';
import { METADATA_KEYS } from '../constants';
import { Provider, Service } from './provider';

// --- Basic metadata attachment ---
describe('@Module', () => {
  beforeEach(() => {
    if ((class TestModule {} as any)[(Symbol as any).metadata])
      delete (class TestModule {} as any)[(Symbol as any).metadata][
        METADATA_KEYS.MODULE_METADATA
      ];
  });

  it('should add module metadata to class', () => {
    @Module({ imports: [], providers: [], exports: [] })
    class TestModule {}
    const metadata = getMetadata(TestModule, METADATA_KEYS.MODULE_METADATA);
    expect(metadata).toEqual({
      imports: [],
      providers: [],
      exports: [],
    });
  });

  it('should handle module with providers', () => {
    const TEST_TOKEN = new Token('TEST');
    class TestProvider {}

    @Module({ providers: [{ token: TEST_TOKEN, useClass: TestProvider }] })
    class TestModule {}

    const metadata = getMetadata(TestModule, METADATA_KEYS.MODULE_METADATA);
    expect(metadata.providers).toHaveLength(1);
    expect(metadata.providers[0].token).toBe(TEST_TOKEN);
  });

  it('should handle module with imports', () => {
    @Module({ providers: [], exports: [] })
    class ImportedModule {}

    @Module({ imports: [ImportedModule] })
    class TestModule {}
    const metadata = getMetadata(TestModule, METADATA_KEYS.MODULE_METADATA);
    expect(metadata.imports).toEqual([ImportedModule]);
  });

  it('should attach metadata to a decorated class (robust)', () => {
    @Provider()
    class ProviderA {
      foo = 'bar';
    }

    @Service()
    class ServiceA {
      constructor(private provider: ProviderA) {}

      test() {
        return this.provider.foo;
      }
    }

    @Module({
      providers: [ProviderA, ServiceA],
      imports: [],
      exports: [],
    })
    class BasicModule {}

    const metadata = getMetadata(BasicModule, METADATA_KEYS.MODULE_METADATA);
    expect(metadata).toBeDefined();
    expect(metadata.providers).toBeInstanceOf(Array);
    expect(metadata.imports).toBeInstanceOf(Array);
    expect(metadata.exports).toBeInstanceOf(Array);
  });

  it('should support providers with class and symbol tokens', () => {
    const SymbolToken = Symbol('SYMBOL_TOKEN');
    class ClassToken {}
    @Module({
      providers: [
        { token: SymbolToken, useValue: 2 },
        { token: ClassToken, useValue: 3 },
      ],
    })
    class TokenModule {}
    const metadata = getMetadata(TokenModule, METADATA_KEYS.MODULE_METADATA);
    expect(metadata.providers.some((p: any) => p.token === SymbolToken)).toBe(
      true
    );
    expect(metadata.providers.some((p: any) => p.token === ClassToken)).toBe(
      true
    );
  });

  it('should handle modules with empty or missing arrays', () => {
    @Module({})
    class EmptyModule {}
    const metadata = getMetadata(EmptyModule, METADATA_KEYS.MODULE_METADATA);
    expect(metadata).toBeDefined();
    expect(metadata.providers ?? []).toBeInstanceOf(Array);
    expect(metadata.imports ?? []).toBeInstanceOf(Array);
    expect(metadata.exports ?? []).toBeInstanceOf(Array);
  });
});

// --- Inheritance ---
describe('Module inheritance', () => {
  it('should require @Module on subclass to be treated as a module', () => {
    class ProviderB {}
    @Module({ providers: [ProviderB] })
    class ParentModule {}
    class SubModule extends ParentModule {}
    // Should not have its own Symbol.metadata property
    expect(
      Object.prototype.hasOwnProperty.call(SubModule, (Symbol as any).metadata)
    ).toBe(false);
    // Should inherit parent's MODULE_METADATA value
    const parentMeta = getMetadata(ParentModule, METADATA_KEYS.MODULE_METADATA);
    const subMeta = getMetadata(SubModule, METADATA_KEYS.MODULE_METADATA);
    expect(subMeta).toEqual(parentMeta);
  });

  it('should have metadata on parent if decorated', () => {
    @Module({ providers: [class ProviderB {}] })
    class ParentModule {}
    const metadata = getMetadata(ParentModule, METADATA_KEYS.MODULE_METADATA);
    expect(metadata).toBeDefined();
    expect(metadata.providers).toBeInstanceOf(Array);
  });
});
