import { Service } from './service.decorator';
import { Aether } from '../container';
import { Token } from '../token';

interface ITest {
  foo(): Promise<string>;
}

describe('@Service()', () => {
  let container: Aether;

  beforeEach(() => {
    container = new Aether();
  });

  it('should create a service', async () => {
    @Service()
    class TestService {
      constructor() {}
    }

    await container.set(TestService);

    const service = await container.get(TestService);
  });

  it('should create a service with a token', async () => {
    const TOKEN = new Token<ITest>('TestService');

    @Service(TOKEN)
    class TestService implements ITest {
      constructor() {}

      async foo(): Promise<string> {
        return 'bar';
      }
    }

    await container.set(TestService);

    const service = await container.get(TOKEN);

    expect(await service.foo()).toBe('bar');
  });
});
