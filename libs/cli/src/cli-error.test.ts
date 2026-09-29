import { describe, expect, it } from 'vitest';

import { CliError, formatCliError } from './cli-error.js';

describe('formatCliError', () => {
  it('prefixes the message and indents the fix', () => {
    expect(
      formatCliError(
        new CliError(
          3,
          '--format svg needs @viz-js/viz.',
          'Install it: npm i -D @viz-js/viz',
        ),
      ),
    ).toBe(
      'nexusdi: --format svg needs @viz-js/viz.\n  Install it: npm i -D @viz-js/viz\n',
    );
  });

  it('prints the message alone when there is no fix', () => {
    expect(
      formatCliError(new CliError(1, '[NEXUS_BLUEPRINT_INVALID] 1 errors.')),
    ).toBe('nexusdi: [NEXUS_BLUEPRINT_INVALID] 1 errors.\n');
  });
});
