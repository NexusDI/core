---
title: Contributing to Docs
sidebar_position: 3
---

# Contributing to NexusDI Documentation

Thank you for helping improve the NexusDI docs! Clear, helpful documentation is essential for every user.

## Quick Start

1. **Fork the repository** on GitHub ([NexusDI/core](https://github.com/NexusDI/core))
2. **Clone your fork** locally
3. **Create a branch** for your changes
4. **Make your changes** following our style guide
5. **Test your changes** by building the docs
6. **Submit a pull request**

## Documentation Setup

```bash
git clone https://github.com/your-username/core.git
cd core
npm install
```

> **Note:** The documentation site is fully isolated and not managed by Nx. All docs tasks must be run from inside the `docs` folder using npm scripts. This is temporary until Docusaurus supports modern React Router and can be reintegrated with Nx.

## Building and Previewing the Docs

- **Build the docs:**
  ```bash
  cd docs
  npm install
  npm run build
  ```
- **Start the docs locally (dev server):**
  ```bash
  cd docs
  npm install
  npm start
  ```
- Then visit `http://localhost:3000` to see your changes.

## Documentation Style Guide

### Tone & Personality 🎭

- **Warm and friendly** but professional - like a helpful colleague who knows their stuff
- **Nerdy but not overwhelming** - include 1-2 subtle nerdy and relevant jokes per article, for instance from one of these fandoms:
  - Star Wars
  - Star Trek
  - The Expanse
  - The Martian (or other Andy Weir books)
  - Bobiverse
  - The Commonwealth Universe (Peter F Hamilton)
  - Warcraft
  - Lord of the rings
  - Star Citizen
- **Avoid repetitive phrases** like "Just as in..." or "Think of it as..." - make analogies flow naturally
- **No forced humor** - jokes should be contextually relevant and enhance understanding
- **Confident but approachable** - assume the reader is smart but new to the concept

### Structure 📋

- **Clear headings** - perhaps with emojis for visual appeal (⚡ 🚀 🎯 📦 🔧 etc.), just don't overdo it.
- **Progressive complexity** - start simple, build up to advanced concepts
- **Code examples first** - show working code before explaining theory
- **Practical focus** - emphasize real-world usage over academic concepts
- **Next Steps sections** - guide readers to related content

### Technical Content 💻

- **Always include `reflect-metadata`** in npm install commands
- **Use TypeScript examples** with proper typing
- **Show both simple and advanced patterns**
- **Include error handling and edge cases**
- **Provide testing examples** where relevant

### Writing Style ✍️

- **Active voice** - "NexusDI provides..." not "NexusDI is provided..."
- **Concise but complete** - don't skimp on details but avoid fluff
- **Use analogies sparingly** - one good one per article is better than many forced ones
- **Break up text** with code blocks, lists, and examples
- **End with encouragement** - make readers feel capable and excited to try it

### What to Avoid ❌

- Repetitive deprecation warnings in every article footer
- Overwhelming number of analogies
- "Just as in [fandom]" repetitive starts
- Technical jargon without explanation
- Long paragraphs without visual breaks

**Remember:** The goal is to make dependency injection feel approachable and fun, not intimidating. Help developers succeed with clear, practical guidance and a touch of nerdy personality!

## Documentation Examples

Here are examples showing good and bad documentation practices:

### ✅ Good Documentation

**Title:** Getting Started with Modules

**Content:**
Modules are a powerful way to organize your dependency injection setup in NexusDI. Think of them as guild departments - each handles its own specialty, but they all contribute to the guild's success.

**Code Example:**

```typescript
@Module({
  providers: [
    UserService,
    UserRepository,
    { token: DATABASE, useClass: PostgresDatabase },
  ],
})
class UserModule {}
```

**Explanation:** This approach keeps your code organized and maintainable.

### ❌ Bad Documentation

**Title:** Getting Started with Modules

**Content:**
Just as in World of Warcraft where you have different guild departments, modules in NexusDI work the same way. Think of them as the modular compartments of a well-designed ship - each section has its purpose, but they all work together seamlessly. Remember, just like in Star Wars, the force flows through everything, including your dependency injection setup.

**Code Example:**

```typescript
@Module({
  providers: [
    UserService,
    UserRepository,
    { token: DATABASE, useClass: PostgresDatabase },
  ],
})
class UserModule {}
```

**Explanation:** This is overwhelming with too many forced analogies and repetitive phrases.

## File Organization

### Documentation Structure

- `docs/docs/` - Main documentation pages
- `docs/blog/` - Blog posts and announcements
- `docs/static/` - Images and static assets

### Naming Conventions

- Use kebab-case for file names: `getting-started.md`
- Use descriptive names that match the content
- Group related content in subdirectories when needed

### Front Matter

Each documentation file should start with front matter:

```yaml
---
sidebar_position: 1
---
```

## Testing Your Changes

### Build the Documentation

```bash
cd docs
npm run build
```

### Preview Locally

```bash
cd docs
npm start
```

Then visit `http://localhost:3000` to see your changes.

## Pull Request Guidelines

### Before Submitting

- [ ] Documentation builds successfully
- [ ] All links work correctly
- [ ] Code examples are tested
- [ ] Style guide is followed
- [ ] Content is accurate and helpful

### PR Description Template

```markdown
## Description

Brief description of the documentation changes

## Type of Change

- [ ] New documentation page
- [ ] Updates to existing content
- [ ] Bug fix (typo, broken link, etc.)
- [ ] Style improvements

## Testing

- [ ] Documentation builds successfully
- [ ] All examples work correctly
- [ ] Links are verified

## Checklist

- [ ] Follows style guide
- [ ] Self-review completed
- [ ] Content is accurate
```

## Getting Help

- **Issues**: Use GitHub issues for documentation bugs or suggestions
- **Discussions**: Use GitHub Discussions for questions about contributing
- **Existing Docs**: Check the current documentation for examples
- See the [main CONTRIBUTING.md](https://github.com/NexusDI/core/blob/main/CONTRIBUTING.md) for full details and the latest guidelines.
- See the [Code of Conduct](https://github.com/NexusDI/core/blob/main/CODE_OF_CONDUCT.md)

## Recognition

Documentation contributors will be recognized in:

- The project's README.md
- Release notes
- GitHub contributors page

Thank you for helping make NexusDI documentation better for everyone! 🚀✨
