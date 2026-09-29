import { describe, expect, it } from 'vitest';

import {
  defineModule,
  errorBase,
  InvalidModuleError,
  InvalidTokenError,
  Token,
  type NexusError,
} from '@nexusdi/core';

import { thrown } from '../../test-support/catch.js';
import { errorCases } from '../../test-support/error-cases.js';
import { messageScenarios } from '../../test-support/message-scenarios.js';
import { errors, explain } from '../index.js';
import { layout } from '../layout.js';

/** The message errors() writes for `error`, from explain() alone. */
function render(error: NexusError): string {
  const text = explain(error);
  return text === undefined ? error.message : layout(error.code, text);
}

describe('NexusError', () => {
  it.each(errorCases)('keeps the message of $name', ({ error }) => {
    expect(render(error)).toMatchSnapshot();
  });

  it.each(messageScenarios)('keeps the message of $name', async ({ run }) => {
    const error = (await run([errors()])) as NexusError;
    expect(error.message).toMatchSnapshot();
  });
});

describe('explain', () => {
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
