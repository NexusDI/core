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
  title?: string;
  message: ReactNode;
  /** The `Fix:` line of a refused command. */
  fix?: ReactNode;
  /** The one primary button. */
  action?: ReactNode;
}

export type AlertProps = AlertBannerProps | AlertDialogProps;

/**
 * An alarm in two sizes (design system spec section 7.6). The banner sits
 * across the top of a screen or the page, and its live region announces it
 * once when it appears: `role="alert"` is assertive for an alarm and `status`
 * is polite for a warning. The dialog is the plate for a refused command. The
 * app owns the modal behaviour: the focus trap, the scrim's dismissal and the
 * return of focus.
 */
export function Alert(props: AlertProps) {
  if (props.variant === 'dialog') {
    const { title = 'Command refused', message, fix, action } = props;

    return (
      <div
        className="meridian-alert meridian-alert--dialog"
        role="alertdialog"
        aria-modal="true"
        aria-label={title}
      >
        <p className="meridian-alert__title">{title}</p>
        <div className="meridian-alert__message">{message}</div>
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
      role={alarm ? 'alert' : 'status'}
      aria-live={alarm ? 'assertive' : 'polite'}
      aria-atomic="true"
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
