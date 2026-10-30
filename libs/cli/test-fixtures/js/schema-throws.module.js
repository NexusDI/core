import { Token, defineModule } from '@nexusdi/core';

const OPTIONS = new Token('CommsOptions');

// A schema whose validate throws instead of returning issues.
const Comms = defineModule({
  name: 'Comms',
  options: OPTIONS,
  schema: {
    '~standard': {
      version: 1,
      vendor: 'meridian',
      validate: () => {
        throw new Error('frequency must be a number');
      },
    },
  },
});

export default defineModule({
  name: 'Meridian',
  imports: [Comms.forRoot({ frequency: 'high' })],
});
