import { defineModule, provide } from '@nexusdi/core';

import { FTL_COMMANDS, FTL_DRIVE, FTL_PHYSICS, FTL_POWER } from './contracts';
import { FtlCommands } from './ftl-commands';
import { FtlPhysics } from './ftl-physics';
import { FtlPower } from './ftl-power';
import { JumpDrive } from './jump-drive';

/**
 * The FTL drive, which a running ship adds with `load(FtlDrive)`. It exports
 * the drive alone and keeps its step, its load and its commands inside, since
 * `load()` refuses a module that publishes a contribution to a multi token.
 * `JumpDrive` registers the three with the buses. The drive reads
 * `TICK_LOOP`, `SHIP_STATE`, `COMMAND_DESK`, `NAV_CHARTS` and `POWER_ROUTER`
 * from the ship it loads into, so `Nexus.check(FtlDrive)` alone fails with
 * `NEXUS_MISSING_PROVIDER` for each of them.
 */
export const FtlDrive = defineModule({
  name: 'FtlDrive',
  providers: [
    provide(FTL_DRIVE, { useClass: JumpDrive }),
    provide(FTL_PHYSICS, { useClass: FtlPhysics }),
    provide(FTL_POWER, { useClass: FtlPower }),
    provide(FTL_COMMANDS, { useClass: FtlCommands }),
  ],
  exports: [FTL_DRIVE],
});
