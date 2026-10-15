import { Outlet } from 'react-router';

import { di } from '../nexus.server';
import { FLIGHT_LOG } from '../ship';

// A layout loader beside the course loader: React Router runs the two in
// parallel, and both must resolve from one request scope.
export const loader = di.inject({ log: FLIGHT_LOG }, ({ log }) => {
  log.record('bridge open');
  return null;
});

export default function Bridge() {
  return <Outlet />;
}
