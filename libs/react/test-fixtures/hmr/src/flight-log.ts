import type { IFlightLog } from './contracts';

export class ShuttleFlightLog implements IFlightLog {
  label() {
    return 'log v1';
  }
}
