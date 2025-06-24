# Container API Reference

The `Nexus` class is the main dependency injection container in NexusDI. It provides methods for registering and resolving dependencies, managing modules, and creating child containers.

## Container Instance

This article documents all public methods available on the `Nexus` container class. For an overview, see the [Nexus Class](nexus-class.md).

---

## Methods

### `get<T>(token: TokenType<T>): T`
Retrieve an instance for the given token. Throws if the provider is not registered.

```typescript
const userService = container.get(UserService);
```

---

### `has(token: TokenType): boolean`
Check if a provider is registered for the given token.

```typescript
if (container.has(UserService)) {
  // ...
}
```

---

### `set(...)`
Register a provider, module, or dynamic module configuration. The container will automatically detect the type and handle it appropriately.

```typescript
// Register a provider (class, value, or factory)
container.set(UserService, UserService);
container.set('CONFIG', { useValue: config });
container.set(Logger, { useFactory: () => new Logger() });

// Register a module class decorated with @Module
container.set(AppModule);

// Register a dynamic module configuration object
container.set({
  services: [UserService],
  providers: [
    { token: 'CONFIG', useValue: config },
  ],
});
```

---

### `resolve<T>(target: new (...args: any[]) => T): T`
Create a new instance of a class, injecting all dependencies (constructor and property injection).

```typescript
const userService = container.resolve(UserService);
```

---

### `createChildContainer(): Nexus`
Create a new child container that inherits all providers, modules, and instances from the parent.

```typescript
const requestContainer = container.createChildContainer();
```

---

### `clear(): void`
Remove all registered providers, modules, and instances from the container.

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

For more advanced usage and patterns, see the [Advanced](../advanced.md) section. 

### `setModule(moduleClass: new (...args: any[]) => any): void`  
**@deprecated** Use the unified `set()` method instead.

### `registerDynamicModule(moduleConfig: { services?: Function[]; providers?: ModuleProvider[]; imports?: Function[] }): void`  
**@deprecated** Use the unified `set()` method instead. 