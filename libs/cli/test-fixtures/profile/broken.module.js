import { Token, defineModule, provide } from '@nexusdi/core';

export const HULL = new Token('Hull');

class BreachedHull {
  constructor() {
    throw new Error('hull breach');
  }
}

export const Broken = defineModule({
  name: 'Broken',
  providers: [provide(HULL, { useClass: BreachedHull })],
});
