/**
 * Which projects sit in a folder that does not carry their package name.
 *
 * A project's folder basename is its unscoped package name:
 * `@nexusdi/core` lives at `libs/core`. Two things in this repository depend
 * on that holding, and neither says so.
 *
 * `nx.json` releases by directory glob -- `libs/*` -- so a reader deciding
 * whether a package is published, or whether a change to it triggers a
 * release, does it by looking at where the folder is and reading its name. A
 * folder whose name is not the package's makes that answer require opening
 * `package.json` instead.
 *
 * The scope is dropped because the directory a project sits in already
 * carries it: every package here is `@nexusdi/`, and repeating it in every
 * folder name says nothing.
 *
 * The IO is passed in so the rule can be asserted against fixtures: this
 * repository holds the invariant today, so reading only this repository tests
 * nothing about the rule.
 */

export interface Project {
  /** The package name as `package.json` spells it, scope included. */
  name: string;
  /** The project's directory, relative to the workspace root. */
  root: string;
}

export interface Mismatch extends Project {
  /** The basename `root` has. */
  folder: string;
  /** The basename it would have to have. */
  expected: string;
}

/** A package name with its `@scope/` prefix removed. */
export function unscoped(name: string): string {
  const slash = name.indexOf('/');

  return name.startsWith('@') && slash !== -1 ? name.slice(slash + 1) : name;
}

/** The last path segment of `root`, with a trailing slash tolerated. */
function basename(root: string): string {
  const segments = root.split('/').filter((segment) => segment !== '');

  return segments[segments.length - 1] ?? '';
}

/** Every project whose folder basename is not its unscoped package name. */
export function misnamedFolders(projects: readonly Project[]): Mismatch[] {
  return projects
    .map((project) => ({
      ...project,
      folder: basename(project.root),
      expected: unscoped(project.name),
    }))
    .filter((project) => project.folder !== project.expected)
    .sort((a, b) => a.root.localeCompare(b.root));
}
