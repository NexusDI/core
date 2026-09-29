// The binding and the test replacement the comparison pages show: an
// interface, a string token, an @injectable() class that names the token
// with @inject(), and a child container that registers the fake.
// Docs: https://github.com/microsoft/tsyringe#readme ("inject()",
// "Class Provider", "Child Containers") (4.10.0), read 2026-09-30.
import 'reflect-metadata';
import { container, inject, injectable } from 'tsyringe';

interface IReactorCore {
  readonly kind: string;
}
interface IShipComputer {
  readonly kind: string;
  readonly reactor: IReactorCore;
}
const REACTOR = 'ReactorCore';
const COMPUTER = 'ShipComputer';

class FusionReactor implements IReactorCore {
  readonly kind = 'ReactorCore';
}
class FakeReactor implements IReactorCore {
  readonly kind = 'FakeReactor';
}
@injectable()
class QuantumComputer implements IShipComputer {
  readonly kind = 'ShipComputer';
  readonly reactor: IReactorCore;
  constructor(@inject(REACTOR) reactor: IReactorCore) {
    this.reactor = reactor;
  }
}

container.register<IReactorCore>(REACTOR, { useClass: FusionReactor });
container.register<IShipComputer>(COMPUTER, { useClass: QuantumComputer });

export async function resolveComputer() {
  return container.resolve<IShipComputer>(COMPUTER);
}

export async function resolveComputerWithFake() {
  const test = container.createChildContainer();
  test.register<IReactorCore>(REACTOR, { useClass: FakeReactor });
  return test.resolve<IShipComputer>(COMPUTER);
}
