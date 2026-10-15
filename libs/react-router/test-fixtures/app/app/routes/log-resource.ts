import { di } from '../nexus.server';
import { FLIGHT_LOG } from '../ship';

export const loader = di.inject({ log: FLIGHT_LOG }, ({ log }) => {
  log.record('resource read');
  return Response.json(log.entries());
});
