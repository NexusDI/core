---
slug: first-release
title: 'Tabula Rasa'
authors: [evanion]
tags: [release, announcement, dependency-injection, v0.1.0]
date: 2025-06-23
---

We're thrilled to announce the **first official release** of NexusDI, a modern, lightweight, and type-safe dependency injection library for TypeScript! 🚀

<!--truncate-->

## Why NexusDI?

Have you ever wished for a dependency injection library that just _gets out of your way_? One that's type-safe, lightning fast, and doesn't bloat your bundle? That's exactly why we built NexusDI. We wanted something that felt native to TypeScript, was easy to use, and didn't force you to choose between simplicity and power.

## What Makes NexusDI Special?

NexusDI is all about **developer happiness** and **performance**. With a single, unified `container.set()` API, you can register services, modules, and even dynamic modules—no more memorizing a zoo of methods. TypeScript's type system is at the heart of everything, so you get autocompletion, safety, and confidence as you build.

But we didn't stop at ergonomics. NexusDI is tiny (just 96KB with dependencies), and it's _fast_. Like, "blink and you'll miss it" fast. Whether you're building a tiny CLI or a sprawling web app, you'll barely notice the overhead.

We also love modularity. Organize your code with classic modules, dynamic modules, and advanced configuration patterns. Use decorators for clean, declarative service registration and injection. And when it's time to test? NexusDI makes it easy to mock, override, and isolate dependencies.

And yes, we have docs. Lots of them. From getting started to advanced patterns, you'll find guides, real-world examples, and best practices to help you succeed. Plus, we're open source and community-driven—your feedback and contributions are always welcome!

## How Fast Is It, Really?

We're glad you asked! Here's how NexusDI stacks up against the competition:

| Library     | Startup Time | Resolution Time | Memory Usage | Bundle Size |
| ----------- | ------------ | --------------- | ------------ | ----------- |
| **NexusDI** | 1.3μs        | 0.2μs           | 6KB          | 96KB        |
| InversifyJS | 22.2μs       | 1.4μs           | 32KB         | 114KB       |
| tsyringe    | 45.2μs       | 0.9μs           | 150KB        | 99KB        |
| TypeDI      | 2.0μs        | 0.1μs           | 2KB          | 89KB        |

<sup>Measured on Node.js v22.13.1, M1 Pro MacBook, 1,000 startup iterations, 10,000 resolution iterations.</sup>

## Ready to Try It?

Getting started is a breeze:

```bash
npm install @nexusdi/core reflect-metadata
```

Then check out our [Getting Started guide](https://nexus.js.org/docs/getting-started) and see how easy DI can be.

## Join Us on This Adventure!

Right now, NexusDI is a bit of a tabula rasa—a blank slate, waiting for new ideas, fresh perspectives, and maybe a few more Star Wars references. It's just been us (a dev and an AI) hacking away in the digital wilderness, but we'd love for you to join the party.

Whether you're a TypeScript wizard, a dependency injection Padawan, or just someone who enjoys a good `console.log`, there's a place for you here. Open a PR, file an issue, or just drop by to say hi. Who knows? Maybe you'll be the one to implement the next killer feature, or at least add a witty comment to the codebase.

So grab your towel (always know where it is), bring your rubber duck, and let's build something awesome together. The codebase is young, the docs are fresh, and the adventure is just beginning. May your imports be evergreen and your bugs be easily reproducible!

---

_Happy coding, and may the source be with you!_

— The NexusDI Team (currently: a dev and a helpful AI, I feel like the Bob and his Akbar)
