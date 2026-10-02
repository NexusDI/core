import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

import { checkRefusedWords } from './docs/doc-prose';
import { CONTENT, FIXTURES } from './docs/paths';
import { parsePage, readSite } from './docs/site';

const tree = (name: string) =>
  readSite(join(FIXTURES, 'doc-prose', name, 'content'));
const EM = String.fromCharCode(0x2014);
const EN = String.fromCharCode(0x2013);
const at =
  'tools/repo-checks/src/__fixtures__/docs/doc-prose/sabotaged/content/tokens.mdx';

describe('doc-refused-words fixtures', () => {
  it('passes a clean tree, code and pre-0.4.0 posts included', () => {
    expect(checkRefusedWords(tree('clean'))).toEqual([]);
  });

  it('fails a refused word and both dashes in prose', () => {
    expect(checkRefusedWords(tree('sabotaged'))).toEqual([
      `${at}:8: "Simply" -- cut it; the sentence states the step without it`,
      `${at}:8: "${EM}" -- write two sentences, or put a short aside in parentheses`,
      `${at}:9: "${EN}" -- write "to" in a range, or a hyphen in a compound`,
    ]);
  });
});

describe('the owner refusals', () => {
  it('refuses native, a metadata library and the antithesis connectives', () => {
    const page = parsePage(
      'x.mdx',
      'x',
      '---\nkind: concept\n---\n\n# X\n\nNexusDI runs natively and needs no reflect-metadata.\n\nPass a token instead of a class, rather than a string.\n',
    );
    const words = checkRefusedWords([page]).map(
      (finding) => finding.split('"')[1],
    );
    expect(words.sort()).toEqual(
      ['instead of', 'natively', 'rather than', 'reflect-metadata'].sort(),
    );
  });
});

describe('doc-refused-words on apps/docs', () => {
  it('holds', () => {
    expect(checkRefusedWords(readSite(CONTENT))).toEqual([]);
  });
});
