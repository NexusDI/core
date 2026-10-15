import { Nexus } from '@nexusdi/core';
import { nexus } from '@nexusdi/express';
import express from 'express';

import { App, UserService } from './app.ts';

const di = nexus(await Nexus.create(App));
const app = express();
app.use(di.middleware);
app.get(
  '/',
  di.inject(
    { users: UserService },
    ({ users }, _req, res) => void res.send(String(users)),
  ),
);
export default app;
