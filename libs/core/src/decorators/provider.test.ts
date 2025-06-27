import { describe, it, expect } from 'vitest';
import { Provider } from './provider';
import { Token } from '../token';

describe('@Provider', () => {
  it('should add provider metadata', () => {
    const PROVIDER_TOKEN = new Token('PROVIDER');
    @Provider(PROVIDER_TOKEN)
    class TestProvider {}
    expect(TestProvider).toBeDefined();
  });
});
