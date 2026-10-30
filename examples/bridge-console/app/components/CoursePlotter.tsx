import { useState } from 'react';
import type { Course } from '@nexusdi/meridian-systems/charts';

/**
 * An input for a star name, with the heading the charts plot to it. `plot`
 * answers a course or `{ refused }` with the reason, and the component shows
 * either. It calls `plot` on every keystroke, so `plot` must not throw.
 */
export function CoursePlotter({
  plot,
}: {
  plot: (to: string) => Course | { refused: string };
}) {
  const [to, setTo] = useState('Proxima-b');
  const course = plot(to);
  return (
    <label>
      Plot a course to{' '}
      <input value={to} onChange={(event) => setTo(event.target.value)} />
      <span>
        {'refused' in course
          ? ` ${course.refused}`
          : ` heading ${course.heading}`}
      </span>
    </label>
  );
}
