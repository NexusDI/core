import { test as base } from 'vitest';

import { defineModule, provide, Token } from '@nexusdi/core';

import { nexusFixtures } from '../../index.js';

interface IReactorCore {
  scram(): void;
}
const REACTOR = new Token<IReactorCore>('Reactor');

class FailingReactor implements IReactorCore {
  scram() {}
  [Symbol.asyncDispose]() {
    return Promise.reject(new Error('scram failed'));
  }
}
class FusionReactor implements IReactorCore {
  scram() {}
}

const failing = defineModule({
  name: 'Engineering',
  providers: [provide(REACTOR, { useClass: FailingReactor })],
  exports: [REACTOR],
});
const clean = defineModule({
  name: 'Engineering',
  providers: [provide(REACTOR, { useClass: FusionReactor })],
  exports: [REACTOR],
});

base.extend(nexusFixtures(failing))(
  'passes and still fails on disposal',
  ({ nexus }) => {
    nexus.get(REACTOR).scram();
  },
);
base.extend(nexusFixtures(clean))(
  'passes with a clean container',
  ({ nexus }) => {
    nexus.get(REACTOR).scram();
  },
);
