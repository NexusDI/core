import { provide } from '@nexusdi/core';
import { Module } from '@nexusdi/decorators';

import { BRIDGE, Bridge } from './bridge';

/** The command station's section, written as an `@Module` class. */
@Module({
  providers: [provide(BRIDGE, { useClass: Bridge })],
  exports: [BRIDGE],
})
export class Command {}
