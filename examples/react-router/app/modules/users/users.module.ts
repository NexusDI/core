import { Module, DynamicModule } from '@nexusdi/core';
import { USERS_CONFIG_TOKEN, type UsersConfig } from './users.types';
import { UserService } from './user.service';

@Module({
  providers: [UserService],
})
export class UsersModule extends DynamicModule<UsersConfig> {
  protected readonly configToken = USERS_CONFIG_TOKEN;
}
