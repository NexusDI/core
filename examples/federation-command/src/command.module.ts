import { provide } from '@nexusdi/core';
import { Module } from '@nexusdi/decorators';

import { BRIDGE, Bridge } from './bridge';
import { HELM_ORDERS, HelmOrders } from './helm-orders';

/**
 * The command station's section, written as an `@Module` class. `name`
 * keeps the module's name in graph(ship) after the production minifier
 * renames the class.
 */
@Module({
  name: 'Command',
  providers: [
    provide(BRIDGE, { useClass: Bridge }),
    provide(HELM_ORDERS, { useClass: HelmOrders }),
  ],
  exports: [BRIDGE, HELM_ORDERS],
})
export class Command {}
