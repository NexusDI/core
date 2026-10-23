import { describe, expect, it } from 'vitest';

import { BadCommandError } from '../errors';
import {
  commandRefusal,
  flagArgument,
  levelArgument,
  textArgument,
} from './command-arguments';

const refuse = commandRefusal('probe', 'ping with a target');

const badArgument = expect.objectContaining({
  reason: 'argument',
  system: 'probe',
  action: 'ping',
});

describe('commandRefusal', () => {
  it('refuses an argument of the action by default', () => {
    const error = refuse('ping');
    expect(error).toBeInstanceOf(BadCommandError);
    expect({ ...error }).toEqual({
      reason: 'argument',
      system: 'probe',
      action: 'ping',
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
    expect(() => textArgument(command, 'target', refuse)).toThrow(badArgument);
  });
});

describe('flagArgument', () => {
  it.each([true, false])('reads %o', (on) => {
    const command = { system: 'probe', action: 'ping', on };
    expect(flagArgument(command, 'on', refuse)).toBe(on);
  });

  it.each([undefined, 'true', 1])('refuses %o', (on) => {
    const command = { system: 'probe', action: 'ping', on };
    expect(() => flagArgument(command, 'on', refuse)).toThrow(badArgument);
  });
});

describe('levelArgument', () => {
  it.each([0, 0.25, 1])('reads %o', (level) => {
    const command = { system: 'probe', action: 'ping', level };
    expect(levelArgument(command, 'level', refuse)).toBe(level);
  });

  it.each([-0.1, 1.5, NaN, '0.5', undefined])('refuses %o', (level) => {
    const command = { system: 'probe', action: 'ping', level };
    expect(() => levelArgument(command, 'level', refuse)).toThrow(badArgument);
  });
});
