import { Module, DynamicModule } from '../../../../../src';
import { USER_SERVICE_TOKEN, USERS_CONFIG_TOKEN, type UsersConfig } from './users.types';
import { UserService } from './user.service';

@Module({
  providers: [
    UserService,
  ],
})
export class UsersModule extends DynamicModule<UsersConfig> {
  protected readonly configToken = USERS_CONFIG_TOKEN;
} 