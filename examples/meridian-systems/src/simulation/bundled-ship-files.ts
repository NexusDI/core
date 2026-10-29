import calibration from '../../deck/sensors.calibration.json' with { type: 'json' };

import type { IShipFiles } from './contracts';

/** The files the library bundles, by name. */
const BUNDLED: Readonly<Record<string, unknown>> = {
  'sensors.calibration.json': calibration,
};

/**
 * The ship's files from the copies the library bundles, with no I/O, so a
 * Worker reads them at module scope. `Simulation` reads them when its options
 * name no other files.
 */
export class BundledShipFiles implements IShipFiles {
  async read(name: string): Promise<unknown> {
    if (!Object.hasOwn(BUNDLED, name)) {
      throw new Error(
        `The ship carries no file '${name}'. It carries ${Object.keys(BUNDLED).join(', ')}.`,
      );
    }
    return BUNDLED[name];
  }
}
