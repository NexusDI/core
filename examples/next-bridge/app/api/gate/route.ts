import { gateCounters } from '../../gate-counter';

export const dynamic = 'force-dynamic';

/** The counters. This route does not import nexus.server.ts, so it evaluates nothing. */
export function GET() {
  const { evaluations, creates } = gateCounters();
  return Response.json({ evaluations, creates });
}
