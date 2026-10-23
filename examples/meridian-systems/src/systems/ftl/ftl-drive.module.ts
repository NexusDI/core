import { defineModule, provide } from '@nexusdi/core';

import { FTL_DRIVE } from './contracts';
import { JumpDrive } from './jump-drive';

/**
 * The FTL drive, which a running ship adds with `load(FtlDrive)`. It is the
 * one module object the library exports beside `meridianSystems`, and it
 * reads `TICK_LOOP`, `SHIP_STATE`, `NAV_CHARTS` and `POWER_ROUTER` through
 * the ship's global modules. `Nexus.check(FtlDrive)` alone fails with
 * `NEXUS_MISSING_PROVIDER` for each of them, and
 * `Nexus.check(meridianSystems(options), { load: [FtlDrive] })` passes.
 */
export const FtlDrive = defineModule({
  name: 'FtlDrive',
  providers: [provide(FTL_DRIVE, { useClass: JumpDrive })],
  exports: [FTL_DRIVE],
});
