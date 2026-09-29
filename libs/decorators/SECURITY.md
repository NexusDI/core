# Security register

The classes of hostile input this package is held against, and what happens to each. The adversarial suite in `src/security` is checked against this file: one entry per class, one identifier, and the test that proves the entry. `src/security/register.test.ts` fails when an identifier appears in one place and not the other. Adding a class is an entry here plus a test there.

Each identifier names the same class of input as the entry of the same identifier in `@nexusdi/core`'s register. This register says how the decorators hold against it; core's says how the container does.

It runs under `nx test @nexusdi/decorators`, with the rest of the package's tests.

## Tiers

- Tier 1: the package prevents it. The test asserts the hostile input produces no effect outside the decorated class.

Counts: 4 tier 1.

## Tier 1: prevented

| ID      | Class                                                                          | CWE      | Mechanism                                                                                                                                                                                             | Test                                |
| ------- | ------------------------------------------------------------------------------ | -------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------- |
| SEC-003 | A polluted `Object.prototype` steering how a decorated class or module is read | CWE-1321 | `@Injectable` passes `declareClass` only the `deps` and `lifetime` its options set on themselves. `@Module` copies its config's own properties, and `declareModuleClass` reads them as own properties | `tier1-prevented.test.ts` › SEC-003 |
| SEC-004 | Decorator metadata written to `Object` or `Object.prototype`                   | CWE-1321 | The decorators write through `declareClass` and `declareProperty`, which write own keys of the metadata object the decorator context hands them                                                       | `tier1-prevented.test.ts` › SEC-004 |
| SEC-005 | An instance frozen in its constructor                                          | CWE-471  | `@Inject` passes its `context.access`, so the container sets the value through the accessor's private storage, which freezing does not lock                                                           | `tier1-prevented.test.ts` › SEC-005 |
| SEC-011 | Global writes                                                                  | CWE-471  | The package writes no global. Its one polyfill defines `Symbol.metadata` when it is absent, and nothing else                                                                                          | `tier1-prevented.test.ts` › SEC-011 |
