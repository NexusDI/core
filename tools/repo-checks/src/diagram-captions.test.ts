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

describe('diagram-captions quotes', () => {
  it('fails a caption the loader rejects for a quote or a backslash', () => {
    const message =
      'apps/docs/content/lifecycle.mdx:3: the caption of a mermaid fence contains a quote or a backslash. Reword it without one.';
    expect(
      checkCaptions([
        page('```mermaid caption="He said "x" now"\ngraph TD; A-->B\n```'),
        page('```mermaid caption="Ok" \\x\ngraph TD; A-->B\n```'),
      ]),
    ).toEqual([message, message]);
  });
});

describe('diagram-captions on apps/docs', () => {
  it('holds', () => {
    expect(checkCaptions(readSite(CONTENT))).toEqual([]);
  });
});
