# Documentation Style Guide

This guide ensures that NexusDI documentation remains intuitive, professional, and helpful for both human readers and AI agents.

## The Core Philosophy: Context → Concept → Detail

Avoid "Word Salad." Never start a page by dropping a technical definition without explaining why it matters. Every article must follow this progression:

1. **Context (The "Why"):** Start with the problem the feature solves or the goal the reader is trying to achieve. Establish the "mental model" first.
2. **Concept (The "What"):** Introduce the high-level concept or the name of the feature. Explain how it fits into the broader NexusDI ecosystem.
3. **Detail (The "How"):** Provide the technical specifics, API references, and code examples.

## Titling and Structure

### Titles

- **Action-Oriented or Conceptual:** Use titles that describe the _purpose_ rather than just the _name_.
  - Bad: `Tokens`
  - Better: `Identifying Dependencies with Tokens`
- **Consistent Casing:** Use Sentence case or Title case consistently across the project.

### Structure

- **Lead-ins:** Every major section should have a lead-in sentence that bridges the gap from the previous section.
- **Interface-First Examples:** Examples should prioritize interfaces and tokens over concrete class-to-class binding to reinforce the DI pattern.
- **Progressive Disclosure:** Don't overwhelm the reader. Introduce the simplest use case first, then move to the complex "edge cases" or advanced configurations.

## Progression and Flow

- **Logical Sequencing:** Pages should be ordered so that the reader has the necessary prerequisite knowledge before reaching the next page.
- **Explicit Bridges:** End pages with a clear "Next Step" that guides the reader to the next logical piece of the puzzle.
- **Avoid "BAM" Drops:** If a sentence starts with "X is a Y that does Z," check if the previous paragraph explained why the reader needs X.

## Writing Rules (Summary)

- **No Filler:** Remove "It is worth noting," "Notably," or "Importantly."
- **Active Voice:** Every sentence should name who or what is acting.
- **No "Native":** Do not use the word "native" when referring to NexusDI features or decorators.
- **No "reflect-metadata":** Do not mention this library in user-facing docs.

## Repository rules that still apply

The guide above sets structure and tone. These repository rules hold beside it, and CI enforces most of them.

- Examples are interface-first. A service gets an interface and a `Token<IFoo>`, the class is bound with `provide(TOKEN, { useClass: Foo })`, and consumers list the token in `deps`. No example binds one concrete class straight to another. `/getting-started/` and the core README's Quick Start are the exceptions: they bind classes as their own tokens (core spec decision 31).
- Every claim about behaviour is checked against the source in `libs/` before it is published: an ordering, a count, an error code, a lifetime, a toolchain. When prose and code disagree, fix the prose.
- The word "native" and the library reflect-metadata appear nowhere in the docs or the READMEs. Say what NexusDI reads: `static deps`, `provide()` deps or a decorator's deps.
- The refused-words list of the public documentation guidance stays in force, and so do the repo-checks that ban em dashes, antithesis, filler openers and metaphor verbs (`doc-refused-words`, `doc-antithesis`, `npm-readmes`).
- Examples run as tests. A docs page cites a region of `examples/meridian/src/pages/<slug>.md`, and every `ts` block in a package README is a doctest (`ts @import.meta.vitest`). At least one of them carries a `// ->` claim.

Bold lead-ins on list items and paragraphs are allowed in the docs and the READMEs. A heading does not have to name NexusDI. The npm README structure is in `tools/repo-checks/src/npm-readmes.ts`.

## npm READMEs: Problem → Solution → Proof → Deep Dive

A README sells the value before the implementation.

1. **The tagline** under the title leads with what the developer gains. It equals the `description` in the package's `package.json`.
2. **The problem** opens the body: the specific friction a developer feels without the package.
3. **The solution** introduces the package as the cure for that friction.
4. **Key Features** holds the technical specs (ESM-only, Node and TypeScript versions, peer dependencies) after the reader knows the value.
5. **The proof** is the Quick Example: a minimal doctest that shows the solution working.
6. **The deep dive** is the Documentation section, which points to the guides for edge cases.

Every technical detail gets a lead-in sentence that says its intent before the detail.
