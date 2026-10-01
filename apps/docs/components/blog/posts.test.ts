import { describe, expect, it } from 'vitest';

import { postsOf } from './posts';

describe('postsOf', () => {
  it('keeps the post pages, newest first, and drops the index and folders', () => {
    expect(
      postsOf([
        { name: 'index', route: '/blog', frontMatter: { kind: 'blog' } },
        {
          name: 'first-release',
          route: '/blog/first-release',
          frontMatter: {
            kind: 'post',
            title: 'Tabula Rasa',
            date: new Date('2025-06-22T00:00:00Z'),
            description: 'The first release.',
          },
        },
        {
          name: '0-4-release-candidate',
          route: '/blog/0-4-release-candidate',
          frontMatter: {
            kind: 'post',
            title: 'NexusDI 0.4 release candidate',
            date: '2026-10-01',
          },
        },
        { name: 'drafts', route: '/blog/drafts', children: [] },
      ]),
    ).toEqual([
      {
        route: '/blog/0-4-release-candidate',
        title: 'NexusDI 0.4 release candidate',
        date: '2026-10-01',
        description: '',
      },
      {
        route: '/blog/first-release',
        title: 'Tabula Rasa',
        date: '2025-06-22',
        description: 'The first release.',
      },
    ]);
  });

  it('returns no post for a blog with only its index', () => {
    expect(
      postsOf([
        { name: 'index', route: '/blog', frontMatter: { kind: 'blog' } },
      ]),
    ).toEqual([]);
  });
});
