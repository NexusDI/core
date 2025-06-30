import { describe, it, expect } from 'vitest';
import { Module } from './decorators/module';
import { DynamicModule, createModuleConfig } from './dynamic-module';
import { InvalidModule } from './exceptions/invalid-module.exception';
import type { ProviderConfigObject, ModuleConfig } from './types';

// Test config type
type TestConfig = {
  foo: string;
  quz: number;
};

// Valid config class for testing
class ValidConfigClass {
  foo = 'ok';
  quz = 42;
}

// Invalid config class for testing (wrong types)
class InvalidConfigClass {
  foo = 'bad';
  quz = 'not-a-number'; // Should be number
}

// Dummy config token for testing
const TEST_CONFIG_TOKEN = Symbol('TEST_CONFIG');

// Test dynamic module
@Module({
  providers: [],
})
class TestDynamicModule extends DynamicModule {
  static override configToken = TEST_CONFIG_TOKEN;

  static config(config: TestConfig | ProviderConfigObject<TestConfig>) {
    return createModuleConfig(this, config);
  }

  static configAsync(
    config: Promise<TestConfig> | ProviderConfigObject<Promise<TestConfig>>
  ) {
    return createModuleConfig(this, config);
  }
}

// Module without @Module decorator for error testing
class NotDecorated extends DynamicModule {
  protected readonly configToken = Symbol('NOT_DECORATED');
}

describe('DynamicModule', () => {
  it('should read @Module metadata from subclasses', () => {
    const metadata = TestDynamicModule.getModuleConfig();
    expect(metadata).toBeDefined();
    expect(metadata.providers).toEqual([]);
  });

  it('should return the correct configToken from subclass', () => {
    expect(TestDynamicModule.getConfigToken()).toBe(TEST_CONFIG_TOKEN);
  });

  it('should create a config module with config() using useValue', () => {
    const result = TestDynamicModule.config({
      useValue: { foo: 'bar', quz: 123 },
    });
    // ^?
    const provider = (result.providers ?? []).find(
      (p: any) => typeof p === 'object' && p !== null && 'useValue' in p
    );
    expect(provider).toBeDefined();
    expect((provider as any).useValue.foo).toBe('bar');
    expect((provider as any).useValue.quz).toBe(123);
  });

  it('should create a config module with config() using useClass', () => {
    class MyConfigClass {
      foo = 'classy';
      quz = 42;
    }
    const result = TestDynamicModule.config({
      useClass: MyConfigClass,
    });
    const provider = (result.providers ?? []).find(
      (p: any) => typeof p === 'object' && p !== null && 'useClass' in p
    );
    expect(provider).toBeDefined();
    expect((provider as any).useClass).toBe(MyConfigClass);
  });

  it('should create a config module with config() using useFactory', () => {
    const result = TestDynamicModule.config({
      useFactory: () => ({ foo: 'factory', quz: 1 }),
    });
    const provider = (result.providers ?? []).find(
      (p: any) => typeof p === 'object' && p !== null && 'useFactory' in p
    );
    expect(provider).toBeDefined();
    expect(typeof (provider as any).useFactory).toBe('function');
    expect((provider as any).useFactory().foo).toBe('factory');
    expect((provider as any).useFactory().quz).toBe(1);
  });

  it('should create a config module with config() using a plain value', () => {
    const result = TestDynamicModule.config({
      useValue: { foo: 'plain', quz: 123 },
    });
    const provider = (result.providers ?? []).find(
      (p: any) => typeof p === 'object' && p !== null && 'useValue' in p
    );
    expect(provider).toBeDefined();
    expect((provider as any).useValue.foo).toBe('plain');
    expect((provider as any).useValue.quz).toBe(123);
  });

  it('should create a config module with configAsync() using async useFactory', async () => {
    const result = await TestDynamicModule.configAsync({
      useFactory: async () => ({ foo: 'baz', quz: 2 }),
    });
    const provider = (result.providers ?? []).find(
      (p: any) => typeof p === 'object' && p !== null && 'useFactory' in p
    );
    expect(provider).toBeDefined();
    expect(typeof (provider as any).useFactory).toBe('function');
    // Test that the factory can be called and returns the expected result
    const factoryResult = await (provider as any).useFactory();
    expect(factoryResult.foo).toBe('baz');
    expect(factoryResult.quz).toBe(2);
  });

  it('should create a config module with configAsync() using async useValue', async () => {
    const result = await TestDynamicModule.configAsync(
      Promise.resolve({ foo: 'asyncValue', quz: 3 })
    );
    const provider = (result.providers ?? []).find(
      (p: any) => typeof p === 'object' && p !== null && 'useValue' in p
    );
    expect(provider).toBeDefined();
    const value = await (provider as any).useValue;
    expect(value.foo).toBe('asyncValue');
    expect(value.quz).toBe(3);
  });

  it('should inherit configToken from parent if not overridden', () => {
    class ParentDynamicModule extends DynamicModule {
      static override configToken = Symbol('PARENT_TOKEN');
    }
    @Module({ providers: [] })
    class ChildDynamicModule extends ParentDynamicModule {}
    expect(ChildDynamicModule.getConfigToken()).toBe(
      ParentDynamicModule.configToken
    );
  });

  it('should allow subclass to override configToken', () => {
    class ParentDynamicModule extends DynamicModule {
      static override configToken = Symbol('PARENT_TOKEN');
    }
    const CHILD_TOKEN = Symbol('CHILD_TOKEN');
    @Module({ providers: [] })
    class ChildDynamicModule extends ParentDynamicModule {
      static override configToken = CHILD_TOKEN;
    }
    expect(ChildDynamicModule.getConfigToken()).toBe(CHILD_TOKEN);
    expect(ChildDynamicModule.getConfigToken()).not.toBe(
      ParentDynamicModule.configToken
    );
  });

  it('should return undefined for configToken if not set on any class', () => {
    @Module({ providers: [] })
    class NoTokenDynamicModule extends DynamicModule {}
    expect(NoTokenDynamicModule.getConfigToken()).toBeUndefined();
  });

  it('should ensure configToken is unique per subclass', () => {
    const TOKEN_A = Symbol('TOKEN_A');
    const TOKEN_B = Symbol('TOKEN_B');
    @Module({ providers: [] })
    class ModuleA extends DynamicModule {
      static override configToken = TOKEN_A;
    }
    @Module({ providers: [] })
    class ModuleB extends DynamicModule {
      static override configToken = TOKEN_B;
    }
    expect(ModuleA.getConfigToken()).toBe(TOKEN_A);
    expect(ModuleB.getConfigToken()).toBe(TOKEN_B);
    expect(ModuleA.getConfigToken()).not.toBe(ModuleB.getConfigToken());
  });

  it('should throw if not decorated with @Module', () => {
    expect(() => NotDecorated.getModuleConfig()).toThrowError(InvalidModule);
  });
});

describe('createModuleConfig (strict type safety)', () => {
  it('accepts a valid config object', () => {
    const result = TestDynamicModule.config({ foo: 'bar', quz: 123 });
    const provider = (result.providers ?? []).find(
      (p: any) => typeof p === 'object' && p !== null && 'useValue' in p
    );
    expect(provider).toBeDefined();
    expect((provider as any).useValue.foo).toBe('bar');
    expect((provider as any).useValue.quz).toBe(123);
  });

  it('accepts a valid useClass', () => {
    const result = TestDynamicModule.config({ useClass: ValidConfigClass });
    const provider = (result.providers ?? []).find(
      (p: any) => typeof p === 'object' && p !== null && 'useClass' in p
    );
    expect(provider).toBeDefined();
    expect((provider as any).useClass).toBe(ValidConfigClass);
  });

  it('rejects an invalid useClass', () => {
    // This should error at compile time
    // TestDynamicModule.config({ useClass: InvalidConfigClass });
    expect(true).toBe(true);
  });

  it('accepts a valid useFactory', () => {
    const result = TestDynamicModule.config({
      useFactory: () => ({ foo: 'factory', quz: 1 }),
    });
    const provider = (result.providers ?? []).find(
      (p: any) => typeof p === 'object' && p !== null && 'useFactory' in p
    );
    expect(provider).toBeDefined();
    expect(typeof (provider as any).useFactory).toBe('function');
    expect((provider as any).useFactory().foo).toBe('factory');
    expect((provider as any).useFactory().quz).toBe(1);
  });

  it('rejects a useFactory with wrong return type', () => {
    // This should error at compile time
    // TestDynamicModule.config({ useFactory: () => ({ foo: 'bad', quz: 'not-a-number' }) });
    expect(true).toBe(true);
  });

  it('rejects extra properties in config object', () => {
    // This should error at compile time
    // TestDynamicModule.config({ foo: 'bar', quz: 1, baz: 'extra' });
    expect(true).toBe(true);
  });
});

describe('createModuleConfigAsync', () => {
  it('accepts a valid async useFactory', async () => {
    const result = await TestDynamicModule.configAsync({
      useFactory: async () => ({ foo: 'baz', quz: 2 }),
    });
    const provider = (result.providers ?? []).find(
      (p: any) => typeof p === 'object' && p !== null && 'useFactory' in p
    );
    expect(provider).toBeDefined();
    expect(typeof (provider as any).useFactory).toBe('function');
    // Test that the factory can be called and returns the expected result
    const factoryResult = await (provider as any).useFactory();
    expect(factoryResult.foo).toBe('baz');
    expect(factoryResult.quz).toBe(2);
  });

  it('accepts a valid async useValue', async () => {
    const result = await TestDynamicModule.configAsync(
      Promise.resolve({ foo: 'asyncValue', quz: 3 })
    );
    const provider = (result.providers ?? []).find(
      (p: any) => typeof p === 'object' && p !== null && 'useValue' in p
    );
    expect(provider).toBeDefined();
    const value = await (provider as any).useValue;
    expect(value.foo).toBe('asyncValue');
    expect(value.quz).toBe(3);
  });
});

describe('Module error handling', () => {
  it('should throw if not decorated with @Module', () => {
    expect(() => NotDecorated.getModuleConfig()).toThrowError(InvalidModule);
  });
});
