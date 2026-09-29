import { describe, expect, it } from 'vitest';

import { parseSnippetOutput } from './snippets.ts';

describe('parseSnippetOutput', () => {
  it('passes the real reactor, then the fake', () => {
    expect(
      parseSnippetOutput('{"real":"ReactorCore","fake":"FakeReactor"}'),
    ).toEqual({ ok: true });
  });
  it('fails a replacement that did not take', () => {
    expect(
      parseSnippetOutput('{"real":"ReactorCore","fake":"ReactorCore"}'),
    ).toEqual({
      ok: false,
      message: 'the replacement did not take: fake is ReactorCore',
    });
  });
  it('fails output that is not JSON', () => {
    expect(parseSnippetOutput('boom').ok).toBe(false);
  });
});
