// The binding and the test replacement the comparison pages show: an
// interface, an InjectionToken typed with it, an @injectable() class that
// injects the token, and a test provider list built with defineProviders().
// Docs: https://needle-di.io ("Tokens", "Defining providers upfront")
// (1.2.1), read 2026-09-30.
import {
  Container,
  InjectionToken,
  defineProviders,
  inject,
  injectable,
} from '@needle-di/core';

interface IReactorCore {
  readonly kind: string;
}
interface IShipComputer {
  readonly kind: string;
  readonly reactor: IReactorCore;
}
const REACTOR = new InjectionToken<IReactorCore>('ReactorCore');
const COMPUTER = new InjectionToken<IShipComputer>('ShipComputer');

class FusionReactor implements IReactorCore {
  readonly kind = 'ReactorCore';
}
class FakeReactor implements IReactorCore {
  readonly kind = 'FakeReactor';
}
@injectable()
class QuantumComputer implements IShipComputer {
  readonly kind = 'ShipComputer';
  readonly reactor = inject(REACTOR);
}

const engineering = defineProviders(
  { provide: REACTOR, useClass: FusionReactor },
  { provide: COMPUTER, useClass: QuantumComputer },
);

export async function resolveComputer() {
  return new Container().bindAll(engineering).get(COMPUTER);
}

export async function resolveComputerWithFake() {
  const test = defineProviders(engineering, [
    { provide: REACTOR, useClass: FakeReactor },
  ]);
  return new Container().bindAll(test).get(COMPUTER);
}
