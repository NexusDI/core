import { describe, expect, it } from 'vitest';

import { errorCases } from '../../test-support/error-cases.js';
import { messageScenarios } from '../../test-support/message-scenarios.js';

describe('NexusError', () => {
  it.each(errorCases)('keeps the message of $name', ({ error }) => {
    expect(error.message).toMatchSnapshot();
  });

  it.each(messageScenarios)('keeps the message of $name', async ({ run }) => {
    const error = (await run([])) as Error;
    expect(error.message).toMatchSnapshot();
  });
});
