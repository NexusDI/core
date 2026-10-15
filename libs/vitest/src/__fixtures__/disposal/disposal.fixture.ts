import { test as base } from 'vitest';

import { defineModule, provide, Token } from '@nexusdi/core';

import { nexusTest } from '../../index.js';

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

nexusTest(base, failing)('passes and still fails on disposal', ({ nexus }) => {
  nexus.get(REACTOR).scram();
});
nexusTest(base, clean)('passes with a clean container', ({ nexus }) => {
  nexus.get(REACTOR).scram();
});
