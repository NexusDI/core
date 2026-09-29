import { describe, expect, it } from 'vitest';

import { Nexus, Token, defineModule, provide } from '@nexusdi/core';

import { devtools, graph } from '../index.js';

describe('R15', () => {
  it('produces identical graphs across two creates', async () => {
    class ReactorCore {}
    const NAME = new Token<string>('Name');
    const Engineering = defineModule({
      name: 'Engineering',
      providers: [ReactorCore, provide(NAME, { useValue: 'Meridian' })],
    });
    const first = await Nexus.create(Engineering, { plugins: [devtools()] });
    const second = await Nexus.create(Engineering, { plugins: [devtools()] });
    expect(graph(first)).toEqual(graph(second));
  });
});
