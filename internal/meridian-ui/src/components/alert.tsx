import type { ReactNode } from 'react';

import { Glyph } from './glyph.js';

export interface AlertBannerProps {
  variant: 'banner';
  /** An alarm raises the assertive banner; a warning uses the polite one. */
  kind?: 'alarm' | 'warning';
  /** The alarm code, such as `HYPOXIA`. */
  code: string;
  /** What the code is about, such as `airlock`. */
  subject: string;
  /** The "Acknowledge" button. */
  acknowledge?: ReactNode;
}

export interface AlertDialogProps {
  variant: 'dialog';
  /** A stable id; the title and the message take `<id>-title` and `<id>-message`. */
  id: string;
  title?: string;
  message: ReactNode;
  /** The `Fix:` line of a refused command. */
  fix?: ReactNode;
  /** The one primary button. */
  action?: ReactNode;
}

export type AlertProps = AlertBannerProps | AlertDialogProps;

export interface AlertRegionProps {
  children?: ReactNode;
}

/**
 * The polite live region that warning banners render into. Screen readers
 * announce changes inside a live region that was in the page before the change,
 * and often skip one that mounts with its text in place, so the app mounts
 * `AlertRegion` once, empty, and renders every warning `Alert` as its child.
 */
export function AlertRegion({ children }: AlertRegionProps) {
  return (
    <div
      className="meridian-alert-region"
      role="status"
      aria-live="polite"
      aria-atomic="false"
    >
      {children}
    </div>
  );
}

/**
 * An alarm in two sizes (design system spec section 7.6). The banner sits
 * across the top of a screen or the page. An alarm banner is `role="alert"`,
 * which announces it assertively when it appears. A warning banner has no live
 * role of its own and is announced by the `AlertRegion` that holds it. The dialog is the plate for a refused command. The
 * app owns the modal behaviour: the focus trap, the scrim's dismissal and the
 * return of focus.
 */
export function Alert(props: AlertProps) {
  if (props.variant === 'dialog') {
    const { id, title = 'Command refused', message, fix, action } = props;

    return (
      <div
        className="meridian-alert meridian-alert--dialog"
        role="alertdialog"
        aria-modal="true"
        aria-labelledby={`${id}-title`}
        aria-describedby={`${id}-message`}
      >
        <p className="meridian-alert__title" id={`${id}-title`}>
          {title}
        </p>
        <div className="meridian-alert__message" id={`${id}-message`}>
          {message}
        </div>
        {fix ? <p className="meridian-alert__fix">Fix: {fix}</p> : null}
        {action ? (
          <div className="meridian-alert__actions">{action}</div>
        ) : null}
      </div>
    );
  }

  const { kind = 'alarm', code, subject, acknowledge } = props;
  const alarm = kind === 'alarm';

  return (
    <div
      className={`meridian-alert meridian-alert--banner meridian-alert--${kind}`}
      {...(alarm
        ? { role: 'alert', 'aria-live': 'assertive', 'aria-atomic': true }
        : {})}
    >
      <Glyph name={alarm ? 'filled-diamond' : 'triangle'} />
      <p className="meridian-alert__text">
        <span className="meridian-alert__code">{code}</span> in{' '}
        <span className="meridian-alert__subject">{subject}</span>
      </p>
      {acknowledge ? (
        <div className="meridian-alert__actions">{acknowledge}</div>
      ) : null}
    </div>
  );
}
