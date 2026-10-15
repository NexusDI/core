import { disposed } from '../nexus.server';
import { FLIGHT_LOG } from '../ship';

export const loader = disposed.inject({ log: FLIGHT_LOG }, ({ log }) =>
  log.entries(),
);

export default function Gone() {
  return null;
}
