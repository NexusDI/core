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

### Option 1: Using the Release Script (Recommended)

1. **Bump version and prepare release:**
   ```bash
   npm run release patch    # For bug fixes
   npm run release minor    # For new features
   npm run release major    # For breaking changes
   ```

2. **Push the release:**
   ```bash
   git push origin main --tags
   ```

### Option 2: Manual Release

1. **Update version in package.json**
2. **Run pre-release checks:**
   ```bash
   npm run test:coverage
   npm run lint
   npm run build
   ```

3. **Commit and tag:**
   ```bash
   git add package.json
   git commit -m "chore: bump version to X.Y.Z"
   git tag vX.Y.Z
   git push origin main --tags
   ```

## What Happens Automatically

When you push a tag starting with `v`, the CI/CD pipeline will:

1. **Run tests** on multiple Node.js versions
2. **Build the project** and verify it works
3. **Publish to npm** using the `@nexusdi/core` package name
4. **Create a GitHub release** with:
   - Release notes from commit messages
   - Installation instructions
   - Documentation links
   - Build artifacts

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