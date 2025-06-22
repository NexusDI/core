# Release Checklist

This document outlines the steps needed to release NexusDI to npm.

## Prerequisites

### 1. NPM Account Setup
- [ ] Ensure you have an npm account
- [ ] Ensure you have access to the `@nexusdi` organization on npm
- [ ] Create an NPM token with publish permissions
- [ ] Add the NPM token to GitHub repository secrets as `NPM_TOKEN`

### 2. GitHub Repository Setup
- [ ] Ensure the repository is under the `NexusDI` organization
- [ ] Verify CI/CD workflows are working
- [ ] Ensure you have write permissions to the repository

## Pre-Release Checklist

### 1. Code Quality
- [ ] All tests pass: `npm run test:coverage`
- [ ] Linting passes: `npm run lint`
- [ ] Code is formatted: `npm run format:check`
- [ ] Build succeeds: `npm run build`

### 2. Documentation
- [ ] README.md is up to date
- [ ] Documentation builds successfully: `npm run docs:build`
- [ ] All examples work correctly
- [ ] API documentation is current

### 3. Package Configuration
- [ ] `package.json` version is correct
- [ ] `package.json` contains all necessary fields:
  - [ ] `name`: `@nexusdi/core`
  - [ ] `version`: Current version
  - [ ] `description`: Accurate description
  - [ ] `main`: Points to `dist/index.js`
  - [ ] `types`: Points to `dist/index.d.ts`
  - [ ] `files`: Includes `dist` directory
  - [ ] `keywords`: Relevant keywords
  - [ ] `author`: `NexusDI`
  - [ ] `license`: `MIT`
  - [ ] `repository`: Correct GitHub URL
  - [ ] `homepage`: Points to documentation
  - [ ] `bugs`: Points to GitHub issues

## Release Process

This document outlines the release process for NexusDI.

## Release Workflows

#### Option 1: GitHub Actions Release (Default - npm + GitHub Packages)
For releases that publish to both npm and GitHub Packages (recommended):

```bash
# Patch release (0.1.0 -> 0.1.1) - creates release branch
npm run release

# Minor release (0.1.0 -> 0.2.0) - creates release branch
npm run release:minor

# Major release (0.1.0 -> 1.0.0) - creates release branch
npm run release:major
```

This workflow:
1. Creates a release branch (e.g., `release/v0.1.1`)
2. Bumps version in package.json
3. Runs tests and builds
4. Commits changes and creates tag
5. Pushes branch and tag
6. Provides next steps for PR creation

#### Option 2: Local Release (Direct to npm)
For quick local releases to npm only (use with caution):

```bash
# Patch release (0.1.0 -> 0.1.1) - direct to npm
npm run release:direct

# Minor release (0.1.0 -> 0.2.0) - direct to npm
npm run release:direct:minor

# Major release (0.1.0 -> 1.0.0) - direct to npm
npm run release:direct:major

# First release (keeps current version) - direct to npm
npm run release:direct -- --first-release
```

## Release Steps

### Before Release
1. **Update CHANGELOG.md** - Move unreleased changes to new version
2. **Run tests** - Ensure all tests pass
3. **Update documentation** - Ensure docs are current

### During Release
1. **Choose release type** - patch, minor, or major
2. **Run release command** - See options above
3. **Confirm release** - Review changes before proceeding

### After Release
1. **For local releases** - Package is published immediately
2. **For branch releases** - Create PR and merge to trigger GitHub Actions

## Version Bumping

- **Patch** (0.1.0 → 0.1.1): Bug fixes and minor improvements
- **Minor** (0.1.0 → 0.2.0): New features, backward compatible
- **Major** (0.1.0 → 1.0.0): Breaking changes

## GitHub Actions

The GitHub Actions workflow automatically:
- Runs tests with coverage
- Builds the project
- Publishes to npm (with NPM_TOKEN)
- Publishes to GitHub Packages (with GITHUB_TOKEN)
- Creates GitHub Release with changelog
- Uploads release assets

## Required Secrets

Set up these secrets in GitHub repository settings:

- `NPM_TOKEN`: Your npm authentication token

The `GITHUB_TOKEN` is automatically provided by GitHub Actions.

## Troubleshooting

### Release Fails
- Check that all tests pass
- Ensure you have proper git permissions
- Verify npm token is valid
- Check GitHub Actions logs for errors

### Version Conflicts
- Ensure you're on the correct branch
- Check that version hasn't been bumped already
- Verify git status is clean

## Release Checklist

- [ ] Update CHANGELOG.md
- [ ] Run `npm test` to ensure tests pass
- [ ] Run `npm run lint` to check code quality
- [ ] Choose appropriate release type
- [ ] Run release command
- [ ] Verify package is published
- [ ] Check GitHub release is created
- [ ] Update documentation if needed

## Post-Release Verification

### 1. NPM Package
- [ ] Package is published to npm: https://www.npmjs.com/package/@nexusdi/core
- [ ] Package can be installed: `npm install @nexusdi/core`
- [ ] TypeScript types are included
- [ ] Bundle size is reasonable

### 2. GitHub Release
- [ ] Release is created on GitHub
- [ ] Release notes are accurate
- [ ] Assets are uploaded correctly

### 3. Documentation
- [ ] Documentation is deployed and accessible
- [ ] Installation instructions work
- [ ] Examples run correctly

## Troubleshooting

### Common Issues

1. **NPM Token Issues**
   - Ensure the `NPM_TOKEN` secret is set in GitHub
   - Verify the token has publish permissions
   - Check that you have access to the `@nexusdi` organization

2. **Build Failures**
   - Check that all dependencies are installed
   - Verify TypeScript compilation works
   - Ensure tests pass locally

3. **Permission Issues**
   - Verify you're a member of the NexusDI organization
   - Check that you have write access to the repository

### Rollback Process

If a release needs to be rolled back:

1. **Unpublish from npm** (within 72 hours):
   ```bash
   npm unpublish @nexusdi/core@X.Y.Z
   ```

2. **Delete the GitHub release**

3. **Delete the git tag:**
   ```bash
   git tag -d vX.Y.Z
   git push origin :refs/tags/vX.Y.Z
   ```

## Version Guidelines

- **Patch (X.Y.Z → X.Y.Z+1)**: Bug fixes, documentation updates
- **Minor (X.Y.Z → X.Y+1.0)**: New features, backward-compatible changes
- **Major (X.Y.Z → X+1.0.0)**: Breaking changes, major refactoring

## Support

If you encounter issues during the release process:

1. Check the GitHub Actions logs for detailed error messages
2. Verify all prerequisites are met
3. Contact the NexusDI team for assistance 