import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { useService } from '@nexusdi/react';
import type { ShipReading } from '@nexusdi/meridian-systems';

import { TELEMETRY_CLIENT } from '../di/contracts';

/**
 * The snapshot until a frame arrives, then each frame; null once the stream
 * goes offline, until the loader hands a new snapshot. The higher tick wins, so
 * an action's stale revalidation never overwrites a newer frame. On a tie the
 * value that arrived last wins: a frame wins when no new snapshot came after
 * it, and a revalidated snapshot at the frame's tick wins when it came later,
 * as after an action that changes state without a tick. A new snapshot
 * object after the stream went offline (a revalidation once bridge-api is back)
 * drops the offline state and the old frame, and subscribes again.
 */
export function useShipReading(
  snapshot: ShipReading | null,
): ShipReading | null {
  const telemetry = useService(TELEMETRY_CLIENT);
  const [frame, setFrame] = useState<{
    readonly reading: ShipReading;
    readonly over: ShipReading | null;
  } | null>(null);
  const [offlineAt, setOfflineAt] = useState<{
    readonly snapshot: ShipReading | null;
  } | null>(null);
  if (offlineAt !== null && offlineAt.snapshot !== snapshot) {
    setOfflineAt(null);
    setFrame(null);
  }
  const latest = useRef(snapshot);
  // A layout effect runs in the commit, before any event can deliver a frame.
  useLayoutEffect(() => {
    latest.current = snapshot;
  });
  const offline = offlineAt !== null;
  useEffect(() => {
    if (offline) return;
    return telemetry.subscribe(
      (reading) => setFrame({ reading, over: latest.current }),
      () => setOfflineAt({ snapshot: latest.current }),
    );
  }, [telemetry, offline]);
  if (offline) return null;
  if (frame === null) return snapshot;
  if (snapshot === null) return frame.reading;
  if (frame.reading.tick > snapshot.tick) return frame.reading;
  if (frame.reading.tick === snapshot.tick && frame.over === snapshot) {
    return frame.reading;
  }
  return snapshot;
}
