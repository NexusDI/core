import { Nexus, Token } from '@nexusdi/core';
import {
  interceptor,
  interceptors,
  tap,
  type Interceptor,
} from '@nexusdi/interceptors';

import { App, UserService } from './app.ts';

const LOG = new Token<Interceptor>('Log');

const app = await Nexus.create(App, {
  plugins: [
    interceptors({
      register: [
        interceptor(LOG, {
          useValue: { intercept: (_call, next) => tap(next, {}) },
        }),
      ],
      global: [LOG],
    }),
  ],
});
app.get(UserService).logger.log('ready');
