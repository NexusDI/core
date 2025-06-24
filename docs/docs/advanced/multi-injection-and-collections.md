---
sidebar_position: 11
---

# Multi-Injection & Collections

Learn how to inject multiple services, work with collections, and handle complex dependency scenarios in NexusDI. Like a Star Citizen ship with modular components, you can assemble complex systems from multiple interchangeable parts.

> See also: [Advanced Providers](advanced-providers-and-factories.md), [Module Patterns](../module-patterns.md)

## What Are Multi-Injections?

Multi-injection allows you to inject multiple services that share a common interface or token. This is useful for plugins, handlers, processors, and other scenarios where you need to work with collections of services.

```typescript
// Basic multi-injection pattern
@Service(PLUGIN_MANAGER)
class PluginManager {
  constructor(@InjectAll(PLUGIN) private plugins: IPlugin[]) {}

  async initializeAll(): Promise<void> {
    for (const plugin of this.plugins) {
      await plugin.initialize();
    }
  }
}
```

## Basic Multi-Injection Patterns

### Array Injection

```typescript
// Inject all services with the same token
@Service(LOGGER_MANAGER)
class LoggerManager {
  constructor(@InjectAll(LOGGER) private loggers: ILogger[]) {}

  log(message: string, level: LogLevel): void {
    for (const logger of this.loggers) {
      logger.log(message, level);
    }
  }
}

// Register multiple loggers
container.set(LOGGER, { useClass: ConsoleLogger });
container.set(LOGGER, { useClass: FileLogger });
container.set(LOGGER, { useClass: DatabaseLogger });

// All loggers will be injected into LoggerManager
const loggerManager = container.get(LOGGER_MANAGER);
```

### Interface-Based Collections

```typescript
// Define a common interface
interface IEventHandler {
  handle(event: Event): Promise<void>;
  canHandle(eventType: string): boolean;
}

// Multiple event handlers
@Service(EVENT_HANDLER)
class UserEventHandler implements IEventHandler {
  canHandle(eventType: string): boolean {
    return eventType === 'user.created' || eventType === 'user.updated';
  }

  async handle(event: Event): Promise<void> {
    console.log('Handling user event:', event);
  }
}

@Service(EVENT_HANDLER)
class OrderEventHandler implements IEventHandler {
  canHandle(eventType: string): boolean {
    return eventType === 'order.created' || eventType === 'order.completed';
  }

  async handle(event: Event): Promise<void> {
    console.log('Handling order event:', event);
  }
}

// Event dispatcher that uses all handlers
@Service(EVENT_DISPATCHER)
class EventDispatcher {
  constructor(@InjectAll(EVENT_HANDLER) private handlers: IEventHandler[]) {}

  async dispatch(event: Event): Promise<void> {
    const relevantHandlers = this.handlers.filter((handler) =>
      handler.canHandle(event.type)
    );

    await Promise.all(relevantHandlers.map((handler) => handler.handle(event)));
  }
}
```

### Token-Based Collections

```typescript
// Use tokens to group related services
const VALIDATOR = createToken<IValidator>('VALIDATOR');
const EMAIL_VALIDATOR = createToken<IValidator>('EMAIL_VALIDATOR');
const PASSWORD_VALIDATOR = createToken<IValidator>('PASSWORD_VALIDATOR');

@Service(EMAIL_VALIDATOR)
class EmailValidator implements IValidator {
  validate(value: string): boolean {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
  }
}

@Service(PASSWORD_VALIDATOR)
class PasswordValidator implements IValidator {
  validate(value: string): boolean {
    return value.length >= 8 && /[A-Z]/.test(value) && /[0-9]/.test(value);
  }
}

// Form validator that uses all validators
@Service(FORM_VALIDATOR)
class FormValidator {
  constructor(@InjectAll(VALIDATOR) private validators: IValidator[]) {}

  validateForm(data: any): ValidationResult {
    const errors: string[] = [];

    for (const validator of this.validators) {
      if (!validator.validate(data)) {
        errors.push(`Validation failed for ${validator.constructor.name}`);
      }
    }

    return { isValid: errors.length === 0, errors };
  }
}
```

## Advanced Collection Patterns

### Filtered Collections

```typescript
// Inject services based on metadata or conditions
@Service(PLUGIN_LOADER)
class PluginLoader {
  constructor(@InjectAll(PLUGIN) private allPlugins: IPlugin[]) {}

  getEnabledPlugins(): IPlugin[] {
    return this.allPlugins.filter((plugin) => plugin.isEnabled());
  }

  getPluginsByType(type: string): IPlugin[] {
    return this.allPlugins.filter((plugin) => plugin.getType() === type);
  }

  getPluginsByPriority(): IPlugin[] {
    return this.allPlugins.sort((a, b) => b.getPriority() - a.getPriority());
  }
}

// Plugin interface with metadata
interface IPlugin {
  initialize(): Promise<void>;
  isEnabled(): boolean;
  getType(): string;
  getPriority(): number;
}

@Service(PLUGIN)
class LoggingPlugin implements IPlugin {
  async initialize(): Promise<void> {
    console.log('Initializing logging plugin');
  }

  isEnabled(): boolean {
    return process.env.ENABLE_LOGGING === 'true';
  }

  getType(): string {
    return 'logging';
  }

  getPriority(): number {
    return 1;
  }
}
```

### Ordered Collections

```typescript
// Inject services in a specific order
@Service(PIPELINE_PROCESSOR)
class PipelineProcessor {
  constructor(@InjectAll(PIPELINE_STAGE) private stages: IPipelineStage[]) {}

  async process(data: any): Promise<any> {
    // Sort stages by order
    const orderedStages = this.stages.sort(
      (a, b) => a.getOrder() - b.getOrder()
    );

    let result = data;
    for (const stage of orderedStages) {
      result = await stage.process(result);
    }

    return result;
  }
}

interface IPipelineStage {
  process(data: any): Promise<any>;
  getOrder(): number;
}

@Service(PIPELINE_STAGE)
class ValidationStage implements IPipelineStage {
  async process(data: any): Promise<any> {
    console.log('Validating data...');
    return data;
  }

  getOrder(): number {
    return 1;
  }
}

@Service(PIPELINE_STAGE)
class TransformationStage implements IPipelineStage {
  async process(data: any): Promise<any> {
    console.log('Transforming data...');
    return { ...data, transformed: true };
  }

  getOrder(): number {
    return 2;
  }
}
```

### Conditional Collections

```typescript
// Inject services based on runtime conditions
@Service(CONDITIONAL_SERVICE_MANAGER)
class ConditionalServiceManager {
  constructor(
    @InjectAll(CONDITIONAL_SERVICE) private services: IConditionalService[]
  ) {}

  getActiveServices(context: ServiceContext): IConditionalService[] {
    return this.services.filter((service) => service.isActive(context));
  }

  async executeActiveServices(context: ServiceContext): Promise<void> {
    const activeServices = this.getActiveServices(context);

    await Promise.all(
      activeServices.map((service) => service.execute(context))
    );
  }
}

interface IConditionalService {
  isActive(context: ServiceContext): boolean;
  execute(context: ServiceContext): Promise<void>;
}

@Service(CONDITIONAL_SERVICE)
class DevelopmentService implements IConditionalService {
  isActive(context: ServiceContext): boolean {
    return process.env.NODE_ENV === 'development';
  }

  async execute(context: ServiceContext): Promise<void> {
    console.log('Executing development service');
  }
}

@Service(CONDITIONAL_SERVICE)
class ProductionService implements IConditionalService {
  isActive(context: ServiceContext): boolean {
    return process.env.NODE_ENV === 'production';
  }

  async execute(context: ServiceContext): Promise<void> {
    console.log('Executing production service');
  }
}
```

## Collection Management Patterns

### Collection Registry

```typescript
// Registry pattern for managing collections
class CollectionRegistry<T> {
  private collections = new Map<string, T[]>();

  register(collectionName: string, item: T): void {
    if (!this.collections.has(collectionName)) {
      this.collections.set(collectionName, []);
    }

    this.collections.get(collectionName)!.push(item);
  }

  get(collectionName: string): T[] {
    return this.collections.get(collectionName) || [];
  }

  getAll(): Map<string, T[]> {
    return new Map(this.collections);
  }
}

// Usage with dependency injection
@Service(COLLECTION_REGISTRY)
class ServiceRegistry extends CollectionRegistry<IService> {
  // Extend with service-specific functionality
}

@Service(SERVICE_MANAGER)
class ServiceManager {
  constructor(@Inject(COLLECTION_REGISTRY) private registry: ServiceRegistry) {}

  registerService(service: IService): void {
    this.registry.register('services', service);
  }

  getServices(): IService[] {
    return this.registry.get('services');
  }
}
```

### Collection Factory

```typescript
// Factory pattern for creating collections
class CollectionFactory {
  static createFilteredCollection<T>(
    items: T[],
    filter: (item: T) => boolean
  ): T[] {
    return items.filter(filter);
  }

  static createOrderedCollection<T>(
    items: T[],
    orderBy: (item: T) => number
  ): T[] {
    return [...items].sort((a, b) => orderBy(a) - orderBy(b));
  }

  static createGroupedCollection<T, K>(
    items: T[],
    groupBy: (item: T) => K
  ): Map<K, T[]> {
    const groups = new Map<K, T[]>();

    for (const item of items) {
      const key = groupBy(item);
      if (!groups.has(key)) {
        groups.set(key, []);
      }
      groups.get(key)!.push(item);
    }

    return groups;
  }
}

// Usage with dependency injection
@Service(COLLECTION_PROCESSOR)
class CollectionProcessor {
  constructor(@InjectAll(PROCESSOR) private processors: IProcessor[]) {}

  processByType(): Map<string, IProcessor[]> {
    return CollectionFactory.createGroupedCollection(
      this.processors,
      (processor) => processor.getType()
    );
  }

  processByPriority(): IProcessor[] {
    return CollectionFactory.createOrderedCollection(
      this.processors,
      (processor) => processor.getPriority()
    );
  }
}
```

## Real-World Examples

### Example 1: Plugin System

```typescript
// Plugin system with multi-injection
interface IPlugin {
  name: string;
  version: string;
  initialize(): Promise<void>;
  execute(data: any): Promise<any>;
  cleanup(): Promise<void>;
}

@Service(PLUGIN)
class LoggingPlugin implements IPlugin {
  name = 'logging';
  version = '1.0.0';

  async initialize(): Promise<void> {
    console.log('Initializing logging plugin');
  }

  async execute(data: any): Promise<any> {
    console.log('Logging data:', data);
    return data;
  }

  async cleanup(): Promise<void> {
    console.log('Cleaning up logging plugin');
  }
}

@Service(PLUGIN)
class ValidationPlugin implements IPlugin {
  name = 'validation';
  version = '1.0.0';

  async initialize(): Promise<void> {
    console.log('Initializing validation plugin');
  }

  async execute(data: any): Promise<any> {
    if (!data) {
      throw new Error('Data is required');
    }
    return data;
  }

  async cleanup(): Promise<void> {
    console.log('Cleaning up validation plugin');
  }
}

@Service(PLUGIN_MANAGER)
class PluginManager {
  constructor(@InjectAll(PLUGIN) private plugins: IPlugin[]) {}

  async initializeAll(): Promise<void> {
    console.log(`Initializing ${this.plugins.length} plugins...`);

    for (const plugin of this.plugins) {
      await plugin.initialize();
    }
  }

  async executeAll(data: any): Promise<any> {
    let result = data;

    for (const plugin of this.plugins) {
      result = await plugin.execute(result);
    }

    return result;
  }

  async cleanupAll(): Promise<void> {
    for (const plugin of this.plugins) {
      await plugin.cleanup();
    }
  }

  getPluginByName(name: string): IPlugin | undefined {
    return this.plugins.find((plugin) => plugin.name === name);
  }
}
```

### Example 2: Event Handler System

```typescript
// Event handler system with multi-injection
interface IEventHandler<T = any> {
  eventType: string;
  handle(event: T): Promise<void>;
  priority: number;
}

@Service(EVENT_HANDLER)
class UserCreatedHandler implements IEventHandler<UserCreatedEvent> {
  eventType = 'user.created';
  priority = 1;

  async handle(event: UserCreatedEvent): Promise<void> {
    console.log('Handling user created event:', event.userId);
    // Send welcome email, create profile, etc.
  }
}

@Service(EVENT_HANDLER)
class UserUpdatedHandler implements IEventHandler<UserUpdatedEvent> {
  eventType = 'user.updated';
  priority = 2;

  async handle(event: UserUpdatedEvent): Promise<void> {
    console.log('Handling user updated event:', event.userId);
    // Update cache, notify other services, etc.
  }
}

@Service(EVENT_HANDLER)
class OrderCreatedHandler implements IEventHandler<OrderCreatedEvent> {
  eventType = 'order.created';
  priority = 1;

  async handle(event: OrderCreatedEvent): Promise<void> {
    console.log('Handling order created event:', event.orderId);
    // Process payment, update inventory, etc.
  }
}

@Service(EVENT_BUS)
class EventBus {
  constructor(@InjectAll(EVENT_HANDLER) private handlers: IEventHandler[]) {}

  async publish<T>(event: T): Promise<void> {
    const eventType = (event as any).type;
    const relevantHandlers = this.handlers
      .filter((handler) => handler.eventType === eventType)
      .sort((a, b) => a.priority - b.priority);

    console.log(
      `Publishing ${eventType} to ${relevantHandlers.length} handlers`
    );

    for (const handler of relevantHandlers) {
      await handler.handle(event);
    }
  }

  getHandlersByType(eventType: string): IEventHandler[] {
    return this.handlers.filter((handler) => handler.eventType === eventType);
  }
}
```

### Example 3: Middleware Pipeline

```typescript
// Middleware pipeline with multi-injection
interface IMiddleware {
  name: string;
  process(request: Request, next: () => Promise<Response>): Promise<Response>;
  order: number;
}

@Service(MIDDLEWARE)
class LoggingMiddleware implements IMiddleware {
  name = 'logging';
  order = 1;

  async process(
    request: Request,
    next: () => Promise<Response>
  ): Promise<Response> {
    console.log(`[${this.name}] Processing request:`, request.url);

    const start = performance.now();
    const response = await next();
    const duration = performance.now() - start;

    console.log(`[${this.name}] Request completed in ${duration.toFixed(3)}ms`);

    return response;
  }
}

@Service(MIDDLEWARE)
class AuthenticationMiddleware implements IMiddleware {
  name = 'authentication';
  order = 2;

  async process(
    request: Request,
    next: () => Promise<Response>
  ): Promise<Response> {
    console.log(`[${this.name}] Authenticating request`);

    if (!request.headers.authorization) {
      throw new Error('Authentication required');
    }

    return next();
  }
}

@Service(MIDDLEWARE)
class ValidationMiddleware implements IMiddleware {
  name = 'validation';
  order = 3;

  async process(
    request: Request,
    next: () => Promise<Response>
  ): Promise<Response> {
    console.log(`[${this.name}] Validating request`);

    if (!request.body) {
      throw new Error('Request body is required');
    }

    return next();
  }
}

@Service(MIDDLEWARE_PIPELINE)
class MiddlewarePipeline {
  constructor(@InjectAll(MIDDLEWARE) private middlewares: IMiddleware[]) {}

  async process(
    request: Request,
    handler: () => Promise<Response>
  ): Promise<Response> {
    const orderedMiddlewares = this.middlewares.sort(
      (a, b) => a.order - b.order
    );

    const executeMiddleware = async (index: number): Promise<Response> => {
      if (index >= orderedMiddlewares.length) {
        return handler();
      }

      const middleware = orderedMiddlewares[index];
      return middleware.process(request, () => executeMiddleware(index + 1));
    };

    return executeMiddleware(0);
  }
}
```

## Performance Considerations

### Collection Resolution Performance

```typescript
// Measure collection resolution performance
class CollectionPerformanceMonitor {
  static measureResolutionTime<T>(
    container: Nexus,
    token: TokenType<T[]>
  ): number {
    const start = performance.now();
    container.get(token);
    return performance.now() - start;
  }

  static compareCollectionSizes(container: Nexus): void {
    const tokens = [LOGGER, PLUGIN, EVENT_HANDLER, MIDDLEWARE];

    for (const token of tokens) {
      const items = container.get(token);
      console.log(`${token.toString()}: ${items.length} items`);
    }
  }
}

// Usage
const resolutionTime = CollectionPerformanceMonitor.measureResolutionTime(
  container,
  PLUGIN
);
console.log(`Plugin collection resolution: ${resolutionTime.toFixed(3)}ms`);

CollectionPerformanceMonitor.compareCollectionSizes(container);
```

### Lazy Collection Loading

```typescript
// Lazy loading for large collections
@Service(LAZY_COLLECTION_MANAGER)
class LazyCollectionManager {
  private cachedCollections = new Map<string, any[]>();

  constructor(@InjectAll(LAZY_LOADABLE) private loadables: ILazyLoadable[]) {}

  getCollection(name: string): any[] {
    if (!this.cachedCollections.has(name)) {
      const collection = this.loadables
        .filter((item) => item.getCollectionName() === name)
        .map((item) => item.load());

      this.cachedCollections.set(name, collection);
    }

    return this.cachedCollections.get(name)!;
  }

  clearCache(): void {
    this.cachedCollections.clear();
  }
}

interface ILazyLoadable {
  getCollectionName(): string;
  load(): any;
}
```

## Testing Collections

### Unit Testing Collections

```typescript
describe('Multi-Injection Collections', () => {
  let container: Nexus;

  beforeEach(() => {
    container = new Nexus();
  });

  it('should inject all services with the same token', () => {
    // Register multiple services
    container.set(LOGGER, { useClass: ConsoleLogger });
    container.set(LOGGER, { useClass: FileLogger });
    container.set(LOGGER, { useClass: DatabaseLogger });

    const loggerManager = container.get(LOGGER_MANAGER);

    expect(loggerManager.loggers).toHaveLength(3);
    expect(loggerManager.loggers[0]).toBeInstanceOf(ConsoleLogger);
    expect(loggerManager.loggers[1]).toBeInstanceOf(FileLogger);
    expect(loggerManager.loggers[2]).toBeInstanceOf(DatabaseLogger);
  });

  it('should handle empty collections', () => {
    const loggerManager = container.get(LOGGER_MANAGER);

    expect(loggerManager.loggers).toHaveLength(0);
  });

  it('should filter collections based on conditions', () => {
    container.set(PLUGIN, { useClass: EnabledPlugin });
    container.set(PLUGIN, { useClass: DisabledPlugin });

    const pluginLoader = container.get(PLUGIN_LOADER);
    const enabledPlugins = pluginLoader.getEnabledPlugins();

    expect(enabledPlugins).toHaveLength(1);
    expect(enabledPlugins[0]).toBeInstanceOf(EnabledPlugin);
  });
});
```

### Integration Testing

```typescript
describe('Collection Integration', () => {
  let container: Nexus;

  beforeEach(() => {
    container = new Nexus();
  });

  it('should process collections in order', async () => {
    container.set(PIPELINE_STAGE, { useClass: Stage1 });
    container.set(PIPELINE_STAGE, { useClass: Stage2 });
    container.set(PIPELINE_STAGE, { useClass: Stage3 });

    const processor = container.get(PIPELINE_PROCESSOR);
    const result = await processor.process({ data: 'test' });

    expect(result.order).toEqual([1, 2, 3]);
  });

  it('should handle event dispatching', async () => {
    container.set(EVENT_HANDLER, { useClass: UserEventHandler });
    container.set(EVENT_HANDLER, { useClass: OrderEventHandler });

    const eventBus = container.get(EVENT_BUS);
    const event = { type: 'user.created', userId: '123' };

    await expect(eventBus.publish(event)).resolves.not.toThrow();
  });
});
```

## Best Practices

### 1. Use Clear Interfaces

```typescript
// ✅ Good - Clear interface for collection items
interface IPlugin {
  name: string;
  initialize(): Promise<void>;
  execute(data: any): Promise<any>;
}

// ❌ Bad - Vague interface
interface IPlugin {
  doSomething(): void;
}
```

### 2. Handle Empty Collections

```typescript
// ✅ Good - Handle empty collections gracefully
@Service(PLUGIN_MANAGER)
class PluginManager {
  constructor(@InjectAll(PLUGIN) private plugins: IPlugin[]) {}

  async initializeAll(): Promise<void> {
    if (this.plugins.length === 0) {
      console.log('No plugins to initialize');
      return;
    }

    for (const plugin of this.plugins) {
      await plugin.initialize();
    }
  }
}
```

### 3. Use Appropriate Collection Types

```typescript
// ✅ Good - Use appropriate collection types
@Service(EVENT_DISPATCHER)
class EventDispatcher {
  constructor(@InjectAll(EVENT_HANDLER) private handlers: IEventHandler[]) {}

  async dispatch(event: Event): Promise<void> {
    // Use Promise.all for parallel execution
    await Promise.all(this.handlers.map((handler) => handler.handle(event)));
  }
}
```

### 4. Consider Performance for Large Collections

```typescript
// ✅ Good - Optimize for large collections
@Service(LARGE_COLLECTION_PROCESSOR)
class LargeCollectionProcessor {
  constructor(@InjectAll(ITEM) private items: IItem[]) {}

  processInBatches(batchSize = 100): void {
    for (let i = 0; i < this.items.length; i += batchSize) {
      const batch = this.items.slice(i, i + batchSize);
      this.processBatch(batch);
    }
  }

  private processBatch(batch: IItem[]): void {
    // Process batch
  }
}
```

## Next Steps

- **[Advanced Providers](advanced-providers-and-factories.md)** - Learn about advanced provider patterns
- **[Module Patterns](../module-patterns.md)** - Organize collections in modules
- **[Performance Tuning](performance-tuning.md)** - Optimize collection performance

Remember: Collections are like modular ship components - they let you assemble complex systems from interchangeable parts, but make sure each component has a clear purpose and interface! 🚀✨
