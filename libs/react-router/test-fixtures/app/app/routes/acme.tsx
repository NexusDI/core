import { acme } from '../nexus.server';
import { FLIGHT_LOG } from '../ship';

export const loader = acme.inject({ log: FLIGHT_LOG }, ({ log }) =>
  log.entries(),
);

export default function Acme() {
  return null;
}
