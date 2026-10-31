import type { Shown } from './shown.js';

export type { Shown } from './shown.js';

export interface Own {
  readonly id: string;
}

interface Hidden {
  readonly secret: string;
}

export interface View<T = unknown> {
  readonly shown: Shown;
  readonly list: readonly Shown[];
  readonly value: T;
  find(id: string): Shown | undefined;
  readonly self: Own;
}

export class Holder {
  readonly shown: Shown | undefined;
  private readonly internal: Hidden | undefined;
}

export function make(view: View): Shown {
  return view.shown;
}
