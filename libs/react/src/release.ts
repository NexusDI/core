import { report } from './report.js';

export interface Lease {
  acquire(): void;
  release(): void;
}

/**
 * A disposal that waits for its last holder, and then one task (react spec
 * 6.3). Each acquire counts a holder and cancels a pending timer; each
 * release drops one, and only the release that leaves none sets the timer.
 * StrictMode unmounts and remounts effects synchronously, so its acquire
 * cancels the timer and the resource keeps its identity. A real unmount of
 * the last holder lets the timer fire.
 */
export function deferred(dispose: () => Promise<void>): Lease {
  let holders = 0;
  let timer: ReturnType<typeof setTimeout> | undefined;
  return {
    acquire() {
      holders += 1;
      if (timer === undefined) return;
      clearTimeout(timer);
      timer = undefined;
    },
    release() {
      holders = Math.max(0, holders - 1);
      if (holders > 0 || timer !== undefined) return;
      timer = setTimeout(() => {
        timer = undefined;
        if (holders === 0) dispose().catch(report);
      }, 0);
    },
  };
}
