import { describe, expect, it } from 'vitest';

import { BadCommandError } from '../errors';

import {
  choiceArgument,
  commandRefusal,
  flagArgument,
  levelArgument,
  numberArgument,
  optionalFlagArgument,
  optionalNumberArgument,
  ownKey,
  textArgument,
} from './command-arguments';

const refuse = commandRefusal('probe', 'ping with a target');

/** The refusal of the argument `name` of probe ping, which `value` is missing or unusable for. */
const badArgument = (name: string, value: unknown) =>
  expect.objectContaining({
    reason: 'argument',
    system: 'probe',
    action: 'ping',
    argument: name,
    problem: value === undefined ? 'missing' : 'invalid',
  });

describe('commandRefusal', () => {
  it('refuses an argument that is present and unusable', () => {
    const error = refuse('ping', { argument: 'target' });
    expect(error).toBeInstanceOf(BadCommandError);
    expect({ ...error }).toEqual({
      reason: 'argument',
      system: 'probe',
      action: 'ping',
      argument: 'target',
      problem: 'invalid',
      expected: 'ping with a target',
    });
  });

  it('refuses an argument that is missing', () => {
    expect({
      ...refuse('ping', { argument: 'target', missing: true }),
    }).toEqual({
      reason: 'argument',
      system: 'probe',
      action: 'ping',
      argument: 'target',
      problem: 'missing',
      expected: 'ping with a target',
    });
  });

  it('refuses the action itself', () => {
    expect({ ...refuse('pong', 'action') }).toEqual({
      reason: 'action',
      system: 'probe',
      action: 'pong',
      expected: 'ping with a target',
    });
  });
});

describe('textArgument', () => {
  it('reads a string argument', () => {
    const command = { system: 'probe', action: 'ping', target: 'bridge' };
    expect(textArgument(command, 'target', refuse)).toBe('bridge');
  });

  it.each([undefined, 3, true])('refuses %o', (target) => {
    const command = { system: 'probe', action: 'ping', target };
    expect(() => textArgument(command, 'target', refuse)).toThrow(
      badArgument('target', target),
    );
  });
});

describe('flagArgument', () => {
  it.each([true, false])('reads %o', (on) => {
    const command = { system: 'probe', action: 'ping', on };
    expect(flagArgument(command, 'on', refuse)).toBe(on);
  });

  it.each([undefined, 'true', 1])('refuses %o', (on) => {
    const command = { system: 'probe', action: 'ping', on };
    expect(() => flagArgument(command, 'on', refuse)).toThrow(
      badArgument('on', on),
    );
  });
});

describe('numberArgument', () => {
  it.each([-5, 0, 7.5, 10])('reads %o between -5 and 10', (range) => {
    const command = { system: 'probe', action: 'ping', range };
    expect(numberArgument(command, 'range', -5, 10, refuse)).toBe(range);
  });

  it.each([-5.1, 10.1, NaN, Infinity, '5', undefined, null])(
    'refuses %o',
    (range) => {
      const command = { system: 'probe', action: 'ping', range };
      expect(() => numberArgument(command, 'range', -5, 10, refuse)).toThrow(
        badArgument('range', range),
      );
    },
  );
});

describe('levelArgument', () => {
  it.each([0, 0.25, 1])('reads %o', (level) => {
    const command = { system: 'probe', action: 'ping', level };
    expect(levelArgument(command, 'level', refuse)).toBe(level);
  });

  it.each([-0.1, 1.5, NaN, '0.5', undefined])('refuses %o', (level) => {
    const command = { system: 'probe', action: 'ping', level };
    expect(() => levelArgument(command, 'level', refuse)).toThrow(
      badArgument('level', level),
    );
  });
});

describe('optionalNumberArgument', () => {
  it('reads an absent argument as undefined', () => {
    const command = { system: 'probe', action: 'ping' };
    expect(
      optionalNumberArgument(command, 'range', 0, 10, refuse),
    ).toBeUndefined();
  });

  it.each([0, 7.5, 10])('reads %o between 0 and 10', (range) => {
    const command = { system: 'probe', action: 'ping', range };
    expect(optionalNumberArgument(command, 'range', 0, 10, refuse)).toBe(range);
  });

  it.each([-1, 11, NaN, '5', null])('refuses %o', (range) => {
    const command = { system: 'probe', action: 'ping', range };
    expect(() =>
      optionalNumberArgument(command, 'range', 0, 10, refuse),
    ).toThrow(badArgument('range', range));
  });
});

describe('optionalFlagArgument', () => {
  it('reads an absent argument as undefined', () => {
    const command = { system: 'probe', action: 'ping' };
    expect(optionalFlagArgument(command, 'on', refuse)).toBeUndefined();
  });

  it.each([true, false])('reads %o', (on) => {
    const command = { system: 'probe', action: 'ping', on };
    expect(optionalFlagArgument(command, 'on', refuse)).toBe(on);
  });

  it.each(['true', 1, null])('refuses %o', (on) => {
    const command = { system: 'probe', action: 'ping', on };
    expect(() => optionalFlagArgument(command, 'on', refuse)).toThrow(
      badArgument('on', on),
    );
  });
});

describe('choiceArgument', () => {
  const modes = ['off', 'fill'] as const;

  it.each(modes)('reads %o', (mode) => {
    const command = { system: 'probe', action: 'ping', mode };
    expect(choiceArgument(command, 'mode', modes, refuse)).toBe(mode);
  });

  it.each(['drain', 'toString', 1, undefined, null])('refuses %o', (mode) => {
    const command = { system: 'probe', action: 'ping', mode };
    expect(() => choiceArgument(command, 'mode', modes, refuse)).toThrow(
      badArgument('mode', mode),
    );
  });
});

describe('ownKey', () => {
  const record = { bridge: 1 };

  it('accepts a key the record holds', () => {
    expect(ownKey(record, 'bridge')).toBe(true);
  });

  it.each(['galley', 'toString', '__proto__', 'constructor'])(
    'refuses %o',
    (key) => {
      expect(ownKey(record, key)).toBe(false);
    },
  );

  it('accepts a key that holds undefined', () => {
    expect(ownKey({ bridge: undefined }, 'bridge')).toBe(true);
  });
});
