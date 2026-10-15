import { Nexus } from '@nexusdi/core';
import { nexus } from '@nexusdi/hono';
import { Hono } from 'hono';

import { App, UserService } from './app.ts';

const di = nexus(await Nexus.create(App));
export default new Hono().use(di.middleware).get(
  '/',
  di.inject({ users: UserService }, ({ users }, c) => c.text(String(users))),
);
