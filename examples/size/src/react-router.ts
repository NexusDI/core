import { Nexus } from '@nexusdi/core';
import { nexus } from '@nexusdi/react-router';

import { App, UserService } from './app.ts';

const di = nexus(await Nexus.create(App));
export const middleware = [di.middleware];
export const loader = di.inject({ users: UserService }, ({ users }) => ({
  users: String(users),
}));
