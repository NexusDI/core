import { describe, expect, it, vi } from 'vitest';

import { deferred } from '../../test-support/deferred.js';
import { defineModule } from '../definitions/define-module.js';
import { loadOnce } from './load-once.js';
import { Nexus } from './nexus.js';

const Engineering = defineModule({ name: 'Engineering' });
const Telemetry = defineModule({ name: 'Telemetry' });
const Science = defineModule({ name: 'Science' });
const Meridian = defineModule({
  name: 'Meridian',
  imports: [Engineering, Telemetry],
});

describe('loadOnce', () => {
  it('calls load() once per module and shares the pending promise', async () => {
    const ship = await Nexus.create(Meridian);
    const gate = deferred<void>();
    const load = vi.spyOn(ship, 'load').mockReturnValue(gate.promise);
    const once = loadOnce(ship);
    const first = once(Science);
    const second = once(Science);
    expect(load).toHaveBeenCalledTimes(1);
    expect(second).toBe(first);
    gate.resolve();
    await first;
    await once(Science);
    expect(load).toHaveBeenCalledTimes(1);
  });

  it('returns one function per container', async () => {
    const ship = await Nexus.create(Meridian);
    const other = await Nexus.create(Meridian);
    expect(loadOnce(ship)).toBe(loadOnce(ship));
    expect(loadOnce(other)).not.toBe(loadOnce(ship));
  });

  it('keys on the granted set, ignoring order and duplicates', async () => {
    const ship = await Nexus.create(Meridian);
    const load = vi.spyOn(ship, 'load').mockResolvedValue(undefined);
    const once = loadOnce(ship);
    await once(Science, { imports: [Engineering, Telemetry] });
    await once(Science, { imports: [Telemetry, Engineering] });
    await once(Science, { imports: [Telemetry, Engineering, Telemetry] });
    expect(load).toHaveBeenCalledTimes(1);
    await once(Science, { imports: [Engineering] });
    expect(load).toHaveBeenCalledTimes(2);
  });

  it('treats no options and an empty grant as the same key', async () => {
    const ship = await Nexus.create(Meridian);
    const load = vi.spyOn(ship, 'load').mockResolvedValue(undefined);
    const once = loadOnce(ship);
    await once(Science);
    await once(Science, {});
    await once(Science, { imports: [] });
    expect(load).toHaveBeenCalledTimes(1);
  });

  it('passes the options to load()', async () => {
    const ship = await Nexus.create(Meridian);
    const load = vi.spyOn(ship, 'load').mockResolvedValue(undefined);
    const options = { imports: [Engineering] };
    await loadOnce(ship)(Science, options);
    expect(load).toHaveBeenCalledWith(Science, options);
  });

  it('forgets a failed load, so a later call retries', async () => {
    const ship = await Nexus.create(Meridian);
    const failure = new Error('offline');
    const load = vi
      .spyOn(ship, 'load')
      .mockRejectedValueOnce(failure)
      .mockResolvedValue(undefined);
    const once = loadOnce(ship);
    await expect(once(Science)).rejects.toBe(failure);
    await once(Science);
    await once(Science);
    expect(load).toHaveBeenCalledTimes(2);
  });
});
