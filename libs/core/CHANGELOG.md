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
