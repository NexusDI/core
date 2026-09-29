# Security register

The classes of hostile input this package is held against, and what happens to each. The adversarial suite in `src/security` is checked against this file: one entry per class, one identifier, and the test that proves the entry. `src/security/register.test.ts` fails when an identifier appears in one place and not the other. Adding a class is an entry here plus a test there.

It runs under `nx test @nexusdi/interceptors`, with the rest of the package's tests.

## Tiers

- Tier 1: the package prevents it. The test asserts the hostile input has no effect outside the package's output.

Counts: 1 tier 1.

## Tier 1: prevented

| ID      | Class                                                                                       | CWE      | Mechanism                                                                                       | Test                                |
| ------- | ------------------------------------------------------------------------------------------- | -------- | ----------------------------------------------------------------------------------------------- | ----------------------------------- |
| SEC-013 | A polluted `Object.prototype` (`interceptors`, `class`, `methods`) attaching an interceptor | CWE-1321 | Declarations, options and metadata are read with `Object.hasOwn`, one prototype level at a time | `tier1-prevented.test.ts` › SEC-013 |
