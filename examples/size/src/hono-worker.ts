// The offline Worker of examples/bridge-api/src/worker.offline.ts at its
// smallest: the container built at module scope, a request scope through
// nodeScopes(), and Hono bundled in. The whole bundle is the figure a
// Workers user compares with the platform's size limit (spec 9.6).
import { Nexus } from '@nexusdi/core';
import { nexus } from '@nexusdi/hono';
import { nodeScopes } from '@nexusdi/node';
import { Hono } from 'hono';

import { App, UserService } from './app.ts';

const di = nexus(await Nexus.create(App), { scopes: nodeScopes() });
export default new Hono().use(di.middleware).get(
  '/',
  di.inject({ users: UserService }, ({ users }, c) => c.text(String(users))),
);
