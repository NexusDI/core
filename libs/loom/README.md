# loom

Is a easy-to-use, strongly typed DI container

key features:

- Minimal Boilerplate
- async first
- Native only (Symbol.metadata, Symbol.dispose).
- Stringly typed
- Small bundle size
- minimal memory usage
- fast startup and resolution.
- Modular (group your logic in to modules for easy packaging and import in other modules).
- update services implementations live during runtime.
- Should handle both single resolve and multi resolve of returns from service methods. Ie, easy to listen to things like webstockets
- decorators
- tokens and interfaces
- Dynamic config of modules
- Reactive
- composable

You can use:

- native TypeScript features, up until and including TS 5.8
- any Stage-3 ECMA proposals
- generators

example APIs (minor changes can be made):

```ts
const LOGGER_SERVICE = new Token('LOGGER');
const PROFILE_URL = new Token('PROFILE_URL');


@Service(LOGGER_SERVICE)
export class LoggerService implements Logger {}

const profileUrl = 'http://...';

@Service()
export class UserService extends Provider implements IUserService {
  constructor(@Inject(LOGGER_SERVICE) private logger: Logger) {}
}

@Module({
  providers: [LoggerService, UserService, {token: PROFILE_URL, {useValue: profileUrl}}]
})
export class UserModule extends BaseModule {}

```

you should separate distinct parts of the logic in to separate files.
