/** The frameworks the bridge serves, which each route and e2e case runs on. */
export const FRAMEWORKS = ['hono', 'express', 'fastify'] as const;
export type Framework = (typeof FRAMEWORKS)[number];
