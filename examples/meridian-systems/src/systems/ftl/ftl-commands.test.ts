import type { NexusError } from '@nexusdi/core';
import { explain } from '@nexusdi/errors';
import { describe, expect, it } from 'vitest';

import { shipText } from '../../text';

import { FTL_ACTIONS } from './contracts';
import { refuseFtl } from './ftl-commands';

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
