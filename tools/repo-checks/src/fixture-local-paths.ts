/**
 * Which committed fixtures hold a path from a developer's machine.
 *
 * A recorded fixture, such as a `.cpuprofile` from `node --cpu-prof`, keeps
 * the absolute path of every script it saw. The repository is public, so a
 * fixture like that publishes the recorder's user name and folder layout.
 * Rewrite such paths to `file:///app/...`, as
 * `libs/devtools/test-fixtures/profile/node.cpuprofile` does.
 *
 * The files are passed in so the rule can be asserted against inputs built
 * in the test: a committed sabotaged fixture would itself break the rule.
 */

export interface FixtureFile {
  /** The path relative to the workspace root. */
  readonly path: string;
  readonly text: string;
}

const FIXTURE =
  /(^|\/)(test-fixtures|__fixtures__|fixtures)\/|\.cpuprofile$|\.golden\./;

// A home or volume folder with the name under it, a Windows user folder in
// either slash (JSON escapes a backslash as two), or a Claude worktree.
const LOCAL =
  /\/(?:Users|Volumes|home)\/[^/\\"'\s]+|[A-Za-z]:(?:\\{1,2}|\/)Users(?:\\{1,2}|\/)[^/\\"'\s]+|\.claude\/worktrees/;

/** Whether `path` is a fixture: under a fixtures folder, a recorded profile or a golden file. */
export function isFixture(path: string): boolean {
  return FIXTURE.test(path);
}

/** One line per file that holds a local path, naming the first one it holds. */
export function localPaths(files: readonly FixtureFile[]): string[] {
  const found: string[] = [];
  for (const { path, text } of files) {
    const match = LOCAL.exec(text);
    if (match !== null) found.push(`${path} holds ${match[0]}`);
  }
  return found;
}
