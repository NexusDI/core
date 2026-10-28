import { missionScope } from '../../../nexus.server';
import { FLIGHT_LOG } from '../../../ship/docking-gate.module';

export const dynamic = 'force-dynamic';

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ to: string }> },
) {
  const { to } = await params;
  await using scope = await missionScope();
  const log = scope.get(FLIGHT_LOG);
  log.record(`plotting ${to}`);
  return Response.json({ entries: log.entries() });
}
