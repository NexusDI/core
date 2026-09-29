// The binding and the test replacement the comparison pages show: an
// interface, a Token typed with it, a class bound with provide(), and one
// override() line from @nexusdi/testing.
// Docs: https://github.com/NexusDI/core#readme at this commit, read 2026-09-30.
import { Nexus, Token, defineModule, provide } from '@nexusdi/core';
import { createTestingContainer } from '@nexusdi/testing';

interface IReactorCore {
  readonly kind: string;
}
interface IShipComputer {
  readonly kind: string;
  readonly reactor: IReactorCore;
}
const REACTOR = new Token<IReactorCore>('ReactorCore');
const COMPUTER = new Token<IShipComputer>('ShipComputer');

class FusionReactor implements IReactorCore {
  readonly kind = 'ReactorCore';
}
class FakeReactor implements IReactorCore {
  readonly kind = 'FakeReactor';
}
class QuantumComputer implements IShipComputer {
  static deps = [REACTOR] as const;
  readonly kind = 'ShipComputer';
  readonly reactor: IReactorCore;
  constructor(reactor: IReactorCore) {
    this.reactor = reactor;
  }
}

const Engineering = defineModule({
  name: 'Engineering',
  providers: [
    provide(REACTOR, { useClass: FusionReactor }),
    provide(COMPUTER, { useClass: QuantumComputer }),
  ],
  exports: [COMPUTER],
});

export async function resolveComputer() {
  const ship = await Nexus.create(Engineering);
  return ship.get(COMPUTER);
}

export async function resolveComputerWithFake() {
  const ship = await createTestingContainer(Engineering)
    .override(REACTOR, { useClass: FakeReactor })
    .create();
  return ship.get(COMPUTER);
}
