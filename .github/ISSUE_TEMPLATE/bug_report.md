---
name: Bug report
about: Create a report to help us improve
title: '[BUG] '
labels: ['bug']
assignees: ''
---

## Bug Description

A clear and concise description of what the bug is.

## Steps to Reproduce

1. Go to '...'
2. Click on '....'
3. Scroll down to '....'
4. See error

## Expected Behavior

A clear and concise description of what you expected to happen.

## Actual Behavior

A clear and concise description of what actually happened.

## Environment

- **OS**: [e.g. macOS, Windows, Linux]
- **Node.js Version**: [e.g. 18.17.0]
- **NexusDI Version**: [e.g. 0.1.0]
- **TypeScript Version**: [e.g. 5.0.0]

## Code Example

```typescript
// Minimal reproduction code
import { Nexus, Service, Inject } from 'nexusdi';

@Service()
class MyService {
  constructor(@Inject() private dependency: any) {}
}

const container = new Nexus();
// This causes the error...
```

## Error Messages

```
Error: [paste error message here]
```

## Additional Context

Add any other context about the problem here, such as:
- Screenshots
- Stack traces
- Related issues
- Workarounds you've tried

## Checklist

- [ ] I have searched existing issues to avoid duplicates
- [ ] I have provided a minimal reproduction example
- [ ] I have included all relevant environment information
- [ ] I have described the expected vs actual behavior 