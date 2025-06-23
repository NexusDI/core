---
sidebar_position: 7
---

# Performance Tuning

Learn how to measure and optimize the performance of your DI container usage in NexusDI.

> See also: [Performance](../performance.md)

## Quick Tips (Recommended)
- Register all providers up front where possible.
- Avoid expensive logic in provider factories.
- Use singletons for shared dependencies.
- Prefer direct token lookups over dynamic or computed tokens.
- Minimize deep dependency graphs when possible.
- Use child containers only when necessary (scoping adds a small overhead).

---

## Advanced: Measuring & Analyzing Performance

> _Use these tips for large apps or if you notice slow startup or injection._

- Use Node.js profiling tools to analyze startup and runtime.
- Profile with and without DI to compare overhead.
- See the [Performance](../performance.md) article for details.

---

**Next:** [Debugging & Diagnostics](debugging-and-diagnostics.md) 