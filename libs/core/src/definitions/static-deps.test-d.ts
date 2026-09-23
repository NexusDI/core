import { describe, it } from 'vitest';

import { defineModule } from './define-module.js';
import { provide } from './provide.js';
import { Token } from './token.js';

interface IReactorCore {
  readonly output: number;
}
interface INavCharts {
  plot(to: string): string;
}
const REACTOR = new Token<IReactorCore>('ReactorCore');
const NAV_CHARTS = new Token<INavCharts>('NavCharts');

class ShipComputer {
  static deps = [REACTOR, NAV_CHARTS] as const;
  constructor(
    readonly reactor: IReactorCore,
    readonly charts: INavCharts,
  ) {}
}
class BackupComputer extends ShipComputer {}
class Swapped {
  static deps = [NAV_CHARTS, REACTOR] as const;
  constructor(
    readonly reactor: IReactorCore,
    readonly charts: INavCharts,
  ) {}
}
class ChartReader extends ShipComputer {
  constructor(readonly only: INavCharts) {
    super({ output: 0 }, only);
  }
}
class Undeclared {
  constructor(readonly reactor: IReactorCore) {}
}

describe('defineModule', () => {
  it('accepts a class whose static deps fit its constructor, in every class form', () => {
    defineModule({
      name: 'Engineering',
      providers: [
        ShipComputer,
        BackupComputer,
        { token: ShipComputer, lifetime: 'scoped' },
        provide(ShipComputer),
        provide(ShipComputer, { lifetime: 'transient' }),
        { token: ShipComputer, deps: [REACTOR, NAV_CHARTS] },
      ],
    });
  });

  it('puts a static deps error on the class', () => {
    defineModule({
      name: 'Swapped',
      providers: [
        // @ts-expect-error static deps lists NavCharts where an IReactorCore goes
        Swapped,
      ],
    });
  });

  it('checks an inherited static deps against the subclass constructor', () => {
    defineModule({
      name: 'Inherited',
      providers: [
        // @ts-expect-error ChartReader inherits two deps and takes one parameter
        ChartReader,
      ],
    });
  });
});

describe('provide', () => {
  it('makes the deps option optional only for a class that declares static deps', () => {
    provide(ShipComputer);
    provide(ShipComputer, { deps: [REACTOR, NAV_CHARTS] });
    // @ts-expect-error Undeclared takes an IReactorCore and declares no deps
    provide(Undeclared);
  });

  it('checks static deps through useClass and leaves undeclared deps to the compiler', () => {
    interface IComputer {
      readonly reactor: IReactorCore;
    }
    const COMPUTER = new Token<IComputer>('Computer');
    provide(COMPUTER, { useClass: ShipComputer });
    provide(COMPUTER, { useClass: Undeclared });
    provide(COMPUTER, { useClass: Undeclared, deps: [REACTOR] });
    // @ts-expect-error Swapped's static deps do not fit its constructor
    provide(COMPUTER, { useClass: Swapped });
    // @ts-expect-error an explicit deps entry is still checked
    provide(COMPUTER, { useClass: Undeclared, deps: [NAV_CHARTS] });
    defineModule({
      name: 'Bound',
      providers: [
        { token: COMPUTER, useClass: Undeclared },
        // @ts-expect-error Swapped's static deps do not fit its constructor
        { token: COMPUTER, useClass: Swapped },
      ],
    });
  });
});
