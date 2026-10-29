import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { dirname, isAbsolute, join, relative, sep } from 'node:path';

import type { IShipFiles } from '@nexusdi/meridian-systems';

/** The folder of the deck files that `@nexusdi/meridian-systems` ships. */
export function shipFilesDir(): string {
  return dirname(
    createRequire(import.meta.url).resolve(
      '@nexusdi/meridian-systems/deck/sensors.calibration.json',
    ),
  );
}

/**
 * The ship's files from a folder on disk, read with `node:fs/promises` when
 * the ship starts. A Worker has no file system, so it keeps the bundled
 * copies the library reads by default.
 */
export class NodeShipFiles implements IShipFiles {
  constructor(private readonly dir: string) {}

  async read(name: string): Promise<unknown> {
    const path = join(this.dir, name);
    const inside = relative(this.dir, path);
    if (
      inside === '..' ||
      inside.startsWith(`..${sep}`) ||
      isAbsolute(inside)
    ) {
      throw new Error(`The ship file name '${name}' leaves its folder.`);
    }
    let text: string;
    try {
      text = await readFile(path, 'utf8');
    } catch (cause) {
      throw new Error(
        `The ship cannot read its file '${name}' in ${this.dir}.`,
        {
          cause,
        },
      );
    }
    return JSON.parse(text);
  }
}
