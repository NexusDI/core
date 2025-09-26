import { Module } from '@nexusdi/core';
import type { DynamicModule } from '@nexusdi/core';
import { USERS_CONFIG_TOKEN, type UsersConfig } from './users.types';
import { UserService } from './user.service';

@Module({
  providers: [UserService],
})
export class UsersModule implements DynamicModule<UsersConfig> {
  readonly configToken = USERS_CONFIG_TOKEN;
}
