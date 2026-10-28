import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const registerRemotes = vi.fn();
vi.mock('@module-federation/runtime', () => ({
  registerRemotes,
  loadRemote: vi.fn(),
}));

const { startRemotes } = await import('./mf');
const { remoteEntry, STATIONS } = await import('./stations');

const [first, second] = STATIONS;
const remotes = [first, second].map((row) => remoteEntry(row, '127.0.0.1'));

/** The status of every row, `registered` for the remotes in `names`. */
const status = (names: readonly string[]) =>
  Object.fromEntries(
    STATIONS.map(({ remote }) => [
      remote,
      names.includes(remote) ? 'registered' : 'failed',
    ]),
  );

describe('startRemotes', () => {
  beforeEach(() => registerRemotes.mockReset());
  afterEach(() => vi.unstubAllGlobals());

  it('registers every remote /remotes.json lists before it resolves', async () => {
    const fetch = vi.fn(async () => Response.json(remotes));
    vi.stubGlobal('fetch', fetch);
    const order: string[] = [];
    registerRemotes.mockImplementation(() => order.push('registered'));

    const stations = await startRemotes();
    order.push('resolved');

    expect(fetch).toHaveBeenCalledWith('/remotes.json');
    expect(registerRemotes).toHaveBeenCalledWith(remotes);
    expect(order).toEqual(['registered', 'resolved']);
    expect(stations).toEqual(status([first.remote, second.remote]));
  });

  it('marks a station the list leaves out failed', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => Response.json([remotes[0]])),
    );

    expect(await startRemotes()).toEqual(status([first.remote]));
  });

  it('marks every station failed when the fetch fails', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        throw new TypeError('Failed to fetch');
      }),
    );

    expect(await startRemotes()).toEqual(status([]));
    expect(registerRemotes).not.toHaveBeenCalled();
  });

  it('marks every station failed when the answer is no list', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response('not found', { status: 404 })),
    );

    expect(await startRemotes()).toEqual(status([]));
  });
});
