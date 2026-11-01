import { Token, defineModule } from '@nexusdi/core';

const OPTIONS = new Token('CommsOptions');
const good = { frequency: 1420 };

// An async schema: check() cannot judge it, only Nexus.create can.
const Uplink = defineModule({
  name: 'Uplink',
  options: OPTIONS,
  schema: {
    '~standard': {
      version: 1,
      vendor: 'meridian',
      validate: async () => ({ value: good }),
    },
  },
});

// A forRootAsync() module gets its options only at create.
const Comms = defineModule({
  name: 'Comms',
  options: OPTIONS,
  schema: {
    '~standard': {
      version: 1,
      vendor: 'meridian',
      validate: (value) => ({ value }),
    },
  },
});

export default defineModule({
  name: 'Meridian',
  imports: [
    Uplink.forRoot(good),
    Comms.forRootAsync({ useFactory: () => good, deps: [] }),
  ],
});
