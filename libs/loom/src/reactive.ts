import type { ReactiveStream } from './types.js';

/**
 * Implementation of a reactive stream for multi-value providers
 */
export class Stream<T> implements ReactiveStream<T> {
  private subscribers = new Set<(value: T) => void>();
  private _closed = false;

  /**
   * Subscribe to value changes
   */
  subscribe(callback: (value: T) => void): () => void {
    if (this._closed) {
      throw new Error('Cannot subscribe to a closed stream');
    }

    this.subscribers.add(callback);

    // Return unsubscribe function
    return () => {
      this.subscribers.delete(callback);
    };
  }

  /**
   * Unsubscribe a specific callback
   */
  unsubscribe(callback: (value: T) => void): void {
    this.subscribers.delete(callback);
  }

  /**
   * Emit a new value to all subscribers
   */
  emit(value: T): void {
    if (this._closed) {
      throw new Error('Cannot emit to a closed stream');
    }

    for (const callback of this.subscribers) {
      try {
        callback(value);
      } catch (error) {
        console.error('Error in stream subscriber:', error);
      }
    }
  }

  /**
   * Close the stream and remove all subscribers
   */
  close(): void {
    this._closed = true;
    this.subscribers.clear();
  }

  /**
   * Check if the stream is closed
   */
  get closed(): boolean {
    return this._closed;
  }

  /**
   * Get the number of active subscribers
   */
  get subscriberCount(): number {
    return this.subscribers.size;
  }
}

/**
 * Create a new reactive stream
 */
export function createStream<T>(): Stream<T> {
  return new Stream<T>();
}

/**
 * Transform a stream with a mapping function
 */
export function map<T, U>(
  stream: ReactiveStream<T>,
  mapper: (value: T) => U
): ReactiveStream<U> {
  const mappedStream = new Stream<U>();

  stream.subscribe((value) => {
    try {
      const mapped = mapper(value);
      mappedStream.emit(mapped);
    } catch (error) {
      console.error('Error in stream mapper:', error);
    }
  });

  return mappedStream;
}

/**
 * Filter a stream with a predicate function
 */
export function filter<T>(
  stream: ReactiveStream<T>,
  predicate: (value: T) => boolean
): ReactiveStream<T> {
  const filteredStream = new Stream<T>();

  stream.subscribe((value) => {
    try {
      if (predicate(value)) {
        filteredStream.emit(value);
      }
    } catch (error) {
      console.error('Error in stream filter:', error);
    }
  });

  return filteredStream;
}

/**
 * Merge multiple streams into one
 */
export function merge<T>(...streams: ReactiveStream<T>[]): ReactiveStream<T> {
  const mergedStream = new Stream<T>();

  for (const stream of streams) {
    stream.subscribe((value) => {
      mergedStream.emit(value);
    });
  }

  return mergedStream;
}
