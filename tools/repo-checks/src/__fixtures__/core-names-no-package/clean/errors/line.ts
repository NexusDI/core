import type { Token } from '@acme/core';

// A comment may name @acme/errors and nexus:errors; only code counts.
export const copies = 'load one copy of @acme/core, or of @acme/core/text';

export type Named = Token<string>;
