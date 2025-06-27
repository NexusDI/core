import { describe, it, expect } from 'vitest';
import { Token } from './token';
import {
  type TokenType,
  type ModuleProvider,
  type ModuleConfig,
  type InjectionMetadata,
  type ProviderConfig,
} from './types';
import { METADATA_KEYS } from './constants';

describe('Types', () => {
  // TokenType group: Ensures all supported token types are accepted and behave as expected
  describe('TokenType', () => {
    /**
     * Test: Accepts Token instances as TokenType
     * Validates: Type compatibility and value equality
     * Value: Ensures DI can use Token objects as unique keys
     */
    it('should accept Token instances', () => {
      const token = new Token('TEST');
      const tokenType: TokenType = token;
      expect(tokenType).toBe(token);
    });

    /**
     * Test: Accepts symbol tokens as TokenType
     * Validates: Type compatibility and value equality
     * Value: Allows use of symbols for globally unique DI tokens
     */
    it('should accept symbol tokens', () => {
      const symbol = Symbol('SYMBOL_TOKEN');
      const tokenType: TokenType = symbol;
      expect(tokenType).toBe(symbol);
    });

    /**
     * Test: Accepts class constructors as TokenType
     * Validates: Type compatibility and value equality
     * Value: Enables class-based DI registration and lookup
     */
    it('should accept class constructors', () => {
      class TestClass {}
      const tokenType: TokenType = TestClass;
      expect(tokenType).toBe(TestClass);
    });
  });

  // ProviderConfig group: Ensures provider configuration is flexible and robust
  describe('ProviderConfig', () => {
    /**
     * Test: ProviderConfig with token
     * Validates: Structure and values
     * Value: Ensures DI can register providers with explicit tokens and singleton flag
     */
    it('should define provider config with token', () => {
      const token = new Token('PROVIDER_TOKEN');
      const config: { token: TokenType; singleton: boolean } = {
        token,
        singleton: true,
      };
      expect(config.token).toBe(token);
      expect(config.singleton).toBe(true);
    });

    /**
     * Test: ProviderConfig without token
     * Validates: Structure and default values
     * Value: Allows for simple singleton/non-singleton provider registration
     */
    it('should define provider config without token', () => {
      const config: ProviderConfig = {
        singleton: false,
      };

      expect(config.token).toBeUndefined();
      expect(config.singleton).toBe(false);
    });
  });

  // ModuleConfig group: Ensures module configuration is flexible and robust
  describe('ModuleConfig', () => {
    /**
     * Test: ModuleConfig with all properties
     * Validates: Structure and values for imports, services, providers, exports
     * Value: Ensures modules can be fully described for DI and orchestration
     */
    it('should define module config with all properties', () => {
      class TestService {}
      class TestModule {}
      const token = new Token('PROVIDER_TOKEN');
      const config: {
        imports: any[];
        providers: { token: TokenType; useClass: typeof TestService }[];
        exports: TokenType[];
      } = {
        imports: [TestModule],
        providers: [{ token, useClass: TestService }],
        exports: [token as unknown as TokenType],
      };
      expect(config.imports).toEqual([TestModule]);
      expect(config.providers).toHaveLength(1);
      expect(config.exports).toEqual([token as unknown as TokenType]);
    });

    /**
     * Test: ModuleConfig with minimal properties
     * Validates: Structure and default values
     * Value: Allows for minimal module registration and testing of optional fields
     */
    it('should define module config with minimal properties', () => {
      const config: ModuleConfig = {};

      expect(config.imports).toBeUndefined();
      expect(config.providers).toBeUndefined();
      expect(config.exports).toBeUndefined();
    });
  });

  // METADATA_KEYS group: Ensures all required metadata keys are present
  describe('METADATA_KEYS', () => {
    /**
     * Test: All required metadata keys exist
     * Validates: String values for all keys
     * Value: Ensures decorators and reflection work as expected for DI
     */
    it('should have all required metadata keys', () => {
      expect(METADATA_KEYS.DESIGN_PARAMTYPES).toBe('design:paramtypes');
      expect(METADATA_KEYS.DESIGN_TYPE).toBe('design:type');
      expect(METADATA_KEYS.INJECT_METADATA).toBe('nexusdi:inject');
      expect(METADATA_KEYS.SERVICE_METADATA).toBe('nexusdi:service');
      expect(METADATA_KEYS.MODULE_METADATA).toBe('nexusdi:module');
    });
  });

  // InjectionMetadata group: Ensures injection metadata is structured and flexible
  describe('InjectionMetadata', () => {
    /**
     * Test: Injection metadata for constructor parameter
     * Validates: Structure and default propertyKey
     * Value: Ensures DI can track parameter injection points
     */
    it('should define injection metadata for constructor parameter', () => {
      const token = new Token('INJECT_TOKEN');
      const metadata: InjectionMetadata = {
        token: token as unknown as TokenType,
        index: 0,
      };
      expect(metadata.token).toBe(token);
      expect(metadata.index).toBe(0);
      expect(metadata.propertyKey).toBeUndefined();
    });

    /**
     * Test: Injection metadata for property
     * Validates: Structure and propertyKey value
     * Value: Ensures DI can track property injection points
     */
    it('should define injection metadata for property', () => {
      const token = new Token('PROPERTY_TOKEN');
      const metadata: InjectionMetadata = {
        token: token as unknown as TokenType,
        index: 0,
        propertyKey: 'testProperty',
      };
      expect(metadata.token).toBe(token);
      expect(metadata.index).toBe(0);
      expect(metadata.propertyKey).toBe('testProperty');
    });

    /**
     * Test: Injection metadata with symbol propertyKey
     * Validates: Structure and symbol propertyKey
     * Value: Ensures DI can track symbol-named property injection points
     */
    it('should define injection metadata with symbol property key', () => {
      const token = new Token('SYMBOL_PROPERTY');
      const symbol = Symbol('symbolProperty');
      const metadata: InjectionMetadata = {
        token: token as unknown as TokenType,
        index: 1,
        propertyKey: symbol,
      };
      expect(metadata.token).toBe(token);
      expect(metadata.index).toBe(1);
      expect(metadata.propertyKey).toBe(symbol);
    });
  });

  // Type compatibility group: Ensures types are compatible for advanced DI scenarios
  describe('Type compatibility', () => {
    /**
     * Test: Provider registration with TokenType
     * Validates: Structure and values
     * Value: Ensures providers can be registered with typed tokens
     */
    it('should work with provider registration', () => {
      class TestService {}
      const token = new Token<TestService>('TYPED_TOKEN');

      const provider: ModuleProvider<TestService> = {
        token,
        useClass: TestService,
      };

      expect((provider as any).token).toBe(token);
      expect((provider as any).useClass).toBe(TestService);
    });

    /**
     * Test: Provider configuration with TokenType
     * Validates: Structure and values
     * Value: Ensures provider configs can be registered with typed tokens
     */
    it('should work with provider configuration', () => {
      class TestService {}
      const token = new Token<TestService>(
        'PROVIDER_TOKEN'
      ) as unknown as TokenType;

      const config: ProviderConfig<TestService> = {
        token,
        singleton: true,
      };

      expect(config.token).toBe(token);
      expect(config.singleton).toBe(true);
    });
  });
});
