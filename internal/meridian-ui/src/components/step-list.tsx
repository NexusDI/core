import type { ReactNode } from 'react';

import { cx } from './class-names.js';

export interface Step {
  /** Names the step in the `current` prop and keys the item. */
  id: string;
  label: ReactNode;
}

export interface StepListProps {
  steps: readonly Step[];
  /** The `id` of the step in progress. Earlier steps read as done. */
  current?: string;
  className?: string;
}

/**
 * The ordered steps of a sequence. The item of `current` carries
 * `aria-current="step"`; the stylesheet marks done steps with a check and
 * the current one with a bar, so colour does not carry the position.
 */
export function StepList({ steps, current, className }: StepListProps) {
  const at = steps.findIndex((step) => step.id === current);
  return (
    <ol className={cx('meridian-steps', className)}>
      {steps.map((step, index) => {
        const state =
          at < 0
            ? 'todo'
            : index < at
              ? 'done'
              : index === at
                ? 'current'
                : 'todo';
        return (
          <li
            key={step.id}
            className={`meridian-steps__item meridian-steps__item--${state}`}
            aria-current={state === 'current' ? 'step' : undefined}
          >
            {step.label}
          </li>
        );
      })}
    </ol>
  );
}
