import { describe, expect, it } from 'vitest';

import { checkCaptions } from './docs/diagram-captions';
import { CONTENT } from './docs/paths';
import { parsePage, readSite } from './docs/site';

const page = (fence: string) =>
  parsePage(
    'apps/docs/content/lifecycle.mdx',
    'lifecycle',
    `# Lifecycle\n\n${fence}\n`,
  );

describe('diagram-captions fixtures', () => {
  it('passes a captioned mermaid fence', () => {
    expect(
      checkCaptions([
        page(
          '```mermaid caption="Disposal runs in reverse creation order."\ngraph TD; A-->B\n```',
        ),
      ]),
    ).toEqual([]);
  });

  it('fails a mermaid fence with no caption, and one with an empty caption', () => {
    expect(
      checkCaptions([
        page('```mermaid\ngraph TD; A-->B\n```'),
        page('```mermaid caption=""\ngraph TD; A-->B\n```'),
      ]),
    ).toEqual([
      'apps/docs/content/lifecycle.mdx:3: a mermaid fence has no caption. Write caption="…" stating what the diagram shows; the prose carries every fact it draws.',
      'apps/docs/content/lifecycle.mdx:3: a mermaid fence has no caption. Write caption="…" stating what the diagram shows; the prose carries every fact it draws.',
    ]);
  });
});

describe('diagram-captions on apps/docs', () => {
  it('holds', () => {
    expect(checkCaptions(readSite(CONTENT))).toEqual([]);
  });
});
