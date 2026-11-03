// Writes the enums of recordPath, alarmCode and refusalCode into
// deck/maps/map.schema.json from MAP_RECORDS and MAP_CODES. `--out <file>`
// writes the result there and leaves the schema alone. Node strips the types
// of the maps module as it loads it.
import { readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

import { MAP_CODES, MAP_RECORDS } from '../src/maps/map-definition.ts';

export const SCHEMA_URL = new URL(
  '../deck/maps/map.schema.json',
  import.meta.url,
);

/** The schema text with the enums rewritten from the constants. */
export function renderSchema(text) {
  const schema = JSON.parse(text);
  schema.$defs.recordPath = { enum: [...MAP_RECORDS] };
  schema.$defs.alarmCode = { enum: [...MAP_CODES.alarm] };
  schema.$defs.refusalCode = { enum: [...MAP_CODES.refused] };
  return `${JSON.stringify(schema, null, 2)}\n`;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const flag = process.argv.indexOf('--out');
  const target = flag < 0 ? SCHEMA_URL : process.argv[flag + 1];
  const text = await readFile(SCHEMA_URL, 'utf-8');
  await writeFile(target, renderSchema(text));
}
