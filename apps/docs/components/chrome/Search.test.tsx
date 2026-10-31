import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';

import Search from './Search';
import type { PagefindData } from './search-model';

vi.mock('next/dist/client/add-base-path', () => ({
  addBasePath: (path: string) => path,
}));

const page = (n: number, band: string): PagefindData => ({
  url: `/page-${n}/`,
  meta: { title: `Page ${n}` },
  filters: { band: [band] },
  sub_results: [
    {
      title: `Heading ${n}`,
      url: `/page-${n}/#heading`,
      excerpt: 'the <mark>token</mark> here',
    },
  ],
});

/** Installs a fake Pagefind that finds `count` pages, in two bands. */
function fakePagefind(count: number) {
  const calls: unknown[] = [];
  window.pagefind = {
    options: async () => undefined,
    debouncedSearch: async (_term, options) => {
      calls.push(options);
      const band = options?.filters?.band;
      const all = Array.from({ length: count }, (_, at) =>
        page(at, at % 2 ? 'API' : 'Concepts'),
      ).filter((each) => !band || each.filters?.band?.[0] === band);
      return {
        results: all.map((each) => ({ data: async () => each })),
        filters: { band: { Concepts: Math.ceil(count / 2), API: count >> 1 } },
      };
    },
  };
  return calls;
}

afterEach(() => {
  delete window.pagefind;
});

describe('Search', () => {
  it('shows each page with its band placard and an option per hit', async () => {
    fakePagefind(2);
    render(<Search />);
    await userEvent.type(screen.getByRole('combobox'), 'token');

    const options = await screen.findAllByRole('option');
    expect(options).toHaveLength(2);
    expect(options[0]?.getAttribute('href')).toMatch(/^\/page-0\/?#heading$/);
    expect(screen.getAllByText('Concepts').length).toBeGreaterThan(0);
    expect(screen.queryByRole('group', { name: 'Filter by band' })).toBeNull();
  });

  it('shows a filter row above ten pages and narrows to a band', async () => {
    const calls = fakePagefind(12);
    render(<Search />);
    await userEvent.type(screen.getByRole('combobox'), 'token');

    const row = await screen.findByRole('group', { name: 'Filter by band' });
    expect(row).toBeTruthy();
    await userEvent.click(screen.getByRole('button', { name: /^API/ }));

    await waitFor(() =>
      expect(calls.at(-1)).toEqual({ filters: { band: 'API' } }),
    );
    await waitFor(() => expect(screen.getAllByRole('option')).toHaveLength(6));
  });

  it('moves through the hits with the arrow keys', async () => {
    fakePagefind(3);
    render(<Search />);
    const input = screen.getByRole('combobox');
    await userEvent.type(input, 'token');
    await screen.findAllByRole('option');

    await userEvent.keyboard('{ArrowDown}');
    expect(input.getAttribute('aria-activedescendant')).toBe(
      screen.getAllByRole('option')[0]?.id,
    );
    await userEvent.keyboard('{ArrowDown}');
    expect(
      screen.getAllByRole('option')[1]?.getAttribute('aria-selected'),
    ).toBe('true');
  });
});
