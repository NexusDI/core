import { describe, it, expect } from 'vitest';
import { Token } from './token';

describe('Token', () => {
  describe('constructor', () => {
    it('should create a token with a string identifier', () => {
      const token = new Token('TEST_TOKEN');
      expect(token.toString()).toBe('TEST_TOKEN');
    });

    it('should create a token without an identifier', () => {
      const token = new Token();
      expect(token.toString()).toMatch(/^__token_\d+__$/);
    });

    it('should create unique tokens when no identifier is provided', () => {
      const token1 = new Token();
      const token2 = new Token();
      expect(token1.toString()).not.toBe(token2.toString());
    });

    it('should create tokens with the same identifier when provided', () => {
      const token1 = new Token('SAME_TOKEN');
      const token2 = new Token('SAME_TOKEN');
      expect(token1.toString()).toBe(token2.toString());
    });
  });

  describe('toString', () => {
    it('should return the identifier when provided', () => {
      const token = new Token('CUSTOM_IDENTIFIER');
      expect(token.toString()).toBe('CUSTOM_IDENTIFIER');
    });

    it('should return a unique identifier when none provided', () => {
      const token = new Token();
      const result = token.toString();
      expect(result).toMatch(/^__token_\d+__$/);
    });
  });

  describe('equality', () => {
    it('should be equal to itself', () => {
      const token = new Token('TEST');
      expect(token).toBe(token);
    });

    it('should not be equal to different tokens', () => {
      const token1 = new Token('TOKEN1');
      const token2 = new Token('TOKEN2');
      expect(token1).not.toBe(token2);
    });

    it('should not be equal to tokens with same identifier but different instances', () => {
      const token1 = new Token('SAME_ID');
      const token2 = new Token('SAME_ID');
      expect(token1).not.toBe(token2);
    });
  });

  describe('usage as Map key', () => {
    it('should work as a Map key', () => {
      const token = new Token('MAP_KEY');
      const map = new Map();
      map.set(token, 'test value');

      expect(map.has(token)).toBe(true);
      expect(map.get(token)).toBe('test value');
    });

    it('should work with multiple tokens as Map keys', () => {
      const token1 = new Token('KEY1');
      const token2 = new Token('KEY2');
      const map = new Map();

      map.set(token1, 'value1');
      map.set(token2, 'value2');

      expect(map.get(token1)).toBe('value1');
      expect(map.get(token2)).toBe('value2');
    });
  });

  describe('usage as Set value', () => {
    it('should work as a Set value', () => {
      const token = new Token('SET_VALUE');
      const set = new Set();
      set.add(token);

      expect(set.has(token)).toBe(true);
    });

    it('should work with multiple tokens in a Set', () => {
      const token1 = new Token('SET1');
      const token2 = new Token('SET2');
      const set = new Set();

      set.add(token1);
      set.add(token2);

      expect(set.size).toBe(2);
      expect(set.has(token1)).toBe(true);
      expect(set.has(token2)).toBe(true);
    });
  });
});
