'use server';

import { missionScope } from './nexus.server';
import { FLIGHT_LOG } from './ship/docking-gate.module';

export async function recordEntry(
  _previous: string,
  form: FormData,
): Promise<string> {
  await using scope = await missionScope();
  const log = scope.get(FLIGHT_LOG);
  log.record(String(form.get('entry') ?? ''));
  return log.entries().join('\n');
}
