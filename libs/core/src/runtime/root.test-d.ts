import { describe, it } from 'vitest';

import { Token } from '../definitions/token.js';
import { Nexus } from './nexus.js';

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

describe('Nexus.create', () => {
  it('checks each element of a provider array', () => {
    void Nexus.create([Logger]);
    // @ts-expect-error static deps lists a string where a Logger goes
    void Nexus.create([Logger, UserService]);
    // @ts-expect-error a number is not a string
    void Nexus.create([{ token: NAME, useValue: 42 }]);
  });

  it('checks the providers of the object form', () => {
    // @ts-expect-error a number is not a string
    void Nexus.create({ providers: [{ token: NAME, useValue: 42 }] });
    // @ts-expect-error static deps lists a string where a Logger goes
    void Nexus.create({ providers: [Logger, UserService] });
  });
});

describe('Nexus.check', () => {
  it('checks each element of a provider array', () => {
    Nexus.check([Logger]);
    // @ts-expect-error static deps lists a string where a Logger goes
    Nexus.check([Logger, UserService]);
  });
});
