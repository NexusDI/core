import { Module } from '../../../../../src';
import { USER_SERVICE_TOKEN, UserService } from './user.service';

@Module({
  providers: [
    { token: USER_SERVICE_TOKEN, useClass: UserService },
  ],
})
export class UsersModule {} 