import { Token } from '@nexusdi/core';

/** Where bridge-api listens. */
export interface IBridgeEndpoint {
  /** bridge-api's base URL. Each route's path resolves against it. */
  url(): Promise<URL>;
}

export const BRIDGE_ENDPOINT = new Token<IBridgeEndpoint>('BridgeEndpoint');

async function readEndpoint(): Promise<URL> {
  const response = await fetch('/bridge.json');
  if (!response.ok) throw new Error(`/bridge.json answered ${response.status}`);
  const body: unknown = await response.json();
  const url = (body as { url?: unknown } | null)?.url;
  if (typeof url !== 'string') throw new Error('/bridge.json holds no url');
  return new URL(url);
}

/**
 * Reads bridge-api's address from /bridge.json, `{ "url": "..." }`, on the
 * first call, as the shell reads /remotes.json, so one build talks to
 * whichever bridge the server names. It keeps a successful answer, and a
 * call after a failed read reads the file again.
 */
export class RuntimeBridgeEndpoint implements IBridgeEndpoint {
  #answer: Promise<URL> | undefined;

  url(): Promise<URL> {
    this.#answer ??= readEndpoint().catch((error: unknown) => {
      this.#answer = undefined;
      throw error;
    });
    return this.#answer;
  }
}
