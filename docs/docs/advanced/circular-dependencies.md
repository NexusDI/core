---
sidebar_position: 9
---

# Circular Dependencies

Circular dependencies are a common challenge in dependency injection systems. This article explains what they are, why they cause problems, and how to avoid or work around them in NexusDI.

> See also: [Debugging & Diagnostics](debugging-and-diagnostics.md), [Roadmap](../roadmap.md)

## What is a Circular Dependency?

A circular dependency occurs when two or more services depend on each other, either directly or indirectly. For example:

```typescript
@Service()
class ServiceA {
  constructor(@Inject(ServiceB) private b: ServiceB) {}
}

@Service()
class ServiceB {
  constructor(@Inject(ServiceA) private a: ServiceA) {}
}
```

This creates a cycle: `ServiceA` → `ServiceB` → `ServiceA`.

## Why is This a Problem?
- The DI container cannot construct either service without the other already being available.
- This usually results in a runtime error like "No provider found for token: ServiceA" or a stack overflow.
- Circular dependencies make code harder to understand, test, and maintain.

## Common Symptoms
- Errors about missing providers or tokens
- Stack overflows or infinite recursion
- Unexpected `undefined` values in constructors

## How to Avoid Circular Dependencies

### 1. Refactor to Remove the Cycle
- Split responsibilities so that services do not depend on each other directly.
- Introduce a third service to mediate between the two.

```typescript
@Service()
class Mediator {
  constructor(
    @Inject(ServiceA) private a: ServiceA,
    @Inject(ServiceB) private b: ServiceB
  ) {}
}
```

### 2. Depend on Interfaces, Not Implementations
- Use interfaces or tokens to decouple services.
- This allows you to inject only what is needed, reducing the chance of a cycle.

### 3. Move Shared Logic to a Utility or Helper
- Extract common functionality into a stateless helper or utility class.

## Workarounds for Circular Dependencies

> **Warning:** These are workarounds, not best practices. Prefer refactoring if possible.

### 1. Property Injection
- Inject the dependency after construction, rather than in the constructor.

> **Note:** Property-injected dependencies are only available after the constructor has finished. If you try to use the property in the constructor, it will be `undefined`. Only use the property in methods called after construction.

```typescript
@Service()
class ServiceA {
  @Inject(ServiceB) b!: ServiceB;
  constructor(@Inject(OtherDep) private other: OtherDep) {
    // this.b is undefined here!
  }
  doSomething() {
    this.b.doWork(); // this.b is set here
  }
}
```

### 2. Lazy Resolution
- Use a factory or a function to resolve the dependency only when needed.

> **Caution:** This pattern only works if the lazy function is not called during construction. Only call the function after all services are constructed (e.g., in a method, not in the constructor). If you call the function in the constructor, you will still get a circular dependency error or `undefined`.

```typescript
@Service()
class ServiceA {
  constructor(@Inject('getServiceB') private getB: () => ServiceB) {}

  doSomething() {
    const b = this.getB(); // Safe: resolved only when needed
    b.doWork();
  }
}

container.set('getServiceB', { useValue: () => container.get(ServiceB) });
```

### 3. Use Factories for One Side of the Cycle
- Provide one of the services via a factory that resolves the other only when needed.

> **Caution:** If the service has other dependencies, you must resolve all of them manually in the factory. This approach is manual, brittle, and not scalable—prefer refactoring or property/lazy injection if possible.

```typescript
// If ServiceA has other dependencies:
@Service()
class ServiceA {
  constructor(
    @Inject(ServiceB) private b: ServiceB,
    @Inject(OtherDep) private other: OtherDep
  ) {}
}

container.set(ServiceA, {
  useFactory: () => new ServiceA(
    container.get(ServiceB),
    container.get(OtherDep)
  ),
});
```

- You must keep the factory in sync with the constructor signature.
- If you add/remove dependencies, you must update the factory.
- This is only practical for simple cases or as a last-resort workaround.

**Tip:** If possible, use property injection for the circular dependency and let the container inject the rest:

```typescript
@Service()
class ServiceA {
  @Inject(ServiceB) b!: ServiceB;
  constructor(@Inject(OtherDep) private other: OtherDep) {}
}
```

## Roadmap: First-class Circular Dependency Support

NexusDI plans to add built-in support for resolving certain circular dependencies (e.g., via proxies or lazy injection). See the [Roadmap](../roadmap.md) for details.

---

If you encounter a circular dependency, try to refactor first. Use workarounds only as a last resort, and watch for future improvements in NexusDI! 