import { Marker, Panel } from '@nexusdi/meridian-ui';
import type { ReactNode } from 'react';

import './benchmarks.css';

/** The HUD frame every benchmark table sits in: a raised panel with a corner mark above a mono label. */
export function Frame({
  label,
  children,
}: {
  label: string;
  children: ReactNode;
}) {
  return (
    <Panel as="section" raised className="nexus-bench">
      <p className="nexus-bench__label">
        <Marker shape="corner" /> {label}
      </p>
      {children}
    </Panel>
  );
}
