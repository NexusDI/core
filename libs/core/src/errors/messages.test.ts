import { describe, expect, it } from 'vitest';

import { thrown } from '../../test-support/catch.js';
import { errorCases } from '../../test-support/error-cases.js';
import { messageScenarios } from '../../test-support/message-scenarios.js';
import { textPlugin } from '../../test-support/text-plugin.js';
import { defineModule } from '../definitions/define-module.js';
import { Token } from '../definitions/token.js';
import { render } from '../text/index.js';
import {
  errorBase,
  InvalidModuleError,
  InvalidTokenError,
  type NexusError,
} from './index.js';

describe('NexusError', () => {
  it.each(errorCases)('keeps the message of $name', ({ error }) => {
    expect(render(error)).toMatchSnapshot();
  });

  it.each(messageScenarios)('keeps the message of $name', async ({ run }) => {
    const error = (await run([textPlugin()])) as NexusError;
    expect(error.message).toMatchSnapshot();
  });
});

describe('render', () => {
  it('keeps the line of a code it has no text for', () => {
    class ContractError extends errorBase<
      'NEXUS_TEST_CONTRACT',
      { contract: string }
    >('NEXUS_TEST_CONTRACT', 'ContractError') {}
    const error = new ContractError({ contract: 'bank/Auth' });
    expect(render(error)).toBe(error.message);
  });

  it('renders a module error without an import path as defineModule words it', () => {
    // defineModule keeps revision 1's text in core, and the snapshot above
    // holds it, so the builder's no-path form is pinned to the same text.
    const raised = thrown(() => defineModule({} as never)) as Error;
    const error = new InvalidModuleError({ received: 'an object', path: [] });
    expect(render(error)).toBe(raised.message);
  });

  it('keeps the text of an error built with its own text', () => {
    const raised = thrown(() => new Token('')) as NexusError;
    expect(render(raised)).toBe(raised.message);
  });

  it('renders a bad token description as new Token() words it', () => {
    const raised = thrown(() => new Token('')) as Error;
    const error = new InvalidTokenError({
      received: 'the string ""',
      entry: null,
      module: null,
      index: null,
      reason: 'bad-description',
      detail: [],
    });
    expect(render(error)).toBe(raised.message);
  });
});
