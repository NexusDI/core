import { Nexus } from '@nexusdi/core';
import { NexusProvider, useService } from '@nexusdi/react';
import { createElement } from 'react';

import { App, UserService } from './app.ts';

function Users() {
  return createElement('p', null, String(useService(UserService)));
}

export const page = createElement(
  NexusProvider,
  { container: await Nexus.create(App) },
  createElement(Users),
);
