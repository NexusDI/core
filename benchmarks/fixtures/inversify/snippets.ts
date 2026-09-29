// The binding and the test replacement the comparison pages show: an
// interface, a ServiceIdentifier typed with it, @injectable() classes bound
// with bind().to(), and container.rebind() for the replacement.
// Docs: https://inversify.io/docs/introduction/getting-started/ and
// https://inversify.io/docs/api/container/ (rebind) (8.2.3), read 2026-09-30.
import {
  Container,
  inject,
  injectable,
  type ServiceIdentifier,
} from 'inversify';

interface IReactorCore {
  readonly kind: string;
}
interface IShipComputer {
  readonly kind: string;
  readonly reactor: IReactorCore;
}
const REACTOR: ServiceIdentifier<IReactorCore> = Symbol.for('ReactorCore');
const COMPUTER: ServiceIdentifier<IShipComputer> = Symbol.for('ShipComputer');

@injectable()
class FusionReactor implements IReactorCore {
  readonly kind = 'ReactorCore';
}
@injectable()
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

function engineering(): Container {
  const container = new Container();
  container.bind(REACTOR).to(FusionReactor).inSingletonScope();
  container.bind(COMPUTER).to(QuantumComputer).inSingletonScope();
  return container;
}

export async function resolveComputer() {
  return engineering().get(COMPUTER);
}

export async function resolveComputerWithFake() {
  const container = engineering();
  container.rebind(REACTOR).to(FakeReactor).inSingletonScope();
  return container.get(COMPUTER);
}
