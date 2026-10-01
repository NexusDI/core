import type { ReactNode } from 'react';

/**
 * A figure with its detail lines in a tooltip that hover and keyboard focus
 * open, with no script: the pages are a static export.
 */
export function Detail({
  id,
  lines,
  children,
}: {
  id: string;
  lines: string[];
  children: ReactNode;
}) {
  if (lines.length === 0) return <>{children}</>;
  return (
    <span className="nexus-bench__detail">
      <span tabIndex={0} aria-describedby={id}>
        {children}
      </span>
      <span role="tooltip" id={id} className="nexus-bench__tooltip">
        {lines.map((line) => (
          <span key={line}>{line}</span>
        ))}
      </span>
    </span>
  );
}
