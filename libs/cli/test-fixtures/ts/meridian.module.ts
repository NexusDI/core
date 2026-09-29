import { Token, defineModule, provide } from '@nexusdi/core';
import { Injectable } from '@nexusdi/decorators';

import {
  NAV_CHARTS,
  Navigation,
  type INavCharts,
} from './navigation.module.js';

export interface IShipComputer {
  readonly charts: INavCharts;
}
export const COMPUTER = new Token<IShipComputer>('ShipComputer');

@Injectable({ deps: [NAV_CHARTS] })
class ShipComputer implements IShipComputer {
  constructor(readonly charts: INavCharts) {}
}

export const Meridian = defineModule({
  name: 'Meridian',
  imports: [Navigation],
  providers: [provide(COMPUTER, { useClass: ShipComputer })],
});
