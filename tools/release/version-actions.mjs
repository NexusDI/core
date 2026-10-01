/**
 * nx's version actions for every published package (nx.json
 * release.version.versionActions): @nx/js's, plus one step. When nx writes a
 * package's new version to its package.json, this pins the repo URLs in its
 * README to the new release tag in the same tree (lib.mjs pinRepoUrls). nx
 * stages the tree's changes, so the release commit, and the tag on it, carry
 * READMEs that name that tag.
 */
import { createRequire } from 'node:module';
import { posix } from 'node:path';

import { pinRepoUrls } from './lib.mjs';

// @nx/js's module is CommonJS with the class on `default`. Requiring it
// reads that the same way under node and vitest, whose interop on an ESM
// default import differs.
const { default: JsVersionActions, afterAllProjectsVersioned } = createRequire(
  import.meta.url,
)('@nx/js/src/release/version-actions');

export default class NexusVersionActions extends JsVersionActions {
  async updateProjectVersion(tree, newVersion) {
    const logs = await super.updateProjectVersion(tree, newVersion);
    const path = posix.join(this.projectGraphNode.data.root, 'README.md');
    if (!tree.exists(path)) return logs;
    const before = tree.read(path, 'utf-8');
    const after = pinRepoUrls(before, newVersion);
    if (after !== before) {
      tree.write(path, after);
      logs.push(`Pinned repo URLs in ${path} to ${newVersion}`);
    }
    return logs;
  }
}

// nx runs it once after every project is versioned: it updates the lockfile.
export { afterAllProjectsVersioned };
