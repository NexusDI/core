import type { ButtonHTMLAttributes, ReactNode } from 'react';

import { cx } from './class-names.js';

export type ButtonVariant = 'primary' | 'secondary' | 'hazard' | 'quiet';

interface ButtonBase extends Omit<
  ButtonHTMLAttributes<HTMLButtonElement>,
  'className' | 'children' | 'disabled' | 'id'
> {
  variant?: ButtonVariant;
  /** The 32px height of the deck's dense toolbars. */
  dense?: boolean;
  /**
   * A disabled button stays in the tab order and uses `aria-disabled` with its
   * reason, so a screen reader finds it and reads why. Its click does nothing
   * while it is disabled.
   */
  focusable?: boolean;
  className?: string;
  children?: ReactNode;
}

export type ButtonProps = ButtonBase &
  (
    | { disabled?: false; reason?: never; id?: string }
    /**
     * A disabled button states why, beside it, such as "Launch is locked until
     * the check passes". The reason prints only while `disabled` is true, and it
     * needs an `id` so the button can point at it.
     */
    | { disabled: boolean; reason: string; id: string }
  );

/**
 * A button with one of four faces (design system spec section 7.4). The label
 * is a placard that names the result. A disabled button keeps its shape and
 * states why beside it. It is never chamfered, since it takes focus.
 */
export function Button({
  variant = 'secondary',
  dense = false,
  focusable = false,
  onClick,
  className,
  children,
  type = 'button',
  reason,
  id,
  disabled,
  ...rest
}: ButtonProps) {
  const why = disabled ? reason : undefined;
  const button = (
    <button
      {...rest}
      id={id}
      disabled={focusable ? undefined : disabled}
      aria-disabled={focusable && disabled ? true : undefined}
      onClick={focusable && disabled ? undefined : onClick}
      type={type}
      {...(why ? { 'aria-describedby': `${id}-reason` } : {})}
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

  if (!why) return button;

  return (
    <span className="meridian-button__group">
      {button}
      <span className="meridian-button__reason" id={`${id}-reason`}>
        {why}
      </span>
    </span>
  );
}
