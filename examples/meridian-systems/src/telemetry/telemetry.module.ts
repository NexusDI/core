import { defineModule, provide } from '@nexusdi/core';

import { TELEMETRY } from './contracts';
import { SnapshotFeed } from './snapshot-feed';

export const Telemetry = defineModule({
  name: 'Telemetry',
  providers: [provide(TELEMETRY, { useClass: SnapshotFeed })],
  exports: [TELEMETRY],
});
