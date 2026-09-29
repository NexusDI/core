import { describe, it } from 'vitest';

import { defineModule } from '../definitions/define-module.js';
import { provide } from '../definitions/provide.js';
import { Token } from '../definitions/token.js';
import { Nexus } from './nexus.js';
import type { CheckedRoot, RootConfig, RootRef } from './root.js';

class Logger {
  log(line: string) {
    return line;
  }
}
const NAME = new Token<string>('Name');
class UserService {
  static deps = [NAME] as const;
  constructor(readonly logger: Logger) {}
}
const Engineering = defineModule({
  name: 'Engineering',
  providers: [provide(NAME, { useValue: 'Meridian' })],
  exports: [NAME],
});
const COMMS_OPTIONS = new Token<{ frequency: number }>('CommsOptions');
const Comms = defineModule({
  name: 'Comms',
  options: COMMS_OPTIONS,
  providers: [],
});

describe('Nexus.create', () => {
  it('reports a bad element of the array form on the element', () => {
    void Nexus.create([Logger]);
    void Nexus.create([
      Logger,
      // @ts-expect-error static deps lists a string where a Logger goes
      UserService,
    ]);
    void Nexus.create([
      {
        token: NAME,
        // @ts-expect-error a number is not a string
        useValue: 42,
      },
    ]);
    void Nexus.create([
      {
        token: NAME,
        // @ts-expect-error a literal cannot type an unannotated factory
        useFactory: (logger) => String(logger),
        deps: [Logger],
      },
    ]);
  });

  it('reports a bad element of the object form on the element', () => {
    void Nexus.create({ imports: [Engineering], providers: [Logger] });
    void Nexus.create({
      providers: [
        Logger,
        // @ts-expect-error static deps lists a string where a Logger goes
        UserService,
      ],
    });
    void Nexus.create({
      providers: [
        {
          token: NAME,
          // @ts-expect-error a number is not a string
          useValue: 42,
        },
      ],
    });
  });

  it('reports another key of the object form at that key', () => {
    void Nexus.create({
      // @ts-expect-error a root object takes no name
      name: 'App',
      providers: [Logger],
    });
    void Nexus.create({
      // @ts-expect-error a root is not global
      global: true,
    });
  });

  it('reports only the untyped function when a class sits beside it', () => {
    void Nexus.create([
      Logger,
      {
        token: NAME,
        deps: [Logger],
        // @ts-expect-error a literal cannot type an unannotated factory
        useFactory: (logger) => String(logger),
      },
    ]);
    void Nexus.create({
      imports: [Engineering],
      providers: [
        Logger,
        {
          token: NAME,
          deps: [Logger],
          // @ts-expect-error a literal cannot type an unannotated factory
          useFactory: (logger) => String(logger),
        },
      ],
    });
  });

  it('takes a configured module as the root and as an import', () => {
    void Nexus.create(Comms.with({ frequency: 1420 }));
    void Nexus.create({ imports: [Comms.with({ frequency: 1420 })] });
    void Nexus.create({
      imports: [
        Comms.with({
          // @ts-expect-error frequency is a number
          frequency: 'high',
        }),
      ],
    });
  });

  it('accepts a module and every RootRef', () => {
    void Nexus.create(Engineering);
    const boot = (root: RootRef) => Nexus.create(root);
    const config: RootConfig = { providers: [Logger] };
    void boot(config);
    void Nexus.create(config);
  });

  it('passes a root through a generic wrapper', () => {
    const boot = <const R>(root: CheckedRoot<R>) => Nexus.create(root);
    void boot([Logger]);
  });
});

describe('Nexus.check', () => {
  it('reports on the element in both forms', () => {
    Nexus.check([Logger]);
    Nexus.check([
      Logger,
      // @ts-expect-error static deps lists a string where a Logger goes
      UserService,
    ]);
    Nexus.check({
      providers: [
        // @ts-expect-error static deps lists a string where a Logger goes
        UserService,
      ],
    });
  });
});
