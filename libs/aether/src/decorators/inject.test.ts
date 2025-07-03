import { Aether } from '../container';
import { Service } from './service.decorator';
import { Inject } from './inject.decorator';
import { Token } from '../token';

@Service()
class LoggerService {
  constructor() {}
}

describe('@Inject()', () => {
  let container: Aether;

  beforeEach(async () => {
    container = new Aether();
    await container.set(LoggerService);
  });

  describe('Parameter Injection', () => {
    it('should inject a service', async () => {
      @Service()
      class TestService {
        constructor(
          @Inject(LoggerService) private readonly logger: LoggerService
        ) {}
      }

      const service = await container.resolve(TestService);

      expect(service.logger).toBeInstanceOf(LoggerService);
    });

    it('should inject a service with a token', async () => {
      const TOKEN = new Token<LoggerService>('LoggerService');

      @Service(TOKEN)
      class LoggerService {
        constructor() {}
      }

      await container.set(LoggerService);

      @Service()
      class TestService {
        constructor(@Inject(TOKEN) private readonly logger: LoggerService) {}
      }

      const service = await container.resolve(TestService);

      expect(service.logger).toBeInstanceOf(LoggerService);
    });
  });

  describe('Property Injection', () => {
    it('should inject a service', async () => {
      @Service()
      class TestService {
        @Inject(LoggerService) private readonly logger: LoggerService;
      }

      const service = await container.resolve(TestService);

      expect(service.logger).toBeInstanceOf(LoggerService);
    });
  });
});
