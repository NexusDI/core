import { readFile } from 'node:fs/promises';

import { describe, expect, it } from 'vitest';

const read = async (path: string) =>
  JSON.parse(await readFile(new URL(path, import.meta.url), 'utf8'));

describe("the console's chart table", () => {
  it("holds the same headings as bridge-api's charts", async () => {
    expect(await read('../app/bridge/charts.json')).toEqual(
      await read('../../bridge-api/src/ship/charts.json'),
    );
  });
});
