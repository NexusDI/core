import { defineModule } from '@nexusdi/core';

import { Tactical } from './tactical';

/** The shell's root. The stations join it as sections after startup. */
export const Meridian = defineModule({
  name: 'Meridian',
  imports: [Tactical],
});
