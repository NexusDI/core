/** The contract every generated scale app.ts exports as `scale` (scale spec 4.4). */

export interface ScaleApp<H = unknown> {
  readonly count: number;
  readonly entries: readonly number[];
  readonly target: number;
  /** Library modules this app imports, for the child to load first. */
  readonly packages: readonly string[];
  /**
   * Constructions per provider index, and the kind each construction
   * reported. Every class constructor and factory body ends with
   * `__scaleBuilt(index, kind)`; a factory's product class does not report,
   * so each non-value provider counts exactly one construction and a value
   * counts none.
   */
  readonly built: {
    readonly counts: Uint32Array;
    readonly kinds: readonly (string | undefined)[];
  };
  create(): H | Promise<H>;
  /** Synchronous get by provider index, through a token table built at load. */
  get(handle: H, index: number): unknown;
  /** Only where the graph has async providers and the library resolves them with getAsync. */
  getAsync?(handle: H, index: number): Promise<unknown>;
}
