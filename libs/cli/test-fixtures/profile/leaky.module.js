import { Token, defineModule, provide } from '@nexusdi/core';

export const COOLANT = new Token('Coolant');

class CoolantLoop {
  [Symbol.dispose]() {
    throw new Error('seal failed');
  }
}

export const Leaky = defineModule({
  name: 'Leaky',
  providers: [provide(COOLANT, { useClass: CoolantLoop })],
});
