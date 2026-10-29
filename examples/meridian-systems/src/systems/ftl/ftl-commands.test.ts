import type { NexusError } from '@nexusdi/core';
import { explain } from '@nexusdi/errors';
import { describe, expect, it } from 'vitest';

import { shipText } from '../../text';

import { FTL_ACTIONS, type IFtlDrive } from './contracts';
import { FtlCommands, refuseFtl } from './ftl-commands';
import { FTL_SPOOL } from './ftl-model';

describe('refuseFtl', () => {
  const words = (error: NexusError) =>
    explain(error, { text: [shipText] })?.message;

  it('words an unknown action', () => {
    expect(words(refuseFtl('warp', 'action'))).toBe(
      `ftl has no action 'warp'. It takes ${FTL_ACTIONS}.`,
    );
  });

  it('words a bad argument by its name', () => {
    expect(words(refuseFtl('jump', { argument: 'to' }))).toBe(
      `ftl jump cannot use the to argument. It takes ${FTL_ACTIONS}.`,
    );
  });
});

describe('FtlCommands', () => {
  /** A handler over a drive that records each call and answers tick 5. */
  function build() {
    const calls: string[] = [];
    let reads = 0;
    const drive: IFtlDrive = {
      rating: FTL_SPOOL,
      spool() {
        calls.push('spool');
        return { tick: 5 };
      },
      jump(to) {
        calls.push(`jump ${to}`);
        return { tick: 5 };
      },
    };
    const commands = new FtlCommands(() => {
      reads++;
      return drive;
    });
    return { calls, commands, reads: () => reads };
  }

  it('serves ftl and reads no drive until a command arrives', () => {
    const { commands, reads } = build();
    expect(commands.system).toBe('ftl');
    expect(reads()).toBe(0);
  });

  it('hands a spool and a jump to the drive', () => {
    const { calls, commands } = build();
    expect(commands.handle({ system: 'ftl', action: 'spool' })).toEqual({
      tick: 5,
    });
    expect(
      commands.handle({ system: 'ftl', action: 'jump', to: 'Proxima-b' }),
    ).toEqual({ tick: 5 });
    expect(calls).toEqual(['spool', 'jump Proxima-b']);
  });

  it('refuses a jump with no star and an unknown action', () => {
    const { calls, commands } = build();
    expect(() => commands.handle({ system: 'ftl', action: 'jump' })).toThrow(
      expect.objectContaining({
        reason: 'argument',
        argument: 'to',
        problem: 'missing',
      }),
    );
    expect(() => commands.handle({ system: 'ftl', action: 'warp' })).toThrow(
      expect.objectContaining({ reason: 'action', action: 'warp' }),
    );
    expect(calls).toEqual([]);
  });
});
