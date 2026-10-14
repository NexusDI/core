import type { Blueprint } from '../blueprint/blueprint.js';
import { isObject } from './ownership.js';
import { buildLevels } from './build-levels.js';
import { isThenable, observeRejection, traceBuild } from './build.js';
import { assertOpen, type RootState, type Run } from './state.js';

interface Initializable {
  onInit(): unknown;
}

function hasOnInit(value: object): value is Initializable {
  return typeof (value as { onInit?: unknown }).onInit === 'function';
}

/**
 * Calls onInit on the new singletons, level by level. Calls within a level run
 * together; a level waits for the one below, so a provider's non-lazy
 * dependencies finish onInit first. A provider becomes ready when its level's
 * calls have settled. Each object gets one call whichever providers reach it,
 * and a useValue object gets none.
 */
export async function runInit(
  root: RootState,
  bp: Blueprint,
  run: Pick<Run, 'id' | 'errors' | 'isNew'>,
): Promise<void> {
  await buildLevels(
    bp.singletonLevels,
    run.isNew,
    async (id, level) => {
      const instance = root.slots.value(id);
      if (
        !isObject(instance) ||
        !root.ownership.claimInit(instance) ||
        !hasOnInit(instance)
      )
        return;
      const tracer = root.tracer;
      const start = tracer.now();
      let isAsync = false;
      let returned: number | undefined;
      // A throw or rejection, or an observer's throw on init:await, ends
      // the call with init:failed.
      try {
        const result = instance.onInit();
        returned = tracer.now();
        isAsync = isThenable(result);
        if (isAsync) {
          try {
            traceBuild(
              'init:await',
              root,
              bp,
              id,
              run,
              level,
              true,
              start,
              returned,
            );
          } catch (error) {
            // Nothing awaits the thenable now; a later rejection stays handled.
            observeRejection(result);
            throw error;
          }
        }
        // Awaited for a plain value too, as rc.0 awaited every onInit.
        await result;
      } catch (error) {
        traceBuild(
          'init:failed',
          root,
          bp,
          id,
          run,
          level,
          isAsync,
          start,
          returned,
        );
        throw error;
      }
      traceBuild('init', root, bp, id, run, level, isAsync, start, returned);
    },
    (ids) => {
      for (const id of ids) root.slots.markReady(id);
      // root.disposing can flip while a level's onInit calls are running (an
      // async onInit yields control back to the event loop). The check runs
      // after every level, so a later level's onInit never starts once the
      // container has begun disposing.
      assertOpen(root);
    },
  );
}
