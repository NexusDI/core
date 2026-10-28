import { commandRefusal } from '../../simulation/command-arguments';

import { FTL_ACTIONS, FTL_SYSTEM } from './contracts';

/** The `BadCommandError` the FTL drive throws for an action or an argument it cannot read. */
export const refuseFtl = commandRefusal(FTL_SYSTEM, FTL_ACTIONS);
