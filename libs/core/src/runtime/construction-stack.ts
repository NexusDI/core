/** One constructor or factory call in progress. */
export interface StackFrame {
  readonly providerId: string;
  readonly container: object;
  readonly name: string;
}

const frames: StackFrame[] = [];

/**
 * What is being built right now. Frames are pushed before a constructor or
 * factory runs and popped in a `finally`, so the stack is exact for
 * synchronous code. An async factory's continuation after `await` runs with an
 * empty stack; its deps were resolved before the call.
 */
export const constructionStack = {
  run<R>(frame: StackFrame, fn: () => R): R {
    frames.push(frame);
    try {
      return fn();
    } finally {
      frames.pop();
    }
  },
  contains(providerId: string, container: object): boolean {
    return frames.some(
      (f) => f.providerId === providerId && f.container === container,
    );
  },
  names(): string[] {
    return frames.map((f) => f.name);
  },
  top(): StackFrame | undefined {
    return frames.at(-1);
  },
  /** The frames from the provider's first frame to the top, closed with the provider's name. */
  cycleFrom(providerId: string, container: object): string[] {
    const start = frames.findIndex(
      (f) => f.providerId === providerId && f.container === container,
    );
    if (start === -1) return [];
    return [...frames.slice(start).map((f) => f.name), frames[start]!.name];
  },
};
