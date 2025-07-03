import { Token } from '../token';
import { Inject } from '../decorators/inject.decorator';
import { backendValues, BACKEND_TOKEN } from './backend.value';

export const CONFIG_TOKEN = new Token<typeof configFactory>('CONFIG');

export async function configFactory(
  @Inject(BACKEND_TOKEN) backend: typeof backendValues
) {
  return Promise.resolve(backend);
}
