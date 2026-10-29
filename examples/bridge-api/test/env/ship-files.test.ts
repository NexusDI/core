import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import calibration from '@nexusdi/meridian-systems/deck/sensors.calibration.json' with { type: 'json' };
import { describe, expect, it } from 'vitest';

import { NodeShipFiles, shipFilesDir } from '../../src/env/ship-files';

describe('NodeShipFiles', () => {
  it('reads the calibration from the library deck folder on disk', async () => {
    await expect(
      new NodeShipFiles(shipFilesDir()).read('sensors.calibration.json'),
    ).resolves.toEqual(calibration);
  });

  it('reads a file from the folder it is given', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'ship-files-'));
    try {
      await writeFile(join(dir, 'probe.json'), '{"resolution":1}');
      await expect(new NodeShipFiles(dir).read('probe.json')).resolves.toEqual({
        resolution: 1,
      });
    } finally {
      await rm(dir, { recursive: true });
    }
  });

  it('rejects with the file name when the file is missing', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'ship-files-'));
    try {
      await expect(new NodeShipFiles(dir).read('missing.json')).rejects.toThrow(
        "The ship cannot read its file 'missing.json'",
      );
    } finally {
      await rm(dir, { recursive: true });
    }
  });

  it('reads a name that starts with two dots inside the folder', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'ship-files-'));
    try {
      await writeFile(join(dir, '..probe.json'), '[1]');
      await expect(
        new NodeShipFiles(dir).read('..probe.json'),
      ).resolves.toEqual([1]);
    } finally {
      await rm(dir, { recursive: true });
    }
  });

  it('refuses a name that leaves the folder', async () => {
    await expect(
      new NodeShipFiles(shipFilesDir()).read('../package.json'),
    ).rejects.toThrow(
      "The ship file name '../package.json' leaves its folder.",
    );
  });
});
