## 0.3.1

### 🛠️ Improvements

- **Stricter Type Checking**: Refactored core types and provider discrimination for improved type safety, better inference, and more robust error handling.
- **Provider Discrimination**: Enhanced internal logic to more clearly distinguish between class, value, and factory providers.
- **Codebase Cleanup**: Removed unused types, guards, and helpers for a leaner, more maintainable codebase.

### 🗑️ Removed

- **Source Maps**: Disabled all source map and declaration map generation for published npm packages, resulting in smaller and cleaner builds.

## 0.3.0

### 🚀 Features & Improvements

- **Native Decorator Metadata**: Migrated from `reflect-metadata` to the new ECMAScript/TypeScript standard using `Symbol.metadata`. No need to install or import `reflect-metadata` for NexusDI v0.3+.
- **Unified Module API**: Merged `services` and `providers` arrays in module definitions into a single `providers` array for simpler configuration.
- **Polyfill Included**: NexusDI now includes a built-in polyfill for `Symbol.metadata` for environments that do not support it natively.
- **Improved Type Safety**: Enhanced generics and overloads for decorators and containers.
- **Performance**: Further optimized for tree-shaking and minimal runtime overhead.

### 🛠️ Migration

- Update your `tsconfig.json`:
  - Remove `emitDecoratorMetadata`
  - Ensure `experimentalDecorators` and `useDefineForClassFields` are enabled
  - Set `"target": "ES2022"` or higher
- Remove all imports of `reflect-metadata`
- Update modules to use a single `providers` array

### ❤️ Thank You

- Mikael Pettersson @Evanion

## 0.2.1

### 🩹 Fixes

- correct outputPath for releases ([1509e84](https://github.com/NexusDI/core/commit/1509e84))

### ❤️ Thank You

- Mikael Pettersson @Evanion

## 0.2.0

- **Unify Nexus.set**: Unify the `set`, `setModule`, and `registerDynamicModule`
- **DynamicModules**: Add support for DynamicModules.
- **NX**: moved codebase over to NX monorepo
- **Better overloads**: Better decorator and container overloads for usabillity.

## 0.1.0

- **Core DI Container**: `Nexus` class with full dependency injection capabilities
- **Decorator System**: `@Service`, `@Inject`, `@Module`, `@Provider`, `@Injectable`, `@Optional` decorators
- **Token System**: Type-safe `Token` class for dependency identification
- **Provider Patterns**: Support for `useClass`, `useValue`, and `useFactory` providers
- **Module System**: Module registration with imports, services, and providers
- **Dynamic Modules**: `DynamicModule` base class with `config()` and `configAsync()` methods
- **Child Containers**: Container inheritance and override capabilities
- **Property Injection**: Support for injecting dependencies into class properties
- **Constructor Injection**: Automatic dependency resolution for constructor parameters
- **Alias System**: Token aliasing for flexible dependency mapping
- **Singleton Management**: Automatic singleton instance management
- **TypeScript Support**: Full TypeScript integration with generics and type safety
- **Comprehensive Examples**: Basic usage, advanced usage, and dynamic modules examples
- **React Router 7 Example**: Full-stack example with SSR, testing, and e2e tests
- **Performance Benchmarks**: Comparison with InversifyJS, tsyringe, and TypeDI
- **Complete Documentation**: 16 comprehensive documentation articles
- **Test Suite**: Unit tests, integration tests, and e2e tests with high coverage
- **CI/CD Pipeline**: GitHub Actions for testing, building, and deployment
- **Modern Tooling**: Biome for linting/formatting, Vitest for testing, TypeScript 5.x
- **Package Management**: Proper npm package configuration with peer dependencies
- **API Design**: Iteratively refined from initial concept to production-ready API
- **Documentation Structure**: Organized into logical sections with cross-references
- **Code Quality**: Comprehensive linting and formatting rules
- **Performance**: Optimized for minimal runtime overhead (~96KB total bundle size)
- **Circular Dependencies**: Resolved through proper type organization
- **Type Safety**: Improved generic usage and type inference
- **Documentation**: Fixed broken links and improved navigation
- **Testing**: Resolved decorator metadata issues in test environment
- **Build Process**: Proper TypeScript compilation and distribution
- **Dependency Management**: Updated to latest stable versions
- **Code Quality**: Comprehensive linting rules for security best practices
