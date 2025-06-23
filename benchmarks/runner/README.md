# Performance Benchmarks

This directory contains tools to validate and compare performance numbers for NexusDI and other dependency injection libraries.

## Quick Start

### Validate NexusDI Performance

```bash
npm run validate
```

This will:
- Measure NexusDI startup time, resolution time, and memory usage
- Compare results with documented numbers
- Generate a validation report
- Show comparison table with other libraries

### Run Full Benchmarks

```bash
npm run benchmark
```

This runs comprehensive benchmarks and saves detailed results.

## What Gets Measured

### 1. Startup Time
- Time to create container and register services
- Measured over 1,000 iterations
- Reports average, minimum, and maximum times

### 2. Resolution Time
- Time to resolve a service from the container
- Measured over 10,000 iterations
- Reports average, minimum, and maximum times

### 3. Memory Usage
- Additional heap memory used by the DI container
- Measured in KB
- Includes container and registered services

### 4. Bundle Size
- Core library size
- Dependencies size (reflect-metadata)
- Total bundle impact

## Test Scenario

The benchmarks use a realistic scenario with:
- `ILogger` service for logging
- `IDatabase` service for data access
- `IUserService` service with dependencies

This represents a typical DI setup with multiple services and dependencies.

## Validating Other Libraries

To validate performance numbers for other libraries:

### 1. Install the Library
```bash
npm install inversify reflect-metadata
npm install tsyringe reflect-metadata
npm install typedi reflect-metadata
```

### 2. Create Test Classes
Create similar test classes using the library's decorators:

**InversifyJS Example:**
```typescript
import { Container, injectable, inject } from 'inversify';

@injectable()
class Logger implements ILogger {
  log(message: string) {}
}

@injectable()
class UserService implements IUserService {
  constructor(
    @inject('DATABASE') private database: IDatabase,
    @inject('LOGGER') private logger: ILogger
  ) {}
}
```

**tsyringe Example:**
```typescript
import { container, injectable, inject } from 'tsyringe';

@injectable()
class Logger implements ILogger {
  log(message: string) {}
}

@injectable()
class UserService implements IUserService {
  constructor(
    @inject('DATABASE') private database: IDatabase,
    @inject('LOGGER') private logger: ILogger
  ) {}
}
```

### 3. Run Benchmarks
Use the same measurement approach as in `validate-numbers.ts`:

```typescript
// Measure startup time
const start = performance.now();
const container = new Container();
container.bind<ILogger>('LOGGER').to(Logger);
container.bind<IDatabase>('DATABASE').to(Database);
container.bind<IUserService>('USER_SERVICE').to(UserService);
const end = performance.now();
const startupTime = end - start;

// Measure resolution time
const resolutionStart = performance.now();
container.get('USER_SERVICE');
const resolutionEnd = performance.now();
const resolutionTime = resolutionEnd - resolutionStart;
```

## Expected Results

### NexusDI
- **Startup Time**: 1.3μs
- **Resolution Time**: 0.2μs
- **Memory Usage**: 6KB
- **Bundle Size**: 96KB (core + deps)

### Other Libraries (Documented)
- **NestJS**: 50-100ms startup, ~500KB memory, 3MB+ bundle
- **InversifyJS**: 22.2μs startup, 32KB memory, 114KB bundle
- **Awilix**: <1ms startup, ~50KB memory, 15KB bundle
- **TypeDI**: 2.0μs startup, 2KB memory, 89KB bundle
- **tsyringe**: 45.2μs startup, 150KB memory, 99KB bundle

## Output Files

- `validation-report.json`: Detailed NexusDI validation results
- `library-comparison.json`: Comparison results across libraries
- `results.json`: General benchmark results

## Contributing

When updating performance numbers in the documentation:

1. Run `npm run validate` to get current measurements
2. Update the performance.md file with validated numbers
3. Include the validation report as evidence
4. Consider running benchmarks on different environments (Node.js versions, platforms)

## Notes

- Results may vary based on Node.js version, platform, and system resources
- Bundle sizes are approximate and may change with library updates
- Memory usage includes garbage collection overhead
- Startup times include metadata processing and container initialization 