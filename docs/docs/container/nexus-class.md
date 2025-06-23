---
sidebar_position: 1
---

# Nexus Class

The `Nexus` class is the core dependency injection (DI) container in NexusDI. It is responsible for:
- Registering providers (services, values, factories)
- Resolving dependencies and injecting them into classes
- Managing module registration and configuration
- Supporting advanced features like child containers and dynamic modules

You will typically create a single `Nexus` container instance for your application, or one per request in server-side scenarios.

For a full list of available methods and usage examples, see the [API Reference](api-reference.md). 