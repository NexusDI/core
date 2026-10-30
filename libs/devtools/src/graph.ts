import {
  REQUEST,
  displayName,
  type BlueprintView,
  type CheckReport,
} from '@nexusdi/core';

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
    /** Module ids: the imports the module declares, then the ids a load grant added. */
    imports: string[];
    /**
     * Module ids a load grant added to `imports` beyond the module's own
     * imports, in grant order. A granted module the module already imports
     * stays out of it. toDot and toMermaid draw a grant as a dashed edge and
     * the other imports as solid edges. A graph file written before grants
     * existed has no such field; parseGraph reads it as [].
     */
    grants: string[];
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
    /**
     * The display names of the optional deps and properties that bound to
     * no provider, such as an optional() dep with no provider, from core's
     * ProviderView.unresolved.
     * A graph file written before the field existed has none; parseGraph
     * reads it as [].
     */
    unresolved: string[];
    /**
     * A class provider's class name; null for factory, value and alias
     * providers, and for an anonymous class.
     */
    implementation: string | null;
    /**
     * Plumbing every graph lists, such as core's REQUEST. toDot and
     * toMermaid draw it only when a drawn provider depends on it.
     */
    internal: boolean;
  }>;
  edges: Array<{
    from: string;
    to: string;
    kind: 'required' | 'optional' | 'lazy' | 'all' | 'alias';
  }>;
  /**
   * The configurable modules whose options Nexus.check could not judge,
   * from its CheckReport, in compile order: `module` is the module's name
   * and `reason` is core's, `'async-schema'` or `'for-root-async'`. Only
   * Nexus.create validates their options. graph() of a running container
   * lists none, since create validated every module's options. Core may
   * add a reason in a minor release; handle one you do not know. A graph
   * file written before the field existed has none; parseGraph reads it as
   * [].
   */
  unchecked: Array<{
    module: string;
    reason: CheckReport['unchecked'][number]['reason'];
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
 * `unchecked` is Nexus.check's report; graph() passes [].
 */
export function graphOf(
  view: BlueprintView,
  asyncOf: ((providerId: string) => boolean | null) | null,
  notes: ReadonlyMap<string, readonly string[]>,
  unchecked: CheckReport['unchecked'],
): NexusGraph {
  return {
    modules: view.modules.map((m) => ({
      id: m.id,
      name: m.name,
      global: m.global,
      imports: [...m.imports],
      grants: [...m.grants],
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
      unresolved: p.unresolved.map((u) => displayName(u.written)),
      implementation:
        p.implementation === null || p.implementation.name === ''
          ? null
          : p.implementation.name,
      internal: p.token === REQUEST,
    })),
    edges: view.edges.map((e) => ({ from: e.from, to: e.to, kind: e.kind })),
    unchecked: unchecked.map((u) => ({ module: u.module, reason: u.reason })),
  };
}
