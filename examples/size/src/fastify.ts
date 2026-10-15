import { Nexus } from '@nexusdi/core';
import { nexus } from '@nexusdi/fastify';
import Fastify from 'fastify';

import { App, UserService } from './app.ts';

const di = nexus(await Nexus.create(App));
const app = Fastify();
await app.register(di.plugin);
app.get(
  '/',
  di.inject({ users: UserService }, ({ users }) => String(users)),
);
export default app;
