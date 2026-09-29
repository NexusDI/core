import { Token, defineModule, provide } from '@nexusdi/core';

export const SENSORS = new Token('Sensors');
class DeepScan {}

export const Science = defineModule({
  name: 'Science',
  providers: [provide(SENSORS, { useClass: DeepScan })],
  exports: [SENSORS],
});
