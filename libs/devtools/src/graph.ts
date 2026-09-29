import type { BlueprintView } from '@nexusdi/core';

/** A line of text a plugin attaches to one provider in the graph. */
export interface GraphNote {
  /** A provider id from the view ('p3'). */
  readonly provider: string;
  readonly label: string;
}

/**
 * Reads the view and returns notes for its providers, for `devtools({ annotate })`
 * and `inspect(root, { annotate })`. A package can match the shape with no
 * import from @nexusdi/devtools. An annotator that throws makes graph() or
 * inspect() throw the same error object, unwrapped.
 */
export type GraphAnnotator = (view: BlueprintView) => readonly GraphNote[];

/** The compiled graph as plain JSON. The docs playground renders it; the graph CLI reads it. */
export interface NexusGraph {
  modules: Array<{
    id: string;
    name: string;
    global: boolean;
    /** Module ids. */
    imports: string[];
    /** Provider ids and module ids. */
    exports: string[];
  }>;
  providers: Array<{
    id: string;
    /** The display name: a class's name or a token's description. */
    token: string;
    /** The owning module's id. */
    module: string;
    /** null for value and alias providers. */
    lifetime: 'singleton' | 'scoped' | 'transient' | null;
    kind: 'class' | 'value' | 'factory' | 'alias';
    eager: boolean;
    /**
     * Factories: whether a build returned a thenable. A singleton or scoped
     * factory reports null before its first build, and a transient factory
     * false until a get() throws NEXUS_ASYNC_TRANSIENT for it. Class and
     * value providers: false. Aliases: null. Every provider in inspect()'s
     * graph: null.
     */
    async: boolean | null;
    /**
     * The annotators' labels for this provider, in annotator order, then in
     * the order each annotator returned them. Empty when none names it.
     */
    notes: string[];
     * A class provider's class name; null for factory, value and alias
     * providers, and for an anonymous class.
     */
    implementation: string | null;
  }>;
  edges: Array<{
    from: string;
    to: string;
    kind: 'required' | 'optional' | 'lazy' | 'all' | 'alias';
  }>;
}

/**
 * Runs `annotate` over `view` and groups the labels by provider id. An id the
 * view lacks keeps its entry here, and graphOf never reads it.
 */
export function notesOf(
  view: BlueprintView,
  annotate: readonly GraphAnnotator[] = [],
): Map<string, string[]> {
  const notes = new Map<string, string[]>();
  for (const annotator of annotate)
    for (const note of annotator(view)) {
      const labels = notes.get(note.provider);
      if (labels === undefined) notes.set(note.provider, [note.label]);
      else labels.push(note.label);
    }
  return notes;
}

/**
 * The graph of `view`. `asyncOf` answers a factory's `async`; null reports
 * every provider's `async` as null, for a graph nothing was built from.
 * `notes` maps a provider id to its labels, as notesOf builds it.
 */
export function graphOf(
  view: BlueprintView,
  asyncOf: ((providerId: string) => boolean | null) | null,
  notes: ReadonlyMap<string, readonly string[]>,
): NexusGraph {
  return {
    modules: view.modules.map((m) => ({
      id: m.id,
      name: m.name,
      global: m.global,
      imports: [...m.imports],
      exports: [...m.exports],
    })),
    providers: view.providers.map((p) => ({
      id: p.id,
      token: p.name,
      module: p.module,
      lifetime: p.lifetime,
      kind: p.kind,
      eager: p.eager,
      async:
        asyncOf === null
          ? null
          : p.kind === 'factory'
            ? asyncOf(p.id)
            : p.kind === 'alias'
              ? null
              : false,
      notes: [...(notes.get(p.id) ?? [])],
      implementation:
        p.implementation === null || p.implementation.name === ''
          ? null
          : p.implementation.name,
    })),
    edges: view.edges.map((e) => ({ from: e.from, to: e.to, kind: e.kind })),
  };
}
