import { defineModule, provide } from '@nexusdi/core';
import { UserService } from './user.service';
import { USER_SERVICE_TOKEN, USERS_CONFIG_TOKEN } from './users.types';

export const UsersModule = defineModule({
  name: 'UsersModule',
  options: USERS_CONFIG_TOKEN,
  providers: [
    provide(USER_SERVICE_TOKEN, {
      useClass: UserService,
      deps: [USERS_CONFIG_TOKEN],
    }),
  ],
  exports: [USER_SERVICE_TOKEN],
});
