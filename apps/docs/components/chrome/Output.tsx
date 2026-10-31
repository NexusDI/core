import { ConsoleFrame } from '@nexusdi/meridian-ui';
import type { ReactNode } from 'react';

/**
 * Program output and error messages (site UX spec 13.3, design system 7.2):
 * a terminal, which stays dark in both themes. An author writes
 * `<Output title="Output of error.ts">` around the text the program prints. A
 * fence of shell commands stays a fence and follows the theme.
 */
export default function Output({
  title = 'Output',
  children,
}: {
  title?: string;
  children: ReactNode;
}) {
  return (
    <ConsoleFrame title={title} className="meridian-terminal nexus-output">
      <pre className="nexus-output__text" tabIndex={0}>
        {children}
      </pre>
    </ConsoleFrame>
  );
}
