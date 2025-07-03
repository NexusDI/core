import { Token } from '../token';

export function Service(token?: Token<unknown>): ClassDecorator {
  return (target: Constructor<unknown>) => {};
}
