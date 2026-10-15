import { describe, expect, it } from 'vitest';

import { layoutText } from '../text/index.js';

describe('layoutText', () => {
  it('writes the code in brackets before the message', () => {
    expect(
      layoutText('NEXUS_MISSING_PROVIDER', {
        message: 'No provider for ReactorCore.',
      }),
    ).toBe('[NEXUS_MISSING_PROVIDER] No provider for ReactorCore.');
  });

  it('writes each hint on its own line, indented by two spaces', () => {
    expect(
      layoutText('NEXUS_MISSING_PROVIDER', {
        message: 'No provider for ReactorCore.',
        hints: ['Engineering declares it.', 'Command never imports it.'],
      }),
    ).toBe(
      [
        '[NEXUS_MISSING_PROVIDER] No provider for ReactorCore.',
        '  Engineering declares it.',
        '  Command never imports it.',
      ].join('\n'),
    );
  });

  it('writes the fix last, after the hints', () => {
    expect(
      layoutText('NEXUS_MISSING_PROVIDER', {
        message: 'No provider for ReactorCore.',
        hints: ['Engineering declares it.'],
        fix: 'Add Engineering to the imports of Command.',
      }),
    ).toBe(
      [
        '[NEXUS_MISSING_PROVIDER] No provider for ReactorCore.',
        '  Engineering declares it.',
        '  Fix: Add Engineering to the imports of Command.',
      ].join('\n'),
    );
  });

  it('writes a fix without hints directly under the message', () => {
    expect(
      layoutText('NEXUS_MISSING_PROVIDER', {
        message: 'No provider for ReactorCore.',
        fix: 'Add Engineering to the imports of Command.',
      }),
    ).toBe(
      [
        '[NEXUS_MISSING_PROVIDER] No provider for ReactorCore.',
        '  Fix: Add Engineering to the imports of Command.',
      ].join('\n'),
    );
  });
});
