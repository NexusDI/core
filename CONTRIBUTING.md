# Contributing to NexusDI

Thank you for your interest in contributing to NexusDI! This document provides guidelines and information for contributors.

## Table of Contents

- [Code of Conduct](#code-of-conduct)
- [Getting Started](#getting-started)
- [Development Setup](#development-setup)
- [Making Changes](#making-changes)
- [Testing](#testing)
- [Pull Request Process](#pull-request-process)
- [Release Process](#release-process)

## Code of Conduct

This project and everyone participating in it is governed by our Code of Conduct. By participating, you are expected to uphold this code.

## Getting Started

1. Fork the repository
2. Clone your fork locally
3. Create a new branch for your feature/fix
4. Make your changes
5. Test your changes
6. Submit a pull request

## Development Setup

### Prerequisites

- Node.js 18.x or higher
- npm or yarn

### Installation

```bash
# Clone your fork
git clone https://github.com/your-username/nexusdi.git
cd nexusdi

# Install dependencies
npm install

# Install docs dependencies
cd docs && npm install && cd ..
```

### Available Scripts

```bash
# Run tests
npm test

# Run tests with coverage
npm run test:coverage

# Run linting
npm run lint

# Fix linting issues
npm run lint:fix

# Build the project
npm run build

# Build documentation
cd docs && npm run build
```

## Making Changes

### Code Style

- Follow the existing code style and formatting
- Use TypeScript for all new code
- Add appropriate JSDoc comments for public APIs
- Follow the linting rules (Biome configuration)

### Commit Messages

Use conventional commit format:

```
type(scope): description

[optional body]

[optional footer]
```

Types:
- `feat`: New feature
- `fix`: Bug fix
- `docs`: Documentation changes
- `style`: Code style changes (formatting, etc.)
- `refactor`: Code refactoring
- `test`: Adding or updating tests
- `chore`: Maintenance tasks

Examples:
```
feat(container): add support for circular dependency detection
fix(decorators): resolve issue with parameter decorators in strict mode
docs(readme): update installation instructions
```

### File Structure

- `src/`: Core library source code
- `examples/`: Example implementations
- `docs/`: Documentation (Docusaurus)
- `test/`: Test files
- `.github/`: GitHub workflows and templates

## Testing

### Running Tests

```bash
# Run all tests
npm test

# Run tests with coverage
npm run test:coverage

# Run tests in watch mode
npm run test:watch

# Run specific test file
npm test -- src/container.test.ts
```

### Writing Tests

- Write tests for all new features
- Maintain high test coverage
- Use descriptive test names
- Test both success and error cases
- Mock external dependencies appropriately

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
5. **Run the full test suite** locally
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

### Creating a Release

1. **Update version** in `package.json`
2. **Update CHANGELOG.md** with new changes
3. **Create a tag** with the new version
4. **Push the tag** to trigger the release workflow

```bash
# Update version (patch, minor, or major)
npm version patch
# or
npm version minor
# or
npm version major

# Push the tag
git push origin --tags
```

### Release Checklist

- [ ] All tests pass
- [ ] Documentation is up to date
- [ ] CHANGELOG.md is updated
- [ ] Version is bumped
- [ ] Tag is created and pushed
- [ ] Release notes are reviewed

## Getting Help

- **Issues**: Use GitHub issues for bug reports and feature requests
- **Discussions**: Use GitHub Discussions for questions and general discussion
- **Documentation**: Check the docs folder for detailed guides

## Recognition

Contributors will be recognized in:
- The project's README.md
- Release notes
- GitHub contributors page

Thank you for contributing to NexusDI! 🚀 