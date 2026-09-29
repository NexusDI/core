import { runInNewContext } from 'node:vm';

/** Keys the expression's object has here that a fresh realm's copy lacks. */
export function extraKeys(expression: string): string[] {
  const pristine = new Set(
    runInNewContext(`Reflect.ownKeys(${expression}).map(String)`) as string[],
  );
  const current = new Function(
    `return Reflect.ownKeys(${expression}).map(String)`,
  )() as string[];
  return current.filter((key) => !pristine.has(key));
}

/** Every own key and its value or accessors, for the built-ins a container could write to. */
export function snapshotBuiltins(): Record<string, [string, unknown][]> {
  const read = (target: object): [string, unknown][] =>
    Reflect.ownKeys(target).map((key) => {
      const d = Object.getOwnPropertyDescriptor(target, key);
      return [
        String(key),
        d === undefined ? undefined : (d.get ?? d.set ?? d.value),
      ];
    });
  return {
    object: read(Object.prototype),
    function: read(Function.prototype),
    array: read(Array.prototype),
    symbol: read(Symbol),
    globals: Reflect.ownKeys(globalThis).map((key) => [String(key), undefined]),
  };
}
