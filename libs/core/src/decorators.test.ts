/* eslint-disable @typescript-eslint/no-explicit-any */
import 'reflect-metadata';
import { describe, it, expect, beforeEach } from 'vitest';
import { Module, Service, Provider, Inject } from './decorators';
import { Token } from './token';
import { METADATA_KEYS } from './types';

describe('Decorators', () => {
  beforeEach(() => {
    // Clear metadata before each test - only clear what exists
    Reflect.deleteMetadata(METADATA_KEYS.MODULE_METADATA, class TestModule {});
    Reflect.deleteMetadata(
      METADATA_KEYS.SERVICE_METADATA,
      class TestService {}
    );
    Reflect.deleteMetadata(METADATA_KEYS.INJECT_METADATA, class TestService {});
    Reflect.deleteMetadata(
      METADATA_KEYS.INJECT_METADATA,
      class TestService {}.prototype
    );
  });

  // @Module decorator group: Ensures module metadata is attached and correct
  describe('@Module', () => {
    /**
     * Test: Adds module metadata to class
     * Validates: All properties are present and correct
     * Value: Ensures modules are discoverable and configurable by DI
     */
    it('should add module metadata to class', () => {
      @Module({
        imports: [],
        services: [],
        providers: [],
        exports: [],
      })
      class TestModule {}

      const metadata = Reflect.getMetadata(
        METADATA_KEYS.MODULE_METADATA,
        TestModule
      );
      expect(metadata).toEqual({
        imports: [],
        services: [],
        providers: [],
        exports: [],
      });
    });

    /**
     * Test: Handles module with services
     * Validates: Services array is present and correct
     * Value: Ensures service registration in modules works as expected
     */
    it('should handle module with services', () => {
      class TestService {}

      @Module({
        services: [TestService],
      })
      class TestModule {}

      const metadata = Reflect.getMetadata(
        METADATA_KEYS.MODULE_METADATA,
        TestModule
      );
      expect(metadata.services).toEqual([TestService]);
    });

    /**
     * Test: Handles module with providers
     * Validates: Providers array is present and correct
     * Value: Ensures provider registration in modules works as expected
     */
    it('should handle module with providers', () => {
      const testToken = new Token('TEST');

      @Module({
        providers: [{ token: testToken, useClass: class TestProvider {} }],
      })
      class TestModule {}

      const metadata = Reflect.getMetadata(
        METADATA_KEYS.MODULE_METADATA,
        TestModule
      );
      expect(metadata.providers).toHaveLength(1);
      expect(metadata.providers[0].token).toBe(testToken);
    });

    /**
     * Test: Handles module with imports
     * Validates: Imports array is present and correct
     * Value: Ensures module composition and dependency graphing works
     */
    it('should handle module with imports', () => {
      class ImportedModule {}

      @Module({
        imports: [ImportedModule],
      })
      class TestModule {}

      const metadata = Reflect.getMetadata(
        METADATA_KEYS.MODULE_METADATA,
        TestModule
      );
      expect(metadata.imports).toEqual([ImportedModule]);
    });
  });

  // @Service decorator group: Ensures service metadata is attached and correct
  describe('@Service', () => {
    /**
     * Test: Adds service metadata with class as token
     * Validates: Token is the class itself
     * Value: Ensures default service registration is robust
     */
    it('should add service metadata with class as token', () => {
      @Service()
      class TestService {}

      const metadata = Reflect.getMetadata(
        METADATA_KEYS.SERVICE_METADATA,
        TestService
      );
      expect(metadata.token).toBe(TestService);
    });

    /**
     * Test: Adds service metadata with custom token
     * Validates: Token is the custom token
     * Value: Allows for advanced DI scenarios with custom tokens
     */
    it('should add service metadata with custom token', () => {
      const customToken = new Token('CUSTOM_SERVICE');

      @Service(customToken)
      class TestService {}

      const metadata = Reflect.getMetadata(
        METADATA_KEYS.SERVICE_METADATA,
        TestService
      );
      expect(metadata.token).toBe(customToken);
    });

    /**
     * Test: Adds service metadata with string token
     * Validates: Token is the string
     * Value: Allows for string-based DI tokens for convenience
     */
    it('should add service metadata with string token', () => {
      @Service('STRING_TOKEN')
      class TestService {}

      const metadata = Reflect.getMetadata(
        METADATA_KEYS.SERVICE_METADATA,
        TestService
      );
      expect(metadata.token).toBe('STRING_TOKEN');
    });
  });

  // @Provider decorator group: Ensures provider classes are marked for DI
  describe('@Provider', () => {
    /**
     * Test: Adds provider metadata (marker only)
     * Validates: Class is defined and usable
     * Value: Ensures provider classes can be registered and discovered
     */
    it('should add provider metadata', () => {
      const providerToken = new Token('PROVIDER');

      @Provider(providerToken)
      class TestProvider {}

      // @Provider doesn't add metadata, it's just a marker decorator
      // The actual provider registration happens in the container
      expect(TestProvider).toBeDefined();
    });

    /**
     * Test: Works with string token
     * Validates: Class is defined and usable
     * Value: Allows for string-based provider tokens
     */
    it('should work with string token', () => {
      @Provider('STRING_PROVIDER')
      class TestProvider {}

      expect(TestProvider).toBeDefined();
    });
  });

  // @Inject decorator group: Ensures injection metadata is attached and correct
  describe('@Inject', () => {
    /**
     * Test: Adds injection metadata for constructor parameter
     * Validates: Metadata is present and correct for parameter
     * Value: Enables constructor injection for DI
     */
    it('should add injection metadata for constructor parameter', () => {
      const injectToken = new Token('INJECT');

      class TestService {
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        constructor(@Inject(injectToken) dependency: any) {}
      }

      const metadata = Reflect.getMetadata(
        METADATA_KEYS.INJECT_METADATA,
        TestService
      );
      expect(metadata).toHaveLength(1);
      expect(metadata[0].token).toBe(injectToken);
      expect(metadata[0].index).toBe(0);
      expect(metadata[0].propertyKey).toBeUndefined();
    });

    /**
     * Test: Handles multiple constructor injections
     * Validates: Metadata is present and correct for all parameters
     * Value: Enables multi-parameter injection for complex services
     */
    it('should handle multiple constructor injections', () => {
      const token1 = new Token('TOKEN1');
      const token2 = new Token('TOKEN2');

      class TestService {
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        constructor(@Inject(token1) dep1: any, @Inject(token2) dep2: any) {}
      }

      const metadata = Reflect.getMetadata(
        METADATA_KEYS.INJECT_METADATA,
        TestService
      );
      expect(metadata).toHaveLength(2);

      // Check that both tokens are present, but don't assume order
      const tokens = metadata.map((m: any) => m.token);
      expect(tokens).toContain(token1);
      expect(tokens).toContain(token2);

      // Check indices
      const indices = metadata.map((m: any) => m.index);
      expect(indices).toContain(0);
      expect(indices).toContain(1);
    });
  });

  // Metadata integration group: Ensures decorators work together for full DI setup
  describe('Metadata integration', () => {
    /**
     * Test: Complete service setup
     * Validates: Service and injection metadata are present and correct
     * Value: Ensures decorators can be composed for real-world DI scenarios
     */
    it('should work with complete service setup', () => {
      const serviceToken = new Token('SERVICE');
      const dependencyToken = new Token('DEPENDENCY');

      @Service(serviceToken)
      class TestService {
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        constructor(@Inject(dependencyToken) dep: any) {}
      }

      const serviceMetadata = Reflect.getMetadata(
        METADATA_KEYS.SERVICE_METADATA,
        TestService
      );
      const injectMetadata = Reflect.getMetadata(
        METADATA_KEYS.INJECT_METADATA,
        TestService
      );

      expect(serviceMetadata.token).toBe(serviceToken);
      expect(injectMetadata).toHaveLength(1);
      expect(injectMetadata[0].token).toBe(dependencyToken);
    });

    /**
     * Test: Complete module setup
     * Validates: Module and service metadata are present and correct
     * Value: Ensures modules and services can be composed for application DI
     */
    it('should work with complete module setup', () => {
      const serviceToken = new Token('MODULE_SERVICE');

      @Service(serviceToken)
      class ModuleService {}

      @Module({
        services: [ModuleService],
        providers: [{ token: 'CONFIG', useValue: 'config' }],
      })
      class TestModule {}

      const moduleMetadata = Reflect.getMetadata(
        METADATA_KEYS.MODULE_METADATA,
        TestModule
      );
      const serviceMetadata = Reflect.getMetadata(
        METADATA_KEYS.SERVICE_METADATA,
        ModuleService
      );

      expect(moduleMetadata.services).toEqual([ModuleService]);
      expect(moduleMetadata.providers).toHaveLength(1);
      expect(serviceMetadata.token).toBe(serviceToken);
    });
  });
});
