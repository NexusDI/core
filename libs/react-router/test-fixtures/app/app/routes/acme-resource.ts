import { acme } from '../nexus.server';
import { FLIGHT_LOG } from '../ship';

// A resource route: no default export. React Router passes a thrown Response
// here to handleError.
export const loader = acme.inject({ log: FLIGHT_LOG }, ({ log }) =>
  Response.json(log.entries()),
);
