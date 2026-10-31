import type { TraceEvent } from '@nexusdi/core';

/**
 * Plays trace events at the sequence tier (design system 9.1): one step of
 * 120 ms for each batch, and 2.4 s at most for the whole run. A batch holds
 * the build events of one level, so systems that build in one level light
 * together. Every other event is its own batch, so the rollback of a failed
 * startup dims the ship one instance at a time, newest first. Core emits the
 * events as it works, so a factory that waits 400 ms holds the next batch for
 * those 400 ms, and the wait counts inside the 2.4 s.
 */

export const STEP_MS = 120;
const BUDGET_MS = 2400;

type Sleep = (ms: number) => Promise<void>;

const BUILD = new Set(['construct', 'construct:await']);

/** The level a build event belongs to, or null for any other event. */
function levelOf(event: TraceEvent): number | null {
  return (event.type === 'construct' || event.type === 'construct:await') &&
    event.level !== null
    ? event.level
    : null;
}

export interface Player {
  push(event: TraceEvent): void;
  /** Resolves once the queue is empty and nothing plays. */
  drain(): Promise<void>;
  /** Applies what is queued at once, and every later event at once. */
  finish(): void;
}

export function createPlayer(
  apply: (batch: readonly TraceEvent[]) => void,
  {
    instant = false,
    sleep = (ms) => new Promise((done) => setTimeout(done, ms)),
    now = () => performance.now(),
  }: { instant?: boolean; sleep?: Sleep; now?: () => number } = {},
): Player {
  const queue: TraceEvent[] = [];
  let playing: Promise<void> | null = null;
  let fast = instant;
  const start = now();

  function takeBatch(): TraceEvent[] {
    const first = queue.shift();
    if (first === undefined) return [];
    const level = levelOf(first);
    const batch = [first];
    if (level === null || !BUILD.has(first.type)) return batch;
    while (queue.length > 0) {
      const next = queue[0] as TraceEvent;
      if (levelOf(next) !== level) break;
      batch.push(queue.shift() as TraceEvent);
    }
    return batch;
  }

  async function loop(): Promise<void> {
    while (queue.length > 0) {
      apply(takeBatch());
      if (fast) continue;
      const left = BUDGET_MS - (now() - start);
      const step = Math.max(0, Math.min(STEP_MS, left / (queue.length + 1)));
      await sleep(step);
    }
    playing = null;
  }

  function kick(): void {
    if (playing === null && queue.length > 0) playing = loop();
  }

  return {
    push(event) {
      queue.push(event);
      if (fast && playing === null) {
        while (queue.length > 0) apply(takeBatch());
      } else kick();
    },
    async drain() {
      while (playing !== null) await playing;
    },
    finish() {
      fast = true;
      if (playing === null) while (queue.length > 0) apply(takeBatch());
    },
  };
}
