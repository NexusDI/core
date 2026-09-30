import { errors } from '@acme/errors';
import type { Pack } from '@acme/core/text';

export type { NexusGraph } from '@acme/devtools';

export type Testing = typeof import('@acme/testing');

declare module '@acme/federation' {}

export const node = () => import('@acme/node');

export const pack: Pack | undefined = errors;
