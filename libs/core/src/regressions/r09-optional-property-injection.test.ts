import { describe, expect, it } from 'vitest';

import { Inject, Module, Nexus, Token, optional, provide } from '../index.js';

describe('R09', () => {
  it('injects every property when an earlier optional property has no provider', async () => {
    const MISSING = new Token<string>('Missing');
    const PRESENT = new Token<string>('Present');
    class Console {
      @Inject(optional(MISSING)) accessor first!: string | undefined;
      @Inject(PRESENT) accessor second!: string;
    }
    @Module({ providers: [Console, provide(PRESENT, { useValue: 'present' })] })
    class Helm {}

    const helmConsole = (await Nexus.create(Helm)).get(Console);

    expect(helmConsole.first).toBeUndefined();
    expect(helmConsole.second).toBe('present');
  });
});
