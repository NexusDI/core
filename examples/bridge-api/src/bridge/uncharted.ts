import { Token } from '@nexusdi/core';

/** Bound nowhere: the missing-provider case of the e2e suite resolves it and answers 500. */
export const UNCHARTED = new Token<{ plot(): void }>('Uncharted');
