import { isNexusError, NexusError } from '@nexusdi/core';
import { describe, expect, expectTypeOf, it } from 'vitest';

import { BadCommandError, PowerBudgetError } from './errors';
import { ENGINEERING_ACTIONS } from './systems/engineering/engineering-commands';

const DOCS =
  'https://github.com/NexusDI/core/tree/main/examples/meridian-systems#';

const budget = () =>
  new PowerBudgetError({
    consumer: 'shields',
    demand: 200e6,
    available: 193.6e6,
  });

const badCommand = () =>
  new BadCommandError({
    reason: 'action',
    system: 'engineering',
    action: 'warp',
    expected: ENGINEERING_ACTIONS,
  });

describe('PowerBudgetError', () => {
  it('carries its code, its name and its fields', () => {
    const error = budget();
    expect(error).toBeInstanceOf(NexusError);
    expect(error.code).toBe('MERIDIAN_POWER_BUDGET');
    expect(error.name).toBe('PowerBudgetError');
    expect({ ...error }).toEqual({
      consumer: 'shields',
      demand: 200e6,
      available: 193.6e6,
    });
  });

  it('narrows through isNexusError by its code', () => {
    const error: unknown = budget();
    expect(isNexusError(error, 'MERIDIAN_POWER_BUDGET')).toBe(true);
    expect(isNexusError(error, 'MERIDIAN_BAD_COMMAND')).toBe(false);
    if (isNexusError(error, 'MERIDIAN_POWER_BUDGET'))
      expectTypeOf(error).toEqualTypeOf<PowerBudgetError>();
  });

  it('links its one-line message to the README anchor of its code', () => {
    expect(budget().message).toBe(
      `[MERIDIAN_POWER_BUDGET] consumer=shields demand=200000000 available=193600000. ${DOCS}MERIDIAN_POWER_BUDGET`,
    );
  });
});

describe('BadCommandError', () => {
  it('carries its code, its name and its fields', () => {
    const error = badCommand();
    expect(error).toBeInstanceOf(NexusError);
    expect(error.code).toBe('MERIDIAN_BAD_COMMAND');
    expect(error.name).toBe('BadCommandError');
    expect({ ...error }).toEqual({
      reason: 'action',
      system: 'engineering',
      action: 'warp',
      expected: ENGINEERING_ACTIONS,
    });
  });

  it('narrows through isNexusError by its code', () => {
    const error: unknown = badCommand();
    expect(isNexusError(error, 'MERIDIAN_BAD_COMMAND')).toBe(true);
    if (isNexusError(error, 'MERIDIAN_BAD_COMMAND'))
      expectTypeOf(error).toEqualTypeOf<BadCommandError>();
  });

  it('links its one-line message to the README anchor of its code', () => {
    expect(badCommand().message.endsWith(`. ${DOCS}MERIDIAN_BAD_COMMAND`)).toBe(
      true,
    );
  });
});
