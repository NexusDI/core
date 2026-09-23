import { describe, expect, it } from 'vitest';

import { defineModule, registerModuleClass } from './define-module.js';
import { isModuleRef, isToken } from './guards.js';
import { MultiToken, Token } from './token.js';

describe('isToken', () => {
  it('accepts classes, Tokens and MultiTokens', () => {
    expect(isToken(class ReactorCore {})).toBe(true);
    expect(isToken(new Token<string>('Name'))).toBe(true);
    expect(isToken(new MultiToken<string>('Names'))).toBe(true);
  });

  it('rejects symbols, strings, arrow functions and module classes', () => {
    class Command {}
    registerModuleClass(Command, defineModule({ name: 'Command' }));
    expect(isToken(Symbol('x'))).toBe(false);
    expect(isToken('x')).toBe(false);
    expect(isToken(() => 1)).toBe(false);
    expect(isToken(Command)).toBe(false);
  });
});

describe('isModuleRef', () => {
  it('accepts definitions and registered classes only', () => {
    expect(isModuleRef(defineModule({ name: 'Engineering' }))).toBe(true);
    expect(isModuleRef(class NotAModule {})).toBe(false);
  });
});
