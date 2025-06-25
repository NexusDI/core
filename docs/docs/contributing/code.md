---
title: Contributing to Code
sidebar_position: 2
---

# Contributing to the NexusDI Codebase

Thank you for your interest in contributing code to NexusDI! Your improvements help make the project better for everyone.

## Quick Start

1. **Fork the repository** on GitHub ([NexusDI/core](https://github.com/NexusDI/core))
2. **Clone your fork** locally
3. **Create a new branch** for your feature/fix
4. **Make your changes**
5. **Test your changes**
6. **Submit a pull request**

## Development Setup

### Prerequisites

- Node.js 18.x or higher
- npm (or yarn)

### Installation

```bash
git clone https://github.com/your-username/core.git
cd core
npm install
```

### Available Nx Commands

```bash
nx build <project> # Build a project
nx test  <project> # Run all tests
nx lint  <project> # Lint all projects
nx build docs      # Build documentation
nx start docs      # Start documentation locally (dev server)
```

## File Structure

- `libs/`: All libraries source code
- `examples/`: Example implementations
- `docs/`: Documentation (Docusaurus)

## Code Style

- Follow the existing code style and formatting
- Use TypeScript for all new code
- Add appropriate JSDoc comments for public APIs
- Follow the linting rules (ESLint configuration)

## Commit Messages

Use [conventional commit](https://www.conventionalcommits.org/) format:

```
type(scope): description

[optional body]
[optional footer]
```

Types: `feat`, `fix`, `docs`, `style`, `refactor`, `test`, `chore`

Examples:

```
feat(container): add support for circular dependency detection
fix(decorators): resolve issue with parameter decorators in strict mode
docs(readme): update installation instructions
```

## Testing

- Write tests for all new features
- Maintain high test coverage
- Use descriptive test names
- Test both success and error cases
- Mock external dependencies appropriately

### Running Tests

```bash
nx run-many -t test --all # Run all tests
nx test <project>         # Run tests for a specific project (e.g., nx test core)
```

### Test Structure

```typescript
describe('Feature', () => {
  it('should do something', () => {
    // Arrange
    const container = new Nexus();
    // Act
    const result = container.get(TOKEN);
    // Assert
    expect(result).toBeDefined();
  });
});
```

## Pull Request Process

1. **Create a feature branch** from `main`
2. **Make your changes** following the guidelines above
3. **Write/update tests** for your changes
4. **Update documentation** if needed
5. **Run the full test suite** locally (`nx test`)
6. **Submit a pull request** with a clear description

### Pull Request Checklist

- [ ] Code follows the project's style guidelines
- [ ] Tests pass locally
- [ ] Documentation is updated (if applicable)
- [ ] Commit messages follow conventional format
- [ ] PR description clearly describes the changes
- [ ] All CI checks pass

### PR Description Template

```markdown
## Description

Brief description of the changes

## Type of Change

- [ ] Bug fix
- [ ] New feature
- [ ] Breaking change
- [ ] Documentation update

## Testing

- [ ] Unit tests added/updated
- [ ] All tests pass
- [ ] Manual testing completed

## Checklist

- [ ] Code follows style guidelines
- [ ] Self-review completed
- [ ] Documentation updated
```

## Release Process

1. **Update version** in `package.json`
2. **Update CHANGELOG.md** with new changes
3. **Create a tag** with the new version
4. **Push the tag** to trigger the release workflow

```bash
npm version patch|minor|major
git push origin --tags
```

### Release Checklist

- [ ] All tests pass
- [ ] Documentation is up to date
- [ ] CHANGELOG.md is updated
- [ ] Version is bumped
- [ ] Tag is created and pushed
- [ ] Release notes are reviewed

## How to Get Your PR Reviewed Faster

- Keep PRs focused and small
- Provide a clear, descriptive PR message
- Reference related issues if applicable

## Getting Help

- **Issues**: Use GitHub issues for bug reports and feature requests
- **Discussions**: Use GitHub Discussions for questions and general discussion
- **Documentation**: Check the docs folder for detailed guides
- See the [main CONTRIBUTING.md](https://github.com/NexusDI/core/blob/main/CONTRIBUTING.md) for full details and the latest guidelines.
- See the [Code of Conduct](https://github.com/NexusDI/core/blob/main/CODE_OF_CONDUCT.md)

## Recognition

Contributors will be recognized in:

- The project's README.md
- Release notes
- GitHub contributors page

Thank you for contributing to NexusDI! 🚀
