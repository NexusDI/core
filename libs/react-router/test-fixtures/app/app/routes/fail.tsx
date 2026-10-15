import { di } from '../nexus.server';
import { FLIGHT_LOG } from '../ship';

export const loader = di.inject({ log: FLIGHT_LOG }, () => {
  throw new Error('sector not charted');
});

export default function Fail() {
  return null;
}
