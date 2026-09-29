/** A state the compiler and the runtime rule out. A call here means core has a bug. */
export function unreachable(): never {
  throw new Error('@nexusdi/core: internal error');
}
