# Story test cases

These tests are structured as a real-world usecase, and atempt to use all the available APIs.
This is to validate that they work.

They are structured around a "story" project, simulating a ecommerce backend.

it should have a minimum of each:

- Undecorated class based service
- Decorated class based service
- Custom token services/providers, and minimum 1 service that doesn't use a custom token
- value provider sync/async
- factory provider sync/async
- A unconfigurable module
- a configurable module
- an optional injected dependency

The test suite should handle both happy and sad paths.
