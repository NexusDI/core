import { describe, it, expect } from 'vitest';
import { Inject } from './inject';
import { Token } from '../token';
import { getMetadata } from '../helpers';
import { METADATA_KEYS } from '../constants';

describe('@Inject', () => {
  it('should add injection metadata for constructor parameter', () => {
    const INJECT_TOKEN = new Token('INJECT');
    class TestService {
      constructor(@Inject(INJECT_TOKEN) dependency: any) {}
    }
    const metadata = getMetadata(TestService, METADATA_KEYS.INJECT_METADATA);
    expect(metadata).toHaveLength(1);
    expect(metadata[0].token).toBe(INJECT_TOKEN);
    expect(metadata[0].index).toBe(0);
    expect(metadata[0].propertyKey).toBeUndefined();
  });

  it('should handle multiple constructor injections', () => {
    const TOKEN_ONE = new Token('TOKEN1');
    const TOKEN_TWO = new Token('TOKEN2');
    class TestService {
      constructor(@Inject(TOKEN_ONE) dep1: any, @Inject(TOKEN_TWO) dep2: any) {}
    }
    const metadata = getMetadata(TestService, METADATA_KEYS.INJECT_METADATA);
    expect(metadata).toHaveLength(2);
    const tokens = metadata.map((m: any) => m.token);
    expect(tokens).toContain(TOKEN_ONE);
    expect(tokens).toContain(TOKEN_TWO);
    const indices = metadata.map((m: any) => m.index);
    expect(indices).toContain(0);
    expect(indices).toContain(1);
  });
});
