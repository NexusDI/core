import fp from 'fastify-plugin';
export { fp };
export const load = () => import('hono/factory');
