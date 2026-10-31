import type { Shown } from './shown.js';

export type { Shown } from './shown.js';

interface Hidden {
  readonly secret: string;
}

interface Reserved {
  readonly tag: string;
}

export interface View {
  readonly shown: Shown;
  readonly member: Hidden;
  readonly list: readonly Hidden[];
  find(id: Hidden): Shown;
  make(): Promise<Hidden>;
  readonly keys: { [K in keyof Reserved]: string };
}

export function make(): Hidden {
  throw new Error('fixture');
}
