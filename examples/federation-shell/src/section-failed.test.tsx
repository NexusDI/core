import {
  Nexus,
  Token,
  defineModule,
  isNexusError,
  provide,
} from '@nexusdi/core';
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { SectionFailed } from './section-failed';

/** The error `fn` throws. */
function caught(fn: () => unknown): unknown {
  try {
    fn();
  } catch (error) {
    return error;
  }
  throw new Error('Expected the call to throw.');
}

/** A NexusError: a graph whose provider needs a token nothing provides. */
function missingProvider(): unknown {
  const CHARTS = new Token<object>('Charts');
  const LINK = new Token<object>('Link');
  class Plotter {
    static deps = [LINK] as const;
    constructor(readonly link: object) {}
  }
  const Station = defineModule({
    name: 'Station',
    providers: [provide(CHARTS, { useClass: Plotter })],
  });
  return caught(() => Nexus.check(Station));
}

/** The text of the `<code>` element in the fallback `error` renders. */
function codeShown(error: unknown): string | null | undefined {
  render(<SectionFailed error={error} retry={() => {}} />);
  return screen.getByRole('alert').querySelector('code')?.textContent;
}

describe('SectionFailed', () => {
  it('shows the code of a NexusError', () => {
    const error = missingProvider();
    if (!isNexusError(error)) throw new Error('Expected a NexusError.');
    expect(codeShown(error)).toBe(error.code);
  });

  it('shows the class name of a plain error, whatever code it carries', () => {
    class DiskFull extends Error {
      readonly code = 'ENOSPC';
    }
    expect(codeShown(new DiskFull('no space'))).toBe('DiskFull');
  });

  it('shows Error for an object with no prototype', () => {
    expect(codeShown(Object.create(null))).toBe('Error');
  });

  it('shows Error for a thrown value that is no object', () => {
    expect(codeShown('boom')).toBe('Error');
  });
});
