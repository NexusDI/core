import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { renderToString } from 'react-dom/server';
import { describe, expect, it } from 'vitest';

import ApiFilter from './ApiFilter';

/**
 * The filter writes `hidden` on the page's own entries and owns none of them,
 * so these mount it inside a page of entries and read the entries back.
 */

const page = () =>
  render(
    <main>
      <ApiFilter />
      <div className="nexus-api-entry meridian-kind-function">
        <h2>graph</h2>
      </div>
      <div className="nexus-api-entry meridian-kind-interface">
        <h2>GraphView</h2>
      </div>
      <div className="nexus-api-entry meridian-kind-function">
        <h2>trace</h2>
      </div>
    </main>,
  );

const entries = () =>
  [...document.querySelectorAll('.nexus-api-entry')] as HTMLElement[];

describe('ApiFilter', () => {
  it('hides what does not match and removes nothing', async () => {
    page();
    await userEvent.type(screen.getByRole('searchbox'), 'graph');

    expect(entries()).toHaveLength(3);
    expect(entries().map((each) => each.hidden)).toEqual([false, false, true]);
    expect(screen.getByText('2 of 3')).toBeTruthy();
  });

  it('names each kind toggle with the kind and its count, and says whether it is on', async () => {
    page();
    const toggle = screen.getByRole('switch', { name: 'interface 1' });

    expect(screen.getByRole('switch', { name: 'function 2' })).toBeTruthy();
    expect(toggle.getAttribute('type')).toBe('checkbox');
    expect((toggle as HTMLInputElement).checked).toBe(true);
    await userEvent.click(toggle);
    expect((toggle as HTMLInputElement).checked).toBe(false);
  });

  it('turns a kind off and clears everything with the button', async () => {
    page();
    await userEvent.click(screen.getByRole('switch', { name: 'interface 1' }));
    expect(entries()[1]?.hidden).toBe(true);

    await userEvent.type(screen.getByRole('searchbox'), 'zzz');
    expect(screen.getByText(/Nothing matches/)).toBeTruthy();

    await userEvent.click(
      screen.getByRole('button', { name: 'Clear the filter' }),
    );
    expect(entries().every((each) => !each.hidden)).toBe(true);
  });

  it('clears the query on Escape', async () => {
    page();
    const box = screen.getByRole('searchbox');
    await userEvent.type(box, 'trace');
    expect(entries().map((each) => each.hidden)).toEqual([true, true, false]);

    await userEvent.type(box, '{Escape}');
    expect((box as HTMLInputElement).value).toBe('');
    expect(entries().every((each) => !each.hidden)).toBe(true);
  });

  it('announces the count and the empty result in live regions', async () => {
    page();
    const regions = () => screen.getAllByRole('status');

    expect(regions().map((each) => each.textContent)).toContain('3 exports');
    await userEvent.type(screen.getByRole('searchbox'), 'graph');
    expect(regions().map((each) => each.textContent)).toContain('2 of 3');

    await userEvent.type(screen.getByRole('searchbox'), 'zzz');
    expect(
      regions().some((each) => /Nothing matches/.test(each.textContent ?? '')),
    ).toBe(true);
  });

  it('renders hidden until it has read the page', () => {
    const html = renderToString(<ApiFilter />);

    expect(html).toMatch(/<div class="nexus-api-filter"[^>]*\bhidden/);
  });
});
