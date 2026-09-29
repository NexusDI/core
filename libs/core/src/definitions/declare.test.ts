import { describe, expect, it } from 'vitest';

import '../../test-support/symbol-metadata.js';
import { declareModuleClass } from './define-module.js';
import { declareClass, declareProperty } from './metadata.js';
import { Nexus } from '../runtime/nexus.js';
import { Token } from './token.js';

class ReactorCore {
  output = 1.21;
}
const NAV = new Token<string>('Nav');

describe('declareClass', () => {
  it('gives a bare class the deps and lifetime it declares', async () => {
    class Drone {
      constructor(readonly reactor: ReactorCore) {}
    }
    const metadata = Object.create(null) as DecoratorMetadataObject;
    declareClass(metadata, { deps: [ReactorCore], lifetime: 'transient' });
    Object.defineProperty(Drone, Symbol.metadata, { value: metadata });
    const Bay = declareModuleClass(class Bay {}, {
      name: 'Bay',
      providers: [ReactorCore, Drone],
    });
    const ship = await Nexus.create(Bay);
    expect(ship.get(Drone).reactor).toBe(ship.get(ReactorCore));
    expect(ship.get(Drone)).not.toBe(ship.get(Drone));
  });
});

describe('declareProperty', () => {
  it('sets the property after the constructor', async () => {
    class Bridge {
      nav?: string;
    }
    const metadata = Object.create(null) as DecoratorMetadataObject;
    declareProperty(metadata, 'nav', NAV);
    Object.defineProperty(Bridge, Symbol.metadata, { value: metadata });
    const { provide } = await import('./provide.js');
    const { defineModule } = await import('./define-module.js');
    const ship = await Nexus.create(
      defineModule({
        name: 'Command',
        providers: [provide(NAV, { useValue: 'sector-7' }), Bridge],
      }),
    );
    expect(ship.get(Bridge).nav).toBe('sector-7');
  });

  it('sets a private field through the access object it is given', async () => {
    class Bridge {
      #nav?: string;
      static readonly access = {
        set: (target: object, value: unknown) => {
          (target as Bridge).#nav = value as string;
        },
      };
      get nav() {
        return this.#nav;
      }
    }
    const metadata = Object.create(null) as DecoratorMetadataObject;
    declareProperty(metadata, '#nav', NAV, Bridge.access);
    Object.defineProperty(Bridge, Symbol.metadata, { value: metadata });
    const { provide } = await import('./provide.js');
    const { defineModule } = await import('./define-module.js');
    const ship = await Nexus.create(
      defineModule({
        name: 'Command',
        providers: [provide(NAV, { useValue: 'sector-7' }), Bridge],
      }),
    );
    expect(ship.get(Bridge).nav).toBe('sector-7');
  });
});

describe('declareModuleClass', () => {
  it('makes a class a ModuleRef', async () => {
    const Engineering = declareModuleClass(class Engineering {}, {
      name: 'Engineering',
      providers: [ReactorCore],
      exports: [ReactorCore],
    });
    const ship = await Nexus.create(Engineering);
    expect(ship.get(ReactorCore)).toBeInstanceOf(ReactorCore);
  });
});
