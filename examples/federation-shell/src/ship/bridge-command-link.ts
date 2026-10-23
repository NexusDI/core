import type {
  CommandReceipt,
  ICommandLink,
  StationCommand,
} from '@nexusdi/federation-contracts';

import { BRIDGE_ENDPOINT, type IBridgeEndpoint } from './bridge-endpoint';

const UNREACHABLE: CommandReceipt = {
  queued: false,
  text: 'The bridge is unreachable',
};

/** bridge-api's refusal body, as its refusal texts write it. */
interface Refusal {
  readonly code: string;
  readonly message: string;
  readonly fix?: string;
}

const isRefusal = (body: unknown): body is Refusal =>
  typeof (body as Refusal | null)?.code === 'string' &&
  typeof (body as Refusal | null)?.message === 'string';

const UNREADABLE: CommandReceipt = {
  queued: false,
  text: 'The bridge sent an answer the shell cannot read',
};

/** The receipt of one answer of `POST /commands`. */
async function receiptOf(response: Response): Promise<CommandReceipt> {
  let body: unknown;
  try {
    body = await response.json();
  } catch {
    return UNREADABLE;
  }
  if (response.status === 202) {
    const tick = (body as { tick?: unknown } | null)?.tick;
    if (typeof tick !== 'number') return UNREADABLE;
    return { queued: true, tick, text: `Queued for tick ${tick}` };
  }
  if (!isRefusal(body)) return UNREADABLE;
  const fix = body.fix === undefined ? '' : ` Fix: ${body.fix}`;
  return { queued: false, text: `${body.code}: ${body.message}${fix}` };
}

/**
 * Posts each crew command to bridge-api's `POST /commands` as JSON. The only
 * request header is content-type, which the bridge's CORS rule allows. A 202
 * reads as the tick that applies the command, and a 400 or a 409 as the
 * bridge's refusal text. One of those answers with a body the shell cannot
 * parse reads as unreadable. Any other status, or no answer, reads as an
 * unreachable bridge, so send() never rejects.
 */
export class BridgeCommandLink implements ICommandLink {
  static deps = [BRIDGE_ENDPOINT] as const;

  constructor(private readonly endpoint: IBridgeEndpoint) {}

  async send(command: StationCommand): Promise<CommandReceipt> {
    try {
      const base = await this.endpoint.url().catch((error: unknown) => {
        console.error('The shell cannot read the bridge address', error);
        throw error;
      });
      const response = await fetch(new URL('commands', base), {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(command),
      });
      if (![202, 400, 409].includes(response.status)) return UNREACHABLE;
      return await receiptOf(response);
    } catch {
      return UNREACHABLE;
    }
  }
}
