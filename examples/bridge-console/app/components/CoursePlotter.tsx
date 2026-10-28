import { useState } from 'react';
import { NAV_CHARTS } from '@nexusdi/meridian-systems/charts';
import { useService } from '@nexusdi/react';

/** An input for a star name, with the heading the charts plot to it. */
export function CoursePlotter() {
  const charts = useService(NAV_CHARTS);
  const [to, setTo] = useState('Proxima-b');
  const course = charts.plot(to);
  return (
    <label>
      Plot a course to{' '}
      <input value={to} onChange={(event) => setTo(event.target.value)} />
      <span>{` heading ${course.heading}`}</span>
    </label>
  );
}
