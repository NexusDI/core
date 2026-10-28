/** One subscription, so an item added twice is held twice. */
interface Entry<T> {
  readonly item: T;
}

/**
 * The items subscribed to one source, in the order they were added. Iterating
 * walks the items present when the iteration began and skips one removed
 * since, so an item added during the iteration first appears in the next one.
 */
export class Subscribers<T> implements Iterable<T> {
  private readonly entries = new Set<Entry<T>>();

  get size(): number {
    return this.entries.size;
  }

  /** Adds `item` and returns the function that removes this addition alone. */
  add(item: T): () => void {
    const entry: Entry<T> = { item };
    this.entries.add(entry);
    return () => {
      this.entries.delete(entry);
    };
  }

  clear(): void {
    this.entries.clear();
  }

  *[Symbol.iterator](): Generator<T> {
    for (const entry of [...this.entries]) {
      if (this.entries.has(entry)) yield entry.item;
    }
  }
}
