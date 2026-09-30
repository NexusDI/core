// @vitest-environment jsdom
// Mermaid's parser runs its label sanitizer, DOMPurify, which needs a DOM.
import mermaid from 'mermaid';
import { describe, expect, it } from 'vitest';

import { ESCAPE_FIXTURE, FIXTURE } from '../../test-support/graph-fixture.js';
import { toMermaid } from '../index.js';

describe('toMermaid through the Mermaid parser', () => {
  it.each([
    ['the providers view', toMermaid(FIXTURE)],
    ['the modules view', toMermaid(FIXTURE, { view: 'modules' })],
    ['names full of Mermaid syntax', toMermaid(ESCAPE_FIXTURE)],
    [
      'names full of Mermaid syntax, modules view',
      toMermaid(ESCAPE_FIXTURE, { view: 'modules' }),
    ],
  ])('parses %s', async (_, source) => {
    await expect(mermaid.parse(source)).resolves.toMatchObject({
      diagramType: 'flowchart-v2',
    });
  });
});
