import { fileURLToPath } from 'node:url';

import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { startNext } from './next-server';

const dir = fileURLToPath(new URL('..', import.meta.url));
let server: Awaited<ReturnType<typeof startNext>>;

beforeAll(async () => {
  server = await startNext(dir);
});
afterAll(async () => {
  await server?.close();
});

/**
 * The hidden fields Next renders into the progressive-enhancement form of a
 * bound action (useActionState): `$ACTION_REF_n`, `$ACTION_n:i` and
 * `$ACTION_KEY`. A post without JavaScript sends them back.
 */
function hiddenFields(html: string): FormData {
  const form = /<form[^>]*>([\s\S]*?)<\/form>/.exec(html)?.[1];
  if (form === undefined) throw new Error('no form in /gate');
  const fields = new FormData();
  for (const [, name, value] of form.matchAll(
    /<input type="hidden" name="([^"]+)"(?: value="([^"]*)")?\/>/g,
  ))
    fields.set(
      name ?? '',
      (value ?? '').replaceAll('&quot;', '"').replaceAll('&amp;', '&'),
    );
  if (![...fields.keys()].some((key) => key.startsWith('$ACTION_')))
    throw new Error('no $ACTION_ field in /gate');
  return fields;
}

// The Next gate, kept as a canary. Next 16
// evaluates nexus.server.ts once in the route handler layer and once in the
// server action layer, so each process builds two containers, and
// @nexusdi/next moved to 0.5. This test asserts the measured counts. It
// fails, and the gate flips, when Next evaluates the module once per
// process; @nexusdi/next waits on that. It runs only in the e2e target.
describe('the Next gate canary', () => {
  it('evaluates nexus.server.ts once per layer, so two containers per process', async () => {
    const route = await fetch(`${server.url}/api/course/Kepler-442b`, {
      headers: { 'x-mission-id': 'survey-7' },
    });
    expect(route.status).toBe(200);
    expect(await route.json()).toEqual({
      entries: ['survey-7: plotting Kepler-442b'],
    });

    const page = await fetch(`${server.url}/gate`);
    expect(page.status).toBe(200);
    const form = hiddenFields(await page.text());
    form.set('entry', 'docked');
    const action = await fetch(`${server.url}/gate`, {
      method: 'POST',
      body: form,
      headers: { 'x-mission-id': 'survey-8' },
    });
    expect(action.status).toBe(200);
    expect(await action.text()).toContain('survey-8: docked');

    const counters = await (await fetch(`${server.url}/api/gate`)).json();
    expect(counters).toEqual({ evaluations: 2, creates: 2 });
  });
});
