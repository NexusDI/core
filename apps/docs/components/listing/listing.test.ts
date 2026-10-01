// @vitest-environment node
import { describe, expect, it } from 'vitest';

import { markListings } from '../../tools/mdx-listing-loader.mjs';

const fence = '```';

describe('markListings', () => {
  it('wraps a fence carrying one of the five exemption tags', () => {
    for (const tag of [
      'signature',
      'no-run',
      'anti-example',
      'fails-type-check',
      'elided',
    ]) {
      const source = `${fence}ts ${tag}\nship.get(NAV_CHARTS);\n${fence}\n`;
      expect(markListings(source)).toBe(
        `<Listing mark="${tag}">\n\n${fence}ts ${tag}\nship.get(NAV_CHARTS);\n${fence}\n\n</Listing>\n`,
      );
    }
  });

  it('leaves region fences, plain fences and shell fences alone', () => {
    const source = [
      `${fence}ts file=examples/meridian/src/pages/tokens.md region=first-ship`,
      fence,
      `${fence}sh`,
      'npm install @nexusdi/core',
      fence,
      `${fence}ts twoslash`,
      'const frequency = 1420;',
      fence,
      '',
    ].join('\n');
    expect(markListings(source)).toBe(source);
  });

  it('reads the tag from the info string, never from the fence body', () => {
    const source = `${fence}ts\n// no-run elided\nconst crew = 12;\n${fence}\n`;
    expect(markListings(source)).toBe(source);
  });

  it('keeps a longer fence whole and wraps fences inside it only once', () => {
    const source = [
      '````md no-run',
      `${fence}ts no-run`,
      'inner();',
      fence,
      '````',
      '',
    ].join('\n');
    const out = markListings(source);
    expect(out.match(/<Listing /g)).toHaveLength(1);
    expect(out.startsWith('<Listing mark="no-run">\n\n````md no-run\n')).toBe(
      true,
    );
  });

  it('keeps the fence indentation inside a list item and wraps it there', () => {
    const source = `- Step\n\n  ${fence}ts elided\n  step();\n  ${fence}\n`;
    const out = markListings(source);
    expect(out).toContain('  <Listing mark="elided">\n\n');
    expect(out).toContain(`  ${fence}\n\n  </Listing>\n`);
  });

  it('treats a one-line triple-backtick span as text, not an opener', () => {
    const source = `${fence}ts no-run${fence}\nplain text\n`;
    expect(markListings(source)).toBe(source);
  });

  it('ignores a line indented four spaces as a fence', () => {
    const source = `    ${fence}ts no-run\n    code\n    ${fence}\n`;
    expect(markListings(source)).toBe(source);
  });

  it('wraps a tilde fence and keeps a backtick fence inside it as content', () => {
    const source = `~~~md no-run\n${fence}ts\ninner();\n${fence}\n~~~\n`;
    expect(markListings(source)).toBe(
      `<Listing mark="no-run">\n\n${source}\n</Listing>\n`,
    );
  });
});
