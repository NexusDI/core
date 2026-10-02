import type { ReactNode } from 'react';

export interface ConsoleFrameProps {
  title: string;
  tabs?: ReactNode;
  actions?: ReactNode;
  children?: ReactNode;
}

/**
 * The console's chrome: a title row, a tab strip slot, an actions slot and a
 * body. The docs app owns the state (section tracking, tabs, runs).
 */
export function ConsoleFrame({
  title,
  tabs,
  actions,
  children,
}: ConsoleFrameProps) {
  return (
    <section className="meridian-console" aria-label={title}>
      <header className="meridian-console__head">
        <p className="meridian-console__title">{title}</p>
        {tabs ? <div className="meridian-console__tabs">{tabs}</div> : null}
        {actions ? (
          <div className="meridian-console__actions">{actions}</div>
        ) : null}
      </header>
      <div className="meridian-console__body">{children}</div>
    </section>
  );
}
