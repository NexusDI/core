import { Token } from './token.js';

/**
 * What `createScope({ request })` carries. Applications add fields through
 * module augmentation:
 *
 *     declare module '@nexusdi/core' {
 *       interface NexusRequest { mission: Mission }
 *     }
 */
// eslint-disable-next-line @typescript-eslint/no-empty-object-type, @typescript-eslint/no-empty-interface -- empty on purpose; applications augment it
export interface NexusRequest {}

/** The built-in scoped token for the request a scope was created with. Visible in every module. */
export const REQUEST: Token<NexusRequest> = new Token<NexusRequest>('REQUEST');
