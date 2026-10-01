/**
 * The decisions of the release workflow, as pure functions (release spec
 * sections 5 and 6). tools/release/plan.mjs, sync.mjs, reconcile.mjs and
 * notes.mjs gather facts from git, GitHub and npm and hand them here, so
 * every rule can be tested without a repository or a registry.
 */

/** The tag every release carries. nx interpolates only {version} for a fixed group. */
const TAG_PREFIX = '@nexusdi/core@';

/** Each event and the kinds of ref it runs on (spec section 6.1). */
export const EVENTS = {
  rc: ['release'],
  stable: ['release'],
  patch: ['main', 'maintenance'],
  sync: ['release'],
  resume: ['main', 'release', 'maintenance'],
};

const REF_NAMES = {
  main: 'main',
  release: 'release/X.Y',
  maintenance: 'X.Y.x',
};

const VERSION =
  /^(\d+)\.(\d+)\.(\d+)(?:-([0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*))?$/;

/** What a branch name means to the workflow. */
export function refKind(ref) {
  if (ref === 'main') return { kind: 'main' };
  let match = /^release\/(\d+)\.(\d+)$/.exec(ref);
  if (match) return { kind: 'release', line: `${match[1]}.${match[2]}` };
  match = /^(\d+)\.(\d+)\.x$/.exec(ref);
  if (match) return { kind: 'maintenance', line: `${match[1]}.${match[2]}` };
  return { kind: 'other' };
}

function parseVersion(version) {
  const match = VERSION.exec(version);
  if (!match) return null;
  return {
    major: Number(match[1]),
    minor: Number(match[2]),
    patch: Number(match[3]),
    pre: match[4] ? match[4].split('.') : [],
  };
}

function lineOf(version) {
  const parsed = parseVersion(version);
  return parsed ? `${parsed.major}.${parsed.minor}` : null;
}

function isStable(version) {
  const parsed = parseVersion(version);
  return parsed !== null && parsed.pre.length === 0;
}

function compareIdentifiers(a, b) {
  const numA = /^\d+$/.test(a);
  const numB = /^\d+$/.test(b);
  if (numA && numB) return Number(a) - Number(b);
  if (numA) return -1;
  if (numB) return 1;
  return a < b ? -1 : a > b ? 1 : 0;
}

/**
 * Semver precedence. Numeric prerelease identifiers compare as numbers, so
 * rc.10 sorts above rc.9 where a string sort puts it below.
 */
export function compareVersions(a, b) {
  const x = parseVersion(a);
  const y = parseVersion(b);
  if (!x || !y) throw new Error(`not a version: ${x ? b : a}`);
  for (const key of ['major', 'minor', 'patch']) {
    if (x[key] !== y[key]) return x[key] - y[key];
  }
  if (x.pre.length === 0 || y.pre.length === 0) {
    return y.pre.length - x.pre.length;
  }
  for (let i = 0; i < Math.max(x.pre.length, y.pre.length); i++) {
    if (x.pre[i] === undefined) return -1;
    if (y.pre[i] === undefined) return 1;
    const order = compareIdentifiers(x.pre[i], y.pre[i]);
    if (order !== 0) return order;
  }
  return 0;
}

function compareLines(a, b) {
  return compareVersions(`${a}.0`, `${b}.0`);
}

/** The versions of the release tags in a list, newest last. Other tags are ignored. */
function tagVersions(tags) {
  return tags
    .filter((tag) => tag.startsWith(TAG_PREFIX))
    .map((tag) => tag.slice(TAG_PREFIX.length))
    .filter((version) => parseVersion(version) !== null)
    .sort(compareVersions);
}

function newest(versions) {
  return versions.length === 0 ? null : versions[versions.length - 1];
}

/** X.Y.0-rc.0 for a new line, else one past the highest rc of the line. */
export function nextRcVersion(line, tags) {
  const prefix = `${line}.0-rc.`;
  const rcs = tagVersions(tags)
    .filter((version) => version.startsWith(prefix))
    .map((version) => version.slice(prefix.length))
    .filter((n) => /^\d+$/.test(n))
    .map(Number);
  return rcs.length === 0
    ? `${line}.0-rc.0`
    : `${line}.0-rc.${Math.max(...rcs) + 1}`;
}

/**
 * The npm dist-tag of a version (spec section 6.1). A maintenance line uses
 * release-X.Y, because npm rejects a tag that parses as a semver range and
 * X.Y.x is one.
 */
export function distTagFor({ kind, line, version }) {
  if (version.includes('-')) return 'next';
  if (kind === 'maintenance') return `release-${line}`;
  return 'latest';
}

/** Whether the GitHub release of a version is the repository's latest. */
function githubLatestFor({ kind, version }) {
  return isStable(version) && kind !== 'maintenance';
}

/**
 * Every decision of one dispatch. `fatal` stops the run at once, dry run or
 * not. `blockers` stop a real run before anything changes; a dry run prints
 * them and fails after its preview.
 */
export function planRelease(facts) {
  const ref = refKind(facts.ref);
  const allowed = EVENTS[facts.event];
  const fail = (fatal) => ({ fatal, blockers: [], outputs: {} });

  if (!allowed) return fail(`Unknown event "${facts.event}".`);
  if (!allowed.includes(ref.kind)) {
    const names = allowed.map((kind) => REF_NAMES[kind]).join(' or ');
    return fail(
      `${facts.event} runs on ${names}, and ${facts.ref} is not one.`,
    );
  }

  const mainStable = newest(tagVersions(facts.tagsMergedMain).filter(isStable));
  const headVersions = tagVersions(facts.tagsMergedHead);
  const blockers = [];
  const outputs = { line: ref.line ?? lineOf(mainStable ?? '') ?? '' };

  if (facts.event === 'sync') {
    const branch = `sync/${ref.line}-${facts.mainSha.slice(0, 12)}`;
    if (facts.remoteHeads.includes(branch)) {
      return fail(
        `${branch} already exists on origin. Merge or close its pull request, delete the branch, and dispatch sync again.`,
      );
    }
    return {
      fatal: null,
      blockers,
      outputs: {
        ...outputs,
        sync_branch: branch,
        up_to_date: String(facts.mainIsAncestor),
      },
    };
  }

  if (facts.event === 'resume') {
    const candidates =
      ref.kind === 'release'
        ? headVersions.filter((version) => lineOf(version) === ref.line)
        : ref.kind === 'maintenance'
          ? headVersions.filter(
              (version) => lineOf(version) === ref.line && isStable(version),
            )
          : headVersions.filter(isStable);
    const version = newest(candidates);
    if (!version)
      return fail(
        `No release tag of ${facts.ref}'s line is reachable from HEAD.`,
      );
    const tag = `${TAG_PREFIX}${version}`;
    if (!facts.remoteTags.includes(tag)) {
      return fail(
        `${tag} is not on origin. Nothing was released, so dispatch the original event again.`,
      );
    }
    const distTag = distTagFor({ kind: ref.kind, line: ref.line, version });
    for (const pkg of facts.packages) {
      const current = pkg.distTags[distTag];
      if (current && compareVersions(current, version) > 0) {
        blockers.push(
          `${distTag} already points at ${pkg.name}@${current}, newer than ${version}. A resume never moves a dist-tag back.`,
        );
      }
    }
    const stableTail = ref.kind === 'release' && isStable(version);
    Object.assign(outputs, {
      version,
      tag,
      dist_tag: distTagFor({ kind: ref.kind, line: ref.line, version }),
      github_latest: String(githubLatestFor({ kind: ref.kind, version })),
      release_exists: String(facts.releaseExists),
      all_published: String(
        facts.packages.every((pkg) => pkg.versions.includes(version)),
      ),
      stable_tail: String(stableTail),
      latest_fixup_tag: latestFixup(ref, facts),
    });
    if (stableTail) {
      const previous = newest(
        tagVersions(facts.tagsAll).filter(
          (v) => isStable(v) && compareLines(lineOf(v), ref.line) < 0,
        ),
      );
      outputs.maint_branch = previous ? `${lineOf(previous)}.x` : '';
    }
    return { fatal: null, blockers, outputs };
  }

  let version;
  if (facts.event === 'rc') {
    version = nextRcVersion(ref.line, facts.tagsAll);
    if (mainStable && compareLines(ref.line, lineOf(mainStable)) <= 0) {
      blockers.push(
        `main already released ${mainStable}, so line ${ref.line} is not ahead of it.`,
      );
    }
    if (tagVersions(facts.tagsAll).includes(`${ref.line}.0`)) {
      blockers.push(
        `${ref.line}.0 is already tagged, so line ${ref.line} takes no more release candidates.`,
      );
    }
    const lastRc = newest(
      tagVersions(facts.tagsAll).filter((v) =>
        v.startsWith(`${ref.line}.0-rc.`),
      ),
    );
    if (lastRc) {
      // A package added to the line after its last rc never had that rc,
      // and resume could not publish it from the rc's tag either.
      const held = facts.lastRcPackages ?? facts.packages.map((p) => p.name);
      for (const pkg of facts.packages.filter((p) => held.includes(p.name))) {
        if (!pkg.versions.includes(lastRc)) {
          blockers.push(
            `${pkg.name}@${lastRc} is not on npm. Finish that release with event=resume before cutting the next rc.`,
          );
        }
      }
    }
  } else if (facts.event === 'stable') {
    version = `${ref.line}.0`;
    if (!mainStable)
      return fail('No stable tag is reachable from origin/main.');
    if (compareVersions(version, mainStable) <= 0) {
      blockers.push(
        `main already released ${mainStable}, so ${version} is not ahead of it.`,
      );
    }
    if (!facts.mainIsAncestor) {
      blockers.push(
        'origin/main is not an ancestor of HEAD. Run event=sync, merge its pull request, and dispatch stable again.',
      );
    }
    if (facts.deployMode !== 'final' && facts.deployMode !== 'retired') {
      blockers.push(
        `apps/docs/deploy.json is in mode "${facts.deployMode}". Merge the pull request that sets it to final, with finalDate, first.`,
      );
    }
    const retired = lineOf(mainStable);
    if (!facts.archiveLines.includes(retired)) {
      blockers.push(
        `apps/docs/archives.json has no entry for line ${retired}, which this stable moves off the docs root.`,
      );
    }
    outputs.maint_branch = `${retired}.x`;
    outputs.stable_tail = 'true';
  } else {
    const proposed = [...new Set(facts.proposed?.versions ?? [])];
    const base = newest(headVersions.filter(isStable));
    if (proposed.length === 0) {
      return fail(
        `Nothing to release: no commit since ${base ? TAG_PREFIX + base : 'the last tag'} bumps a package.`,
      );
    }
    if (proposed.length > 1) {
      return fail(
        `nx proposed more than one version (${proposed.join(', ')}); a release publishes one.`,
      );
    }
    version = proposed[0];
    if (!base) return fail(`No stable tag is reachable from ${facts.ref}.`);
    const b = parseVersion(base);
    const expected = `${b.major}.${b.minor}.${b.patch + 1}`;
    if (version !== expected) {
      blockers.push(
        `${version} is not the patch after ${base}. A minor goes through a release/X.Y branch.`,
      );
    }
    if (facts.proposed.current !== base) {
      blockers.push(
        `nx resolved the current version as ${facts.proposed.current}, and the newest tag on ${facts.ref} is ${base}.`,
      );
    }
    if (ref.kind === 'maintenance' && lineOf(base) !== ref.line) {
      blockers.push(
        `The newest tag on ${facts.ref} is ${base}, which is not on line ${ref.line}.`,
      );
    }
    outputs.line = lineOf(version);
    outputs.stable_tail = 'false';
  }

  const tag = `${TAG_PREFIX}${version}`;
  const pushRefs = [`HEAD:refs/heads/${facts.ref}`];
  if (facts.event === 'stable') {
    pushRefs.push('HEAD:refs/heads/main');
    // The old line's maintenance branch starts at main's head before main
    // moves, in the same atomic push, so a rejected push leaves no branch
    // behind at a stale commit.
    if (!facts.remoteHeads.includes(outputs.maint_branch)) {
      pushRefs.push(`${facts.mainSha}:refs/heads/${outputs.maint_branch}`);
    }
  }

  if (
    facts.release.relationship === 'fixed' &&
    facts.release.pattern.includes('{projectName}')
  ) {
    blockers.push(
      `nx.json's releaseTag.pattern is "${facts.release.pattern}". A fixed group never interpolates {projectName}; use "${TAG_PREFIX}{version}".`,
    );
  }
  if (facts.requiredChecks.length === 0) {
    blockers.push(`no ruleset requires status checks on ${facts.ref}.`);
  }
  for (const check of facts.requiredChecks) {
    if (check.conclusion !== 'success') {
      blockers.push(
        `Required check ${check.context} is ${check.conclusion} on this commit.`,
      );
    }
  }
  if (facts.remoteTags.includes(tag)) {
    blockers.push(`tag ${tag} already exists on origin.`);
  }
  for (const pkg of facts.packages) {
    if (pkg.versions.includes(version)) {
      blockers.push(`${pkg.name}@${version} is already on npm.`);
    }
  }

  Object.assign(outputs, {
    version,
    tag,
    dist_tag: distTagFor({
      kind: ref.kind,
      line: ref.line ?? outputs.line,
      version,
    }),
    push_refs: pushRefs.join(' '),
    github_latest: String(githubLatestFor({ kind: ref.kind, version })),
    latest_fixup_tag: latestFixup(ref, facts),
  });
  return { fatal: null, blockers, outputs };
}

/** On a maintenance line, the tag GitHub's latest release must point back at. */
function latestFixup(ref, facts) {
  if (ref.kind !== 'maintenance') return '';
  const stable = newest(tagVersions(facts.tagsAll).filter(isStable));
  return stable ? `${TAG_PREFIX}${stable}` : '';
}

/**
 * The npm dist-tag moves a publish leaves to do (spec sections 5.2 step 6
 * and 5.4 step 8).
 *
 * A package with no stable version gets latest on the prerelease, so a
 * bootstrap placeholder never stays the default install. A new latest pulls
 * next up to it, so next never points below latest. On resume, the event's
 * own dist-tag is checked as well, since the publish that set it may be the
 * step that failed.
 */
export function reconcileCommands({ packages, version, distTag, resume }) {
  const moves = [];
  for (const pkg of packages) {
    const add = (tag) => {
      if (
        pkg.distTags[tag] !== version &&
        !moves.some((m) => m.name === pkg.name && m.tag === tag)
      ) {
        moves.push({ name: pkg.name, version, tag });
      }
    };
    const current = pkg.distTags[distTag];
    if (resume && (!current || compareVersions(current, version) < 0)) {
      add(distTag);
    }
    if (!isStable(version) && !pkg.versions.some(isStable)) add('latest');
    if (
      distTag === 'latest' &&
      pkg.distTags.next &&
      compareVersions(pkg.distTags.next, version) < 0
    ) {
      add('next');
    }
  }
  return moves;
}

const DEPENDENCY_FIELDS = [
  'dependencies',
  'devDependencies',
  'peerDependencies',
  'optionalDependencies',
];

/**
 * A merged libs/*\/package.json with the line's own version and in-workspace
 * pins. main's release commits move both to main's version, and the line
 * keeps its own. `ours` is the line's copy of the manifest, or null for a
 * package only main has; a pin ours lacks takes the line's version.
 */
export function restoreWorkspacePins(merged, ours, names, lineVersion) {
  const result = structuredClone(merged);
  result.version = ours?.version ?? lineVersion;
  for (const field of DEPENDENCY_FIELDS) {
    for (const name of names) {
      if (result[field]?.[name] === undefined) continue;
      result[field][name] = ours?.[field]?.[name] ?? lineVersion;
    }
  }
  return result;
}

const isPlainObject = (value) =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);

/**
 * A three-way merge of two JSON manifests, key by key. A key one side changed
 * takes that side. A key both sides changed differently keeps ours and is
 * reported by its dotted path.
 */
export function mergeManifests(base, ours, theirs, path = []) {
  const result = {};
  const conflicts = [];
  const keys = [
    ...new Set([
      ...Object.keys(ours),
      ...Object.keys(theirs),
      ...Object.keys(base ?? {}),
    ]),
  ];
  for (const key of keys) {
    const b = base?.[key];
    const o = ours[key];
    const t = theirs[key];
    let value;
    if (same(o, t)) value = o;
    else if (same(o, b)) value = t;
    else if (same(t, b)) value = o;
    else if (isPlainObject(o) && isPlainObject(t)) {
      const nested = mergeManifests(isPlainObject(b) ? b : {}, o, t, [
        ...path,
        key,
      ]);
      value = nested.result;
      conflicts.push(...nested.conflicts);
    } else {
      value = o;
      conflicts.push([...path, key].join('.'));
    }
    if (value !== undefined) result[key] = value;
  }
  return { result, conflicts };
}

/** One version's section of a package CHANGELOG.md, without its heading. */
export function changelogSection(text, version) {
  const lines = text.split('\n');
  // A heading is "## 0.3.3", "## [0.3.3]" or "## 0.3.3 (date)". Compared as
  // text, so no character of the version is read as a pattern.
  const start = lines.findIndex((line) => {
    if (!line.startsWith('## ')) return false;
    const heading = line.slice(3).replace(/^\[/, '');
    if (!heading.startsWith(version)) return false;
    const rest = heading.slice(version.length);
    return rest === '' || rest === ']' || /^[\]\s(]/.test(rest);
  });
  if (start === -1) return null;
  let end = lines.findIndex((line, i) => i > start && /^## /.test(line));
  if (end === -1) end = lines.length;
  return lines
    .slice(start + 1, end)
    .join('\n')
    .trim();
}

/**
 * Where tools/release/stage.mjs writes the copy of each package that
 * `nx release publish` publishes, relative to the workspace root. The root
 * tmp/ is gitignored and lies outside every project's root.
 */
export const PUBLISH_ROOT = 'tmp/publish';

/** The exports condition the workspace resolves to TypeScript source. */
const SOURCE_CONDITION = '@nexusdi/source';

/** The files npm must find in every published package. */
const REQUIRED_FILES = ['README.md', 'LICENSE', 'CHANGELOG.md'];

/** An exports value without the source condition, at any depth. */
function withoutSourceCondition(value) {
  if (!isPlainObject(value)) return value;
  return Object.fromEntries(
    Object.entries(value)
      .filter(([key]) => key !== SOURCE_CONDITION)
      .map(([key, nested]) => [key, withoutSourceCondition(nested)]),
  );
}

/**
 * The manifest npm publishes, made from the repo's libs/x/package.json. The
 * repo lists the source condition and `./src/` sideEffects for the
 * workspace's own resolution. A consumer resolves neither, so both go; every
 * other field is copied unchanged.
 */
export function publishManifest(manifest) {
  const out = structuredClone(manifest);
  if (out.exports !== undefined)
    out.exports = withoutSourceCondition(out.exports);
  if (Array.isArray(out.sideEffects))
    out.sideEffects = out.sideEffects.filter(
      (entry) => !entry.startsWith('./src/'),
    );
  return out;
}

/** Every string target under an exports value. */
function exportTargets(value) {
  if (typeof value === 'string') return [value];
  if (isPlainObject(value)) return Object.values(value).flatMap(exportTargets);
  return [];
}

/** The keys of an object at any depth. */
function keysDeep(value) {
  if (Array.isArray(value)) return value.flatMap(keysDeep);
  if (!isPlainObject(value)) return [];
  return Object.entries(value).flatMap(([key, nested]) => [
    key,
    ...keysDeep(nested),
  ]);
}

/** A package-relative posix path, from `from`'s directory plus `ref`. */
function resolveIn(from, ref) {
  const parts = [];
  const dir = from.includes('/') ? from.slice(0, from.lastIndexOf('/')) : '';
  for (const part of `${dir}/${ref}`.split('/')) {
    if (part === '' || part === '.') continue;
    if (part === '..') parts.pop();
    else parts.push(part);
  }
  return parts.join('/');
}

/**
 * What is wrong with a package as npm will publish it. `files` lists the
 * package's files relative to its root, `read` returns one file's text, and
 * `repoVersion`, when given, is the version in libs/x/package.json the
 * packed manifest must carry. An empty list means
 * the package is complete: its manifest carries no source condition, every
 * path the manifest names is shipped, every source map's sources are
 * shipped, and every sourceMappingURL names a shipped map.
 */
export function stagedProblems({ manifest, repoVersion, files, read }) {
  const shipped = new Set(files);
  const problems = [];
  const name = manifest.name;

  if (keysDeep(manifest).includes(SOURCE_CONDITION))
    problems.push(`${name}: package.json still carries ${SOURCE_CONDITION}`);
  if (repoVersion !== undefined && manifest.version !== repoVersion)
    problems.push(
      `${name}: staged version ${manifest.version} differs from the repo's ${repoVersion}`,
    );
  for (const file of REQUIRED_FILES)
    if (!shipped.has(file)) problems.push(`${name}: ${file} is not shipped`);

  const named = [
    ...exportTargets(manifest.exports),
    ...exportTargets(manifest.bin),
    ...[manifest.types, manifest.main, manifest.module].filter(Boolean),
    ...(Array.isArray(manifest.sideEffects) ? manifest.sideEffects : []),
  ];
  for (const target of new Set(named)) {
    // A pattern or a folder export names no single file.
    if (target.includes('*') || target.endsWith('/')) continue;
    if (!shipped.has(resolveIn('', target)))
      problems.push(
        `${name}: package.json names ${target}, which is not shipped`,
      );
  }

  for (const file of files) {
    if (file.endsWith('.map')) {
      const { sourceRoot = '', sources = [] } = JSON.parse(read(file));
      const root =
        sourceRoot && !sourceRoot.endsWith('/') ? `${sourceRoot}/` : sourceRoot;
      for (const ref of sources) {
        const target = resolveIn(file, `${root}${ref}`);
        if (!shipped.has(target))
          problems.push(
            `${name}: ${file} maps to ${target}, which is not shipped`,
          );
      }
    } else if (/\.(?:[cm]?js|d\.[cm]?ts)$/.test(file)) {
      const url = /\/\/# sourceMappingURL=(\S+)\s*$/.exec(read(file))?.[1];
      if (url === undefined || url.startsWith('data:')) continue;
      const target = resolveIn(file, url);
      if (!shipped.has(target))
        problems.push(
          `${name}: ${file} points at ${target}, which is not shipped`,
        );
    }
  }
  return problems;
}
