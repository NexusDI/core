import {
  check,
  defineModule,
  isNexusError,
  provide,
  Token,
} from '@nexusdi/core';
import { SectionConflictError, SectionError } from '@nexusdi/react';
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
  return caught(() => check(Station));
}

/** The SectionError a failed load hands the fallback, with `cause` as its load error. */
const failed = (cause: unknown) =>
  new SectionError(
    { section: 'cartography' },
    { cause, text: "Section 'cartography' failed to load." },
  );

/** The text of each `<code>` element in the fallback `error` renders. */
function codesShown(error: SectionError | SectionConflictError): string[] {
  render(<SectionFailed error={error} retry={() => {}} />);
  return [...screen.getByRole('alert').querySelectorAll('code')].map(
    (code) => code.textContent ?? '',
  );
}

describe('SectionFailed', () => {
  it('shows the section error code, then the code and message of a NexusError cause', () => {
    const cause = missingProvider();
    if (!isNexusError(cause)) throw new Error('Expected a NexusError.');
    expect(codesShown(failed(cause))).toEqual([
      'NEXUS_REACT_SECTION_FAILED',
      cause.code,
    ]);
    expect(screen.getByRole('alert').textContent).toContain(cause.message);
  });

  it('shows the class name and message of a plain error cause, whatever code it carries', () => {
    class DiskFull extends Error {
      readonly code = 'ENOSPC';
    }
    expect(codesShown(failed(new DiskFull('no space')))).toEqual([
      'NEXUS_REACT_SECTION_FAILED',
      'DiskFull',
    ]);
    expect(screen.getByRole('alert').textContent).toContain('no space');
  });

  it('shows Error for a cause that is an object with no prototype', () => {
    expect(codesShown(failed(Object.create(null)))).toEqual([
      'NEXUS_REACT_SECTION_FAILED',
      'Error',
    ]);
  });

  it('shows Error for a cause that is no object', () => {
    expect(codesShown(failed('boom')).at(1)).toBe('Error');
    expect(screen.getByRole('alert').textContent).toContain('boom');
  });

  it('shows the code and message of a conflict', () => {
    const conflict = new SectionConflictError(
      { section: 'cartography' },
      { text: 'Two section modules are loaded under one name.' },
    );
    expect(codesShown(conflict)).toEqual(['NEXUS_REACT_SECTION_CONFLICT']);
    expect(screen.getByRole('alert').textContent).toContain(
      'Two section modules',
    );
  });
});
