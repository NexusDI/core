import { describe, expect, it } from 'vitest';

import calibration from '../../deck/sensors.calibration.json';

import { BundledShipFiles } from './bundled-ship-files';

describe('BundledShipFiles', () => {
  it('reads the calibration file the library bundles', async () => {
    await expect(
      new BundledShipFiles().read('sensors.calibration.json'),
    ).resolves.toEqual(calibration);
  });

  it('refuses a file it does not bundle and names it', async () => {
    await expect(new BundledShipFiles().read('reactor.log')).rejects.toThrow(
      "The ship carries no file 'reactor.log'. It carries sensors.calibration.json.",
    );
  });
});
