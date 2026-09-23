/**
 * What one container (the root or a scope) has built, per provider id.
 *
 * `built` holds the instance, or the promise of it while an async factory is
 * in flight. `settled` says the entry is an instance. `ready` says the
 * provider is built and, during create or load, its onInit has settled. Every
 * check uses `Map.has`, never truthiness, so a falsy singleton is built once.
 */
export class Slots {
  readonly #built = new Map<string, unknown>();
  readonly #settled = new Set<string>();
  readonly #ready = new Set<string>();

  has(id: string): boolean {
    return this.#built.has(id);
  }

  isSettled(id: string): boolean {
    return this.#settled.has(id);
  }

  isReady(id: string): boolean {
    return this.#ready.has(id);
  }

  value(id: string): unknown {
    return this.#built.get(id);
  }

  begin(id: string, pending: Promise<unknown>): void {
    this.#built.set(id, pending);
  }

  settle(id: string, value: unknown): void {
    this.#built.set(id, value);
    this.#settled.add(id);
  }

  markReady(id: string): void {
    this.#ready.add(id);
  }

  abandon(id: string): void {
    this.#built.delete(id);
    this.#settled.delete(id);
    this.#ready.delete(id);
  }
}
