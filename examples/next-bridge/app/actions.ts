'use server';

import { missionRequest, ship } from './nexus.server';
import { FLIGHT_LOG } from './ship/gate.module';

export async function recordEntry(
  _previous: string,
  form: FormData,
): Promise<string> {
  await using scope = await (
    await ship()
  ).createScope({
    request: await missionRequest(),
  });
  const log = scope.get(FLIGHT_LOG);
  log.record(String(form.get('entry') ?? ''));
  return log.entries().join('\n');
}
