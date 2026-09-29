// The binding and the test replacement the comparison pages show: an
// interface for each cradle entry, asClass registrations, and a second
// register() call that replaces the reactor before anything resolves it.
// Docs: https://github.com/jeffijoe/awilix#readme ("Usage",
// "container.register()") (13.0.5), read 2026-09-30.
import { InjectionMode, asClass, createContainer } from 'awilix';

interface IReactorCore {
  readonly kind: string;
}
interface IShipComputer {
  readonly kind: string;
  readonly reactor: IReactorCore;
}
interface Cradle {
  reactor: IReactorCore;
  computer: IShipComputer;
}

class FusionReactor implements IReactorCore {
  readonly kind = 'ReactorCore';
}
class FakeReactor implements IReactorCore {
  readonly kind = 'FakeReactor';
}
class QuantumComputer implements IShipComputer {
  readonly kind = 'ShipComputer';
  readonly reactor: IReactorCore;
  constructor({ reactor }: Cradle) {
    this.reactor = reactor;
  }
}

function engineering() {
  const container = createContainer<Cradle>({
    injectionMode: InjectionMode.PROXY,
    strict: true,
  });
  container.register({
    reactor: asClass(FusionReactor).singleton(),
    computer: asClass(QuantumComputer).singleton(),
  });
  return container;
}

export async function resolveComputer() {
  return engineering().resolve('computer');
}

export async function resolveComputerWithFake() {
  const container = engineering();
  container.register({ reactor: asClass(FakeReactor).singleton() });
  return container.resolve('computer');
}
