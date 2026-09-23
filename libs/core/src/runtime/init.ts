import type { Blueprint } from '../blueprint/blueprint.js';
import { DisposedError } from '../errors/index.js';
import { isObject } from './ownership.js';
import { settleLevel } from './settle.js';
import type { RootState } from './state.js';

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
  isNew: (id: string) => boolean,
): Promise<void> {
  for (const level of bp.singletonLevels) {
    const ids = level.filter(isNew);
    await settleLevel(ids, async (id) => {
      const instance = root.slots.value(id);
      if (
        !isObject(instance) ||
        !root.ownership.claimInit(instance) ||
        !hasOnInit(instance)
      )
        return;
      const tracer = root.tracer;
      const start = tracer.now();
      await instance.onInit();
      tracer.emit(() => ({
        type: 'init',
        token: bp.providers.get(id)?.name ?? id,
        providerId: id,
        durationMs: tracer.now() - start,
      }));
    });
    for (const id of ids) root.slots.markReady(id);
    // root.disposing can flip while a level's onInit calls are running (an
    // async onInit yields control back to the event loop). Checking it after
    // every level, not only once at the end, stops a later level's onInit
    // from starting once the container has begun disposing.
    if (root.disposing) throw new DisposedError({ target: 'container' });
  }
}
