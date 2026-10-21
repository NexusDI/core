import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const registerRemotes = vi.fn();
vi.mock('@module-federation/runtime', () => ({
  registerRemotes,
  loadRemote: vi.fn(),
}));

const { startRemotes } = await import('./mf');

const remotes = [
  {
    name: 'federation_cartography',
    entry: 'http://127.0.0.1:4301/remoteEntry.js',
  },
  { name: 'federation_command', entry: 'http://127.0.0.1:4302/remoteEntry.js' },
];

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
    expect(stations).toEqual({
      federation_cartography: 'registered',
      federation_command: 'registered',
    });
  });

  it('marks a station the list leaves out failed', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => Response.json([remotes[0]])),
    );

    expect(await startRemotes()).toEqual({
      federation_cartography: 'registered',
      federation_command: 'failed',
    });
  });

  it('marks every station failed when the fetch fails', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        throw new TypeError('Failed to fetch');
      }),
    );

    expect(await startRemotes()).toEqual({
      federation_cartography: 'failed',
      federation_command: 'failed',
    });
    expect(registerRemotes).not.toHaveBeenCalled();
  });

  it('marks every station failed when the answer is no list', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response('not found', { status: 404 })),
    );

    expect(await startRemotes()).toEqual({
      federation_cartography: 'failed',
      federation_command: 'failed',
    });
  });
});
