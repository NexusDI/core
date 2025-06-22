import { describe, it, expect } from 'vitest';
import { Token } from './token';
import { type TokenType, type Provider, type ServiceConfig, type ModuleConfig, METADATA_KEYS, type InjectionMetadata } from './types';

describe('Types', () => {
  describe('TokenType', () => {
    it('should accept Token instances', () => {
      const token = new Token('TEST');
      const tokenType: TokenType = token;
      expect(tokenType).toBe(token);
    });

    it('should accept string tokens', () => {
      const tokenType: TokenType = 'STRING_TOKEN';
      expect(tokenType).toBe('STRING_TOKEN');
    });

    it('should accept symbol tokens', () => {
      const symbol = Symbol('SYMBOL_TOKEN');
      const tokenType: TokenType = symbol;
      expect(tokenType).toBe(symbol);
    });

    it('should accept class constructors', () => {
      class TestClass {}
      const tokenType: TokenType = TestClass;
      expect(tokenType).toBe(TestClass);
    });
  });

  describe('Provider', () => {
    it('should define a provider with useClass', () => {
      class TestService {}
      const provider: Provider = {
        token: 'TEST_TOKEN',
        useClass: TestService
      };

      expect(provider.token).toBe('TEST_TOKEN');
      expect(provider.useClass).toBe(TestService);
    });

    it('should define a provider with useValue', () => {
      const provider: Provider = {
        token: new Token('VALUE_TOKEN'),
        useValue: 'test value'
      };

      expect(provider.token).toBeInstanceOf(Token);
      expect(provider.useValue).toBe('test value');
    });

    it('should define a provider with useFactory', () => {
      const factory = () => 'factory result';
      const provider: Provider = {
        token: 'FACTORY_TOKEN',
        useFactory: factory,
        deps: ['DEP1', 'DEP2']
      };

      expect(provider.token).toBe('FACTORY_TOKEN');
      expect(provider.useFactory).toBe(factory);
      expect(provider.deps).toEqual(['DEP1', 'DEP2']);
    });
  });

  describe('ServiceConfig', () => {
    it('should define service config with token', () => {
      const token = new Token('SERVICE_TOKEN');
      const config: ServiceConfig = {
        token,
        singleton: true
      };

      expect(config.token).toBe(token);
      expect(config.singleton).toBe(true);
    });

    it('should define service config without token', () => {
      const config: ServiceConfig = {
        singleton: false
      };

      expect(config.token).toBeUndefined();
      expect(config.singleton).toBe(false);
    });
  });

  describe('ModuleConfig', () => {
    it('should define module config with all properties', () => {
      class TestService {}
      class TestModule {}
      const token = new Token('PROVIDER_TOKEN');

      const config: ModuleConfig = {
        imports: [TestModule],
        services: [TestService],
        providers: [
          { token, useClass: TestService }
        ],
        exports: [token]
      };

      expect(config.imports).toEqual([TestModule]);
      expect(config.services).toEqual([TestService]);
      expect(config.providers).toHaveLength(1);
      expect(config.exports).toEqual([token]);
    });

    it('should define module config with minimal properties', () => {
      const config: ModuleConfig = {};

      expect(config.imports).toBeUndefined();
      expect(config.services).toBeUndefined();
      expect(config.providers).toBeUndefined();
      expect(config.exports).toBeUndefined();
    });
  });

  describe('METADATA_KEYS', () => {
    it('should have all required metadata keys', () => {
      expect(METADATA_KEYS.DESIGN_PARAMTYPES).toBe('design:paramtypes');
      expect(METADATA_KEYS.DESIGN_TYPE).toBe('design:type');
      expect(METADATA_KEYS.INJECT_METADATA).toBe('nexusdi:inject');
      expect(METADATA_KEYS.SERVICE_METADATA).toBe('nexusdi:service');
      expect(METADATA_KEYS.MODULE_METADATA).toBe('nexusdi:module');
    });
  });

  describe('InjectionMetadata', () => {
    it('should define injection metadata for constructor parameter', () => {
      const token = new Token('INJECT_TOKEN');
      const metadata: InjectionMetadata = {
        token,
        index: 0
      };

      expect(metadata.token).toBe(token);
      expect(metadata.index).toBe(0);
      expect(metadata.propertyKey).toBeUndefined();
    });

    it('should define injection metadata for property', () => {
      const token = new Token('PROPERTY_TOKEN');
      const metadata: InjectionMetadata = {
        token,
        index: 0,
        propertyKey: 'testProperty'
      };

      expect(metadata.token).toBe(token);
      expect(metadata.index).toBe(0);
      expect(metadata.propertyKey).toBe('testProperty');
    });

    it('should define injection metadata with symbol property key', () => {
      const token = new Token('SYMBOL_PROPERTY');
      const symbol = Symbol('symbolProperty');
      const metadata: InjectionMetadata = {
        token,
        index: 1,
        propertyKey: symbol
      };

      expect(metadata.token).toBe(token);
      expect(metadata.index).toBe(1);
      expect(metadata.propertyKey).toBe(symbol);
    });
  });

  describe('Type compatibility', () => {
    it('should be compatible with Token class', () => {
      const token = new Token('COMPATIBILITY_TEST');
      const tokenType: TokenType = token;
      
      expect(tokenType).toBeInstanceOf(Token);
      expect(tokenType.toString()).toBe('COMPATIBILITY_TEST');
    });

    it('should work with provider registration', () => {
      class TestService {}
      const token = new Token<TestService>('TYPED_TOKEN');
      
      const provider: Provider<TestService> = {
        token,
        useClass: TestService
      };

      expect(provider.token).toBe(token);
      expect(provider.useClass).toBe(TestService);
    });

    it('should work with service configuration', () => {
      class TestService {}
      const token = new Token<TestService>('SERVICE_TOKEN');
      
      const config: ServiceConfig<TestService> = {
        token,
        singleton: true
      };

      expect(config.token).toBe(token);
      expect(config.singleton).toBe(true);
    });
  });
}); 