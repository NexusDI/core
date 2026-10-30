import { isNexusError, Nexus } from '@nexusdi/core';
import { lazySection, NexusProvider, SectionBoundary } from '@nexusdi/react';
import { act, render, screen } from '@testing-library/react';
import { expect, it, vi } from 'vitest';

it('NEXUS_REACT_SECTION_FAILED names the section, carries the load error and words a fix line, while the fallback reads the raw load error', async () => {
  vi.spyOn(console, 'error').mockImplementation(() => undefined);
  await using ship = await Nexus.create([]);
  const down = new Error('remote down');
  const caught: unknown[] = [];
  const onError = vi.fn();
  const seen: unknown[] = [];
  const Offline = ({ error }: { error: unknown; retry(): void }) => {
    seen.push(error);
    return <p>The star map did not load.</p>;
  };

  let view!: ReturnType<typeof render>;
  await act(async () => {
    view = render(
      <NexusProvider container={ship}>
        <SectionBoundary
          section={lazySection('cartography', async () => {
            throw down;
          })}
          errorFallback={Offline}
          onError={onError}
        >
          <p>Chart</p>
        </SectionBoundary>
      </NexusProvider>,
      { onCaughtError: (error) => caught.push(error) },
    );
  });
  await screen.findByText('The star map did not load.');

  // React gets the SectionError, which holds the load error as its cause.
  expect(caught).toHaveLength(1);
  const [error] = caught;
  expect(isNexusError(error, 'NEXUS_REACT_SECTION_FAILED')).toBe(true);
  expect(error).toMatchObject({ section: 'cartography', cause: down });
  expect((error as Error).message).toMatch(/^ *Fix: .+$/m);
  // Today the fallback and onError receive the load error itself.
  expect(seen.length).toBeGreaterThan(0);
  expect(seen.every((value) => value === down)).toBe(true);
  expect(onError).toHaveBeenCalledExactlyOnceWith(down);
  view.unmount();
});
