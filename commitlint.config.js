module.exports = {
  extends: ['@commitlint/config-conventional'],
  rules: {
    // The types @commitlint/config-conventional allows, restated so the list
    // is the one nx knows. nx reads the type to choose the bump: `feat` is a
    // minor, `fix` a patch, a `!` or BREAKING CHANGE footer a major whatever
    // the type, and every other type bumps nothing on its own
    // (DEFAULT_CONVENTIONAL_COMMITS_CONFIG in nx's release config).
    'type-enum': [
      2,
      'always',
      [
        'feat',
        'fix',
        'docs',
        'style', // No change in behaviour: whitespace, formatting, naming
        'refactor', // No change in behaviour, but the code itself moved
        'perf',
        'test',
        'build', // The build system, or a dependency's version
        'ci',
        'chore', // Touches neither src nor test
        'revert',
      ],
    ],
    // A package's scope is its Nx project name with the `@nexusdi/` prefix
    // stripped. `nx release` matches a commit scope against project names
    // with a word-boundary regex in which `-` counts as a word character.
    //
    // The list is static: it is read in the commit-msg hook on every commit,
    // where computing the Nx project graph would cost seconds per commit.
    // tools/repo-checks/src/commitlint-scope-enum.test.ts is the other half:
    // it fails the build when a project under nx.json's `release.projects`
    // globs has no entry here.
    'scope-enum': [
      2,
      'always',
      [
        // Nx projects, by bare name. A commit under one of these that also
        // sits under nx.json's `release.projects` globs is what versions a
        // package.
        'core',
        // Repository scopes, for work that is not one package's. None of
        // them names a project, so nx attributes such a commit to no package
        // and it can contribute at most a patch bump to whatever files it
        // touched.
        'examples',
        'ci',
        'deps',
        'deps-dev',
        'repo',
        'release',
        'specs',
        'docs',
        // The docs site's own projects. None is under nx.json's
        // release.projects, so none of these commits versions a package.
        // tools/repo-checks/src/docs-scopes.test.ts holds this list.
        'docs-e2e',
        'meridian-ui',
        'meridian',
        'doc-examples',
      ],
    ],
    'type-case': [2, 'always', 'lower-case'],
    'type-empty': [2, 'never'],
    'subject-case': [2, 'always', ['sentence-case', 'lower-case']],
    'subject-empty': [2, 'never'],
    'subject-full-stop': [2, 'never', '.'],
    'header-max-length': [2, 'always', 100],
    'body-leading-blank': [1, 'always'],
    'footer-leading-blank': [1, 'always'],
  },
};
