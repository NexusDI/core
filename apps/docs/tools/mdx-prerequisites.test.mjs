// @vitest-environment node
import { describe, expect, it } from 'vitest';

import { withPrerequisites } from './mdx-nextra-loader.mjs';

const fence = '```';

describe('withPrerequisites', () => {
  it('writes the plate above the first H2 from the requires frontmatter', () => {
    const source = [
      '---',
      'title: Scopes',
      'requires: [configurable-modules, modules]',
      '---',
      '',
      '# Scopes',
      '',
      'A scope is short.',
      '',
      '## What is a scope?',
      '',
    ].join('\n');
    const out = withPrerequisites(source);
    expect(out).toContain(
      '<Prerequisites requires={["configurable-modules","modules"]} />\n\n## What is a scope?',
    );
    expect(out.indexOf('<Prerequisites')).toBeGreaterThan(
      out.indexOf('A scope is short.'),
    );
  });

  it('skips a ## line inside a fence', () => {
    const source = [
      '---',
      "requires: ['tokens']",
      '---',
      '# Providers',
      `${fence}md`,
      '## not a heading',
      fence,
      '## Real heading',
    ].join('\n');
    const out = withPrerequisites(source);
    expect(out.indexOf('<Prerequisites')).toBeGreaterThan(
      out.indexOf('## not a heading'),
    );
    expect(out).toContain('requires={["tokens"]}');
  });

  it('leaves a page with no requires or no H2 alone', () => {
    const none = '---\ntitle: A\n---\n# A\n\n## B\n';
    expect(withPrerequisites(none)).toBe(none);
    const noH2 = '---\nrequires: [tokens]\n---\n# A\n';
    expect(withPrerequisites(noH2)).toBe(noH2);
  });
});
