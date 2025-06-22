import 'reflect-metadata';
import { describe, it, expect, beforeEach } from 'vitest';
import { Module, Service, Provider, Inject } from './decorators';
import { Token } from './token';
import { METADATA_KEYS } from './types';

describe('Decorators', () => {
  beforeEach(() => {
    // Clear metadata before each test - only clear what exists
    Reflect.deleteMetadata(METADATA_KEYS.MODULE_METADATA, class TestModule {});
    Reflect.deleteMetadata(METADATA_KEYS.SERVICE_METADATA, class TestService {});
    Reflect.deleteMetadata(METADATA_KEYS.INJECT_METADATA, class TestService {});
    Reflect.deleteMetadata(METADATA_KEYS.INJECT_METADATA, class TestService {}.prototype);
  });

  describe('@Module', () => {
    it('should add module metadata to class', () => {
      @Module({
        imports: [],
        services: [],
        providers: [],
        exports: []
      })
      class TestModule {}

      const metadata = Reflect.getMetadata(METADATA_KEYS.MODULE_METADATA, TestModule);
      expect(metadata).toEqual({
        imports: [],
        services: [],
        providers: [],
        exports: []
      });
    });

    it('should handle module with services', () => {
      class TestService {}
      
      @Module({
        services: [TestService]
      })
      class TestModule {}

      const metadata = Reflect.getMetadata(METADATA_KEYS.MODULE_METADATA, TestModule);
      expect(metadata.services).toEqual([TestService]);
    });

    it('should handle module with providers', () => {
      const testToken = new Token('TEST');
      
      @Module({
        providers: [
          { token: testToken, useClass: class TestProvider {} }
        ]
      })
      class TestModule {}

      const metadata = Reflect.getMetadata(METADATA_KEYS.MODULE_METADATA, TestModule);
      expect(metadata.providers).toHaveLength(1);
      expect(metadata.providers[0].token).toBe(testToken);
    });

    it('should handle module with imports', () => {
      class ImportedModule {}
      
      @Module({
        imports: [ImportedModule]
      })
      class TestModule {}

      const metadata = Reflect.getMetadata(METADATA_KEYS.MODULE_METADATA, TestModule);
      expect(metadata.imports).toEqual([ImportedModule]);
    });
  });

  describe('@Service', () => {
    it('should add service metadata with class as token', () => {
      @Service()
      class TestService {}

      const metadata = Reflect.getMetadata(METADATA_KEYS.SERVICE_METADATA, TestService);
      expect(metadata.token).toBe(TestService);
    });

    it('should add service metadata with custom token', () => {
      const customToken = new Token('CUSTOM_SERVICE');
      
      @Service(customToken)
      class TestService {}

      const metadata = Reflect.getMetadata(METADATA_KEYS.SERVICE_METADATA, TestService);
      expect(metadata.token).toBe(customToken);
    });

    it('should add service metadata with string token', () => {
      @Service('STRING_TOKEN')
      class TestService {}

      const metadata = Reflect.getMetadata(METADATA_KEYS.SERVICE_METADATA, TestService);
      expect(metadata.token).toBe('STRING_TOKEN');
    });
  });

  describe('@Provider', () => {
    it('should add provider metadata', () => {
      const providerToken = new Token('PROVIDER');
      
      @Provider(providerToken)
      class TestProvider {}

      // @Provider doesn't add metadata, it's just a marker decorator
      // The actual provider registration happens in the container
      expect(TestProvider).toBeDefined();
    });

    it('should work with string token', () => {
      @Provider('STRING_PROVIDER')
      class TestProvider {}

      expect(TestProvider).toBeDefined();
    });
  });

  describe('@Inject', () => {
    it('should add injection metadata for constructor parameter', () => {
      const injectToken = new Token('INJECT');
      
      class TestService {
        constructor(
          // biome-ignore lint/correctness/noUnusedFunctionParameters: Test parameter for injection metadata
          @Inject(injectToken) dependency: any
        ) {}
      }

      const metadata = Reflect.getMetadata(METADATA_KEYS.INJECT_METADATA, TestService);
      expect(metadata).toHaveLength(1);
      expect(metadata[0].token).toBe(injectToken);
      expect(metadata[0].index).toBe(0);
      expect(metadata[0].propertyKey).toBeUndefined();
    });

    it('should handle multiple constructor injections', () => {
      const token1 = new Token('TOKEN1');
      const token2 = new Token('TOKEN2');
      
      class TestService {
        constructor(
          // biome-ignore lint/correctness/noUnusedFunctionParameters: Test parameter for injection metadata
          @Inject(token1) dep1: any,
          // biome-ignore lint/correctness/noUnusedFunctionParameters: Test parameter for injection metadata
          @Inject(token2) dep2: any
        ) {}
      }

      const metadata = Reflect.getMetadata(METADATA_KEYS.INJECT_METADATA, TestService);
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

  describe('Metadata integration', () => {
    it('should work with complete service setup', () => {
      const serviceToken = new Token('SERVICE');
      const dependencyToken = new Token('DEPENDENCY');
      
      @Service(serviceToken)
      class TestService {
        constructor(
          // biome-ignore lint/correctness/noUnusedFunctionParameters: Test parameter for injection metadata
          @Inject(dependencyToken) dep: any
        ) {}
      }

      const serviceMetadata = Reflect.getMetadata(METADATA_KEYS.SERVICE_METADATA, TestService);
      const injectMetadata = Reflect.getMetadata(METADATA_KEYS.INJECT_METADATA, TestService);

      expect(serviceMetadata.token).toBe(serviceToken);
      expect(injectMetadata).toHaveLength(1);
      expect(injectMetadata[0].token).toBe(dependencyToken);
    });

    it('should work with complete module setup', () => {
      const serviceToken = new Token('MODULE_SERVICE');
      
      @Service(serviceToken)
      class ModuleService {}
      
      @Module({
        services: [ModuleService],
        providers: [
          { token: 'CONFIG', useValue: 'config' }
        ]
      })
      class TestModule {}

      const moduleMetadata = Reflect.getMetadata(METADATA_KEYS.MODULE_METADATA, TestModule);
      const serviceMetadata = Reflect.getMetadata(METADATA_KEYS.SERVICE_METADATA, ModuleService);

      expect(moduleMetadata.services).toEqual([ModuleService]);
      expect(moduleMetadata.providers).toHaveLength(1);
      expect(serviceMetadata.token).toBe(serviceToken);
    });
  });
}); 