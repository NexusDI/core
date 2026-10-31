import type { ChangeEventHandler, ReactNode } from 'react';

import { cx } from './class-names.js';

export interface SwitchProps {
  /** Submitted with the form, so the switch works with no JavaScript. */
  name: string;
  /** Submitted when the switch is on. */
  value: string;
  /** The placard beside the rocker. */
  label: ReactNode;
  /** The state word shown when the switch is on, such as "charged". */
  onWord: string;
  /** The state word shown when it is off, such as "idle". */
  offWord: string;
  checked?: boolean;
  defaultChecked?: boolean;
  disabled?: boolean;
  onChange?: ChangeEventHandler<HTMLInputElement>;
  id?: string;
  className?: string;
}

/**
 * The two-position rocker of design system spec 7.4, as a form checkbox. The
 * input carries `role="switch"`. The stylesheet shows one state word at a
 * time from `:checked`, so the markup needs no state and the page needs no
 * script. The rocker moves its lit half, so the position shows without the
 * hue.
 */
export function Switch({
  name,
  value,
  label,
  onWord,
  offWord,
  checked,
  defaultChecked,
  disabled,
  onChange,
  id,
  className,
}: SwitchProps) {
  return (
    <label className={cx('meridian-switch', className)}>
      <input
        className="meridian-switch__input"
        type="checkbox"
        role="switch"
        id={id}
        name={name}
        value={value}
        checked={checked}
        defaultChecked={defaultChecked}
        disabled={disabled}
        onChange={onChange}
      />
      <span className="meridian-switch__rocker" aria-hidden="true" />
      <span className="meridian-switch__label">{label}</span>
      <span className="meridian-switch__word meridian-switch__word--on">
        {onWord}
      </span>
      <span className="meridian-switch__word meridian-switch__word--off">
        {offWord}
      </span>
    </label>
  );
}
