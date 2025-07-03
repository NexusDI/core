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

  describe('toSymbol', () => {
    it('should return a symbol representation', () => {
      const token = new Token('TEST_SYMBOL');
      const symbol = token.toSymbol();
      expect(typeof symbol).toBe('symbol');
      expect(symbol.toString()).toBe('Symbol(TEST_SYMBOL)');
    });

    it('should return consistent symbols for the same token instance', () => {
      const token = new Token('CONSISTENT');
      const symbol1 = token.toSymbol();
      const symbol2 = token.toSymbol();
      expect(symbol1).toBe(symbol2);
    });

    it('should return different symbols for different token instances', () => {
      const token1 = new Token('DIFFERENT1');
      const token2 = new Token('DIFFERENT2');
      expect(token1.toSymbol()).not.toBe(token2.toSymbol());
    });

    it('should return different symbols even with same identifier', () => {
      const token1 = new Token('SAME_ID');
      const token2 = new Token('SAME_ID');
      expect(token1.toSymbol()).not.toBe(token2.toSymbol());
    });
  });

  describe('equals', () => {
    it('should return true for the same token instance', () => {
      const token = new Token('EQUALS_TEST');
      expect(token.equals(token)).toBe(true);
    });

    it('should return false for different token instances', () => {
      const token1 = new Token('TOKEN1');
      const token2 = new Token('TOKEN2');
      expect(token1.equals(token2)).toBe(false);
    });

    it('should return false even for tokens with same identifier', () => {
      const token1 = new Token('SAME_IDENTIFIER');
      const token2 = new Token('SAME_IDENTIFIER');
      expect(token1.equals(token2)).toBe(false);
    });

    it('should work with generic types', () => {
      const stringToken = new Token<string>('STRING_TOKEN');
      const numberToken = new Token<number>('NUMBER_TOKEN');
      expect(stringToken.equals(numberToken)).toBe(false);
    });
  });

  describe('static factory methods', () => {
    describe('create', () => {
      it('should create a token with specified identifier', () => {
        const token = Token.create<string>('FACTORY_TOKEN');
        expect(token.toString()).toBe('FACTORY_TOKEN');
      });

      it('should create tokens with proper typing', () => {
        const stringToken = Token.create<string>('STRING_FACTORY');
        const numberToken = Token.create<number>('NUMBER_FACTORY');

        expect(stringToken.toString()).toBe('STRING_FACTORY');
        expect(numberToken.toString()).toBe('NUMBER_FACTORY');
      });

      it('should create different instances even with same identifier', () => {
        const token1 = Token.create<string>('FACTORY_SAME');
        const token2 = Token.create<string>('FACTORY_SAME');

        expect(token1.toString()).toBe(token2.toString());
        expect(token1.equals(token2)).toBe(false);
      });
    });

    describe('createUnique', () => {
      it('should create a token with auto-generated identifier', () => {
        const token = Token.createUnique<string>();
        expect(token.toString()).toMatch(/^__token_\d+__$/);
      });

      it('should create unique tokens each time', () => {
        const token1 = Token.createUnique<string>();
        const token2 = Token.createUnique<string>();

        expect(token1.toString()).not.toBe(token2.toString());
        expect(token1.equals(token2)).toBe(false);
      });

      it('should work with different generic types', () => {
        const stringToken = Token.createUnique<string>();
        const numberToken = Token.createUnique<number>();
        const objectToken = Token.createUnique<{ id: number }>();

        expect(stringToken.toString()).toMatch(/^__token_\d+__$/);
        expect(numberToken.toString()).toMatch(/^__token_\d+__$/);
        expect(objectToken.toString()).toMatch(/^__token_\d+__$/);

        expect(stringToken.equals(numberToken)).toBe(false);
        expect(numberToken.equals(objectToken)).toBe(false);
      });
    });
  });

  describe('real-world usage patterns', () => {
    it('should work for service tokens with typed interfaces', () => {
      interface IUserService {
        getUser(id: string): Promise<any>;
      }

      const USER_SERVICE_TOKEN = new Token<IUserService>('UserService');
      expect(USER_SERVICE_TOKEN.toString()).toBe('UserService');
    });

    it('should work for configuration tokens', () => {
      interface DatabaseConfig {
        host: string;
        port: number;
        database: string;
      }

      const DB_CONFIG_TOKEN = Token.create<DatabaseConfig>('DatabaseConfig');
      expect(DB_CONFIG_TOKEN.toString()).toBe('DatabaseConfig');
    });

    it('should work for feature flag tokens', () => {
      const FEATURE_FLAGS_TOKEN = Token.createUnique<Record<string, boolean>>();
      expect(FEATURE_FLAGS_TOKEN.toString()).toMatch(/^__token_\d+__$/);
    });

    it('should work as dependency injection keys', () => {
      const LOGGER_TOKEN = new Token<{ log: (msg: string) => void }>('Logger');
      const CACHE_TOKEN = new Token<{ get: (key: string) => any }>('Cache');

      const tokenMap = new Map();
      tokenMap.set(LOGGER_TOKEN, { log: () => {} });
      tokenMap.set(CACHE_TOKEN, { get: () => null });

      expect(tokenMap.has(LOGGER_TOKEN)).toBe(true);
      expect(tokenMap.has(CACHE_TOKEN)).toBe(true);
      expect(tokenMap.size).toBe(2);
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
