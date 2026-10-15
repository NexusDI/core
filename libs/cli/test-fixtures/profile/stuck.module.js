import { Token, defineModule, provide } from '@nexusdi/core';

export const AIRLOCK = new Token('Airlock');

// Its disposal never settles, as a pool that waits on a socket forever.
class JammedAirlock {
  [Symbol.asyncDispose]() {
    return new Promise(() => undefined);
  }
}

export const Stuck = defineModule({
  name: 'Stuck',
  providers: [provide(AIRLOCK, { useClass: JammedAirlock })],
});
