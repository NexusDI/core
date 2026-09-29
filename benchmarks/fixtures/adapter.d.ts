/** The contract every fixture exports as `adapter` (spec 4.4). */

export type Name =
  | 'bridge'
  | 'computer'
  | 'charts'
  | 'shield'
  | 'router'
  | 'reactor'
  | 'drone'
  | 'flightLog';
export interface Ship {
  get(name: Name): { readonly kind: string } & Record<string, unknown>;
}
export interface ScopeHandle extends Ship {
  close(): void | Promise<void>;
}
export interface Adapter {
  /** Lifetimes the library documents; the others print 'not-applicable'. */
  readonly lifetimes: ReadonlyArray<'singleton' | 'transient' | 'scoped'>;
  ready(): Ship | Promise<Ship>;
  scope?(ship: Ship): ScopeHandle | Promise<ScopeHandle>;
  dispose?(ship: Ship): void | Promise<void>;
}
