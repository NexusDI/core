import type { ButtonHTMLAttributes, ReactNode } from 'react';

import { cx } from './class-names.js';

export type ButtonVariant = 'primary' | 'secondary' | 'hazard' | 'quiet';

interface ButtonBase extends Omit<
  ButtonHTMLAttributes<HTMLButtonElement>,
  'className' | 'children'
> {
  variant?: ButtonVariant;
  /** The 32px height of the deck's dense toolbars. */
  dense?: boolean;
  className?: string;
  children?: ReactNode;
}

export type ButtonProps = ButtonBase &
  (
    | { reason?: undefined }
    /**
     * Why the button is disabled, printed beside it, such as "Launch is locked
     * until the check passes". It needs an `id` so the button can point at it.
     */
    | { reason: string; id: string; disabled: true }
  );

/**
 * A button with one of four faces (design system spec section 7.4). The label
 * is a placard that names the result. A disabled button keeps its shape and
 * states why beside it. It is never chamfered, since it takes focus.
 */
export function Button({
  variant = 'secondary',
  dense = false,
  className,
  children,
  type = 'button',
  reason,
  id,
  ...rest
}: ButtonProps) {
  const button = (
    <button
      {...rest}
      id={id}
      type={type}
      {...(reason ? { 'aria-describedby': `${id}-reason` } : {})}
      className={cx(
        'meridian-button',
        `meridian-button--${variant}`,
        dense && 'meridian-button--dense',
        className,
      )}
    >
      {children}
    </button>
  );

  if (!reason) return button;

  return (
    <span className="meridian-button__group">
      {button}
      <span className="meridian-button__reason" id={`${id}-reason`}>
        {reason}
      </span>
    </span>
  );
}
