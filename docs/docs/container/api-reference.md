# Container API Reference

The `Nexus` class is the main dependency injection container in NexusDI. It provides methods for registering and resolving dependencies, managing modules, and creating child containers.

## Container Instance

This article documents all public methods available on the `Nexus` container class. For an overview, see the [Nexus Class](nexus-class.md).

---

## Methods

### `get<T>(token: TokenType<T>): T`

Retrieve an instance for the given token from the container's registry. Throws if the provider is not registered.

- If the token is registered as a singleton, always returns the same instance.
- If the token is registered as a factory or value, returns the result/value.
- Throws if the provider is not registered.

```typescript
const userService = container.get(USER_SERVICE);
```

---

### `has(token: TokenType): boolean`

Check if a provider is registered for the given token.

```typescript
if (container.has(USER_SERVICE)) {
  // ...
}
```

---

### `set(...)`

Register a provider, module, or dynamic module configuration. The container will automatically detect the type and handle it appropriately.

- You must register a decorated class (with `@Service` or `@Provider`) or a valid provider object (`{ useClass, useValue, useFactory }`).
- Tokens must be a `Token<T>`, symbol, or class constructor (no string tokens).

```typescript
// Register a provider (class, value, or factory)
container.set(USER_SERVICE, UserService); // UserService must be decorated
container.set(LOGGER, { useValue: new ConsoleLogger() });
container.set(DATABASE, { useFactory: () => new PostgresDatabase() });

// Register a module class decorated with @Module
container.set(AppModule);

// Register a dynamic module configuration object
container.set({
  providers: [UserService],
  providers: [{ token: LOGGER, useValue: new ConsoleLogger() }],
});
```

---

### `resolve<T>(target: new (...args: any[]) => T): T`

Instantiates a new instance of the given class, resolving and injecting all dependencies.

- Only accepts a class constructor. Unlike `get`, this does not require the class to be registered as a provider and always returns a new instance.
- Useful for transient or ad-hoc objects that are not managed by the container's provider registry.
- Throws if dependencies cannot be resolved or if a non-constructor is passed.

```typescript
const userService = container.resolve(UserService); // UserService must be a class constructor
```

---

### `createChildContainer(): Nexus`

Creates a new child container that inherits from the current container. Useful for request-scoped or session-scoped dependencies.

```typescript
const requestContainer = container.createChildContainer();
requestContainer.set(REQUEST_ID, { useValue: generateRequestId() });
const userService = requestContainer.get(USER_SERVICE);
```

---

### `clear()`

Clears all registered providers and instances from the container.

```typescript
container.clear();
```

---

### `list(): { providers: TokenType[]; modules: string[] }`

List all registered provider tokens and module class names.

```typescript
const { providers, modules } = container.list();
console.log('Providers:', providers);
console.log('Modules:', modules);
```

---

For more advanced usage and patterns, see the [Advanced](../advanced/advanced.md) section.
