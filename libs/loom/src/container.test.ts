import { describe, it, expect } from 'vitest';
import { Token, Container } from './index.js';

describe('Container', () => {
  it('should register and resolve a simple value provider', async () => {
    const container = new Container();
    const TEST_TOKEN = new Token<string>('test');

    container.register([TEST_TOKEN, { useValue: 'hello world' }]);

    const result = await container.resolve(TEST_TOKEN);
    expect(result).toBe('hello world');
  });

  it('should register and resolve a factory provider', async () => {
    const container = new Container();
    const TEST_TOKEN = new Token<number>('test');

    container.register([TEST_TOKEN, { useFactory: () => 42 }]);

    const result = await container.resolve(TEST_TOKEN);
    expect(result).toBe(42);
  });

  it('should register and resolve a class provider', async () => {
    const container = new Container();
    const TEST_TOKEN = new Token<TestService>('test');

    class TestService {
      getValue() {
        return 'test service';
      }
    }

    container.register([TEST_TOKEN, TestService]);

    const result = await container.resolve(TEST_TOKEN);
    expect(result).toBeInstanceOf(TestService);
    expect(result.getValue()).toBe('test service');
  });

  it('should handle async factory providers', async () => {
    const container = new Container();
    const TEST_TOKEN = new Token<string>('test');

    container.register([
      TEST_TOKEN,
      {
        useFactory: async () => {
          await new Promise((resolve) => setTimeout(resolve, 10));
          return 'async result';
        },
      },
    ]);

    const result = await container.resolve(TEST_TOKEN);
    expect(result).toBe('async result');
  });

  it('should create reactive streams', async () => {
    const container = new Container();
    const TEST_TOKEN = new Token<string>('test');

    container.register([TEST_TOKEN, { useValue: 'initial' }]);

    const stream = container.stream(TEST_TOKEN);
    let lastValue: string | undefined;

    const unsubscribe = stream.subscribe((value) => {
      lastValue = value;
    });

    // Initial value should be emitted
    await new Promise((resolve) => setTimeout(resolve, 10));
    expect(lastValue).toBe('initial');

    unsubscribe();
  });

  it('should update providers live', async () => {
    const container = new Container();
    const TEST_TOKEN = new Token<string>('test');

    container.register([TEST_TOKEN, { useValue: 'initial' }]);

    const stream = container.stream(TEST_TOKEN);
    const values: string[] = [];

    stream.subscribe((value) => {
      values.push(value);
    });

    // Wait for initial value
    await new Promise((resolve) => setTimeout(resolve, 10));

    // Update the provider
    await container.update(TEST_TOKEN, { useValue: 'updated' });

    // Wait for update
    await new Promise((resolve) => setTimeout(resolve, 10));

    expect(values).toContain('initial');
    expect(values).toContain('updated');
  });

  it('should handle lifecycle methods', async () => {
    const container = new Container();
    const TEST_TOKEN = new Token<TestService>('test');

    let startCalled = false;
    let stopCalled = false;

    class TestService {
      async onStart() {
        startCalled = true;
      }

      async onStop() {
        stopCalled = true;
      }
    }

    container.register([TEST_TOKEN, TestService]);

    await container.onStart();
    await container.resolve(TEST_TOKEN);

    expect(startCalled).toBe(true);

    await container.onStop();
    expect(stopCalled).toBe(true);
  });
});
