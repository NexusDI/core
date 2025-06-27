import { Module } from './decorators';
import { DynamicModule } from './module';
import { getMetadata } from './helpers';
import { METADATA_KEYS } from './constants';

// Dummy config token for testing
const TEST_CONFIG_TOKEN = Symbol('TEST_CONFIG');

/**
 * TestDynamicModule: Ensures that subclasses of DynamicModule decorated with @Module
 * are recognized correctly and their metadata is accessible. This prevents regressions
 * where subclass metadata was not read due to static method context issues.
 */
@Module({
  providers: [],
})
class TestDynamicModule extends DynamicModule<any> {
  protected readonly configToken = TEST_CONFIG_TOKEN;
}

/**
 * BasicModule: Tests that the @Module decorator attaches metadata to a class and
 * that all properties (providers, services, imports, exports) are reflected correctly.
 * This ensures the decorator works for standard modules, not just DynamicModule.
 */
@Module({
  providers: [class ProviderA {}],
  services: [class ServiceA {}],
  imports: [],
  exports: [],
})
class BasicModule {}

/**
 * InheritedModule: Tests that a subclass of a module can override or inherit metadata.
 * This ensures that module inheritance does not break metadata reflection.
 */
@Module({ providers: [class ProviderB {}] })
class ParentModule {}

/**
 * NotDecorated: Used to test error handling when getModuleConfig is called on a class
 * that is not decorated with @Module. This ensures clear error messages for misconfiguration.
 */
class NotDecorated extends DynamicModule<any> {
  protected readonly configToken = Symbol('NOT_DECORATED');
}

describe('DynamicModule', () => {
  /**
   * Ensures that subclasses of DynamicModule decorated with @Module are recognized
   * and their metadata is accessible. Prevents regressions of the metadata bug.
   */
  it('should read @Module metadata from subclasses', () => {
    const config = TestDynamicModule.getModuleConfig();
    expect(config).toBeDefined();
    expect(config.providers).toBeInstanceOf(Array);
  });

  /**
   * Ensures that the configToken is correctly returned from the subclass.
   * This is important for dynamic module configuration and DI token management.
   */
  it('should return the correct configToken from subclass', () => {
    expect(TestDynamicModule.getConfigToken()).toBe(TEST_CONFIG_TOKEN);
  });

  /**
   * Ensures that config() creates a module config with the provided config value.
   * This is important for passing runtime configuration to modules.
   */
  it('should create a config module with config()', () => {
    const result = TestDynamicModule.config({ foo: 'bar' });
    const hasConfigProvider = result.providers.some(
      (p) =>
        typeof p === 'object' &&
        p !== null &&
        'useValue' in p &&
        (p as any).useValue &&
        (p as any).useValue.foo === 'bar'
    );
    expect(hasConfigProvider).toBe(true);
  });

  /**
   * Ensures that configAsync() creates a module config with an async factory.
   * This is important for supporting async configuration (e.g., from env or remote sources).
   */
  it('should create a config module with configAsync()', async () => {
    const result = TestDynamicModule.configAsync(async () => ({ foo: 'baz' }));
    const provider = result.providers.find(
      (p) =>
        typeof p === 'object' &&
        p !== null &&
        'useFactory' in p &&
        typeof (p as any).useFactory === 'function'
    );
    expect(provider).toBeDefined();
    const value = await (provider as any).useFactory();
    expect(value.foo).toBe('baz');
  });
});

describe('Module decorator', () => {
  /**
   * Tests that the @Module decorator attaches metadata to a decorated class and
   * that all properties are reflected correctly. This ensures the decorator works
   * for standard modules, not just DynamicModule.
   */
  it('should attach metadata to a decorated class', () => {
    const metadata = getMetadata(BasicModule, METADATA_KEYS.MODULE_METADATA);
    expect(metadata).toBeDefined();
    expect(metadata.providers).toBeInstanceOf(Array);
    expect(metadata.services).toBeInstanceOf(Array);
    expect(metadata.imports).toBeInstanceOf(Array);
    expect(metadata.exports).toBeInstanceOf(Array);
  });
});

describe('Module inheritance', () => {
  /**
   * Test: Subclass without @Module is not a valid module
   * Validates: Subclasses must be decorated with @Module to be treated as modules
   * Value: Ensures that only explicitly decorated classes are treated as modules, preventing accidental inheritance of module status.
   */
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
    const metadata = getMetadata(ParentModule, METADATA_KEYS.MODULE_METADATA);
    expect(metadata).toBeDefined();
    expect(metadata.providers).toBeInstanceOf(Array);
  });
});

describe('Module error handling', () => {
  /**
   * Tests that calling getModuleConfig on a class not decorated with @Module throws an error.
   * This ensures clear error messages for misconfiguration and helps developers debug quickly.
   */
  it('should throw if not decorated with @Module', () => {
    expect(() => NotDecorated.getModuleConfig()).toThrow(
      /not properly decorated/
    );
  });
});

describe('Module token handling', () => {
  /**
   * Tests that providers with different token types (class, string, symbol) are handled correctly.
   * This ensures the DI system is robust to various token types.
   */
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
});

describe('Module edge cases', () => {
  /**
   * Tests that modules with empty or missing arrays for providers, services, etc., do not break.
   * This ensures the module system is robust to minimal or incomplete configs.
   */
  it('should handle modules with empty or missing arrays', () => {
    @Module({})
    class EmptyModule {}
    const metadata = getMetadata(EmptyModule, METADATA_KEYS.MODULE_METADATA);
    expect(metadata).toBeDefined();
    expect(metadata.providers ?? []).toBeInstanceOf(Array);
    expect(metadata.services ?? []).toBeInstanceOf(Array);
    expect(metadata.imports ?? []).toBeInstanceOf(Array);
    expect(metadata.exports ?? []).toBeInstanceOf(Array);
  });
});
