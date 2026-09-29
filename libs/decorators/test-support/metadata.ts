/**
 * Reads back what the decorators wrote, the way core's compiler does: the
 * class's own metadata object first, then each parent's, under the
 * Symbol.for keys core reads (SEC-201).
 */

const INJECTABLE = Symbol.for('nexusdi.injectable');
const PROPS = Symbol.for('nexusdi.props');

type Metadata = Record<PropertyKey, unknown>;
type Prop = { readonly key: string | symbol; readonly dep: unknown };

/** The class's metadata objects, own first, stopping before Object.prototype. */
function levels(cls: object): Metadata[] {
  const found: Metadata[] = [];
  let level = (cls as { [Symbol.metadata]?: Metadata | null })[Symbol.metadata];
  for (
    ;
    level && level !== Object.prototype;
    level = Object.getPrototypeOf(level)
  )
    found.push(level);
  return found;
}

/** The nearest deps and lifetime @Injectable recorded for `cls`. */
export const readInjectable = (
  cls: object,
):
  | { readonly deps?: readonly unknown[]; readonly lifetime?: unknown }
  | undefined =>
  levels(cls).find((level) => Object.hasOwn(level, INJECTABLE))?.[
    INJECTABLE
  ] as { deps?: unknown[]; lifetime?: unknown } | undefined;

/** Every property injection @Inject recorded for `cls`, parents first. */
export const readProps = (cls: object): readonly Prop[] =>
  levels(cls)
    .reverse()
    .flatMap((level) =>
      Object.hasOwn(level, PROPS) ? (level[PROPS] as Prop[]) : [],
    );
