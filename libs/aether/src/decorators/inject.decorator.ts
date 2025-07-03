import { Constructor } from '../types';
import { Token } from '../token';

export function Inject<T>(token: Token<T> | Constructor<T>): ParameterDecorator;
export function Inject<T>(token: Token<T> | Constructor<T>): PropertyDecorator;
export function Inject<T>(
  token: Token<T> | Constructor<T>
): ParameterDecorator | PropertyDecorator {
  return (
    target: any,
    propertyKey?: string | symbol,
    parameterIndex?: number
  ) => {};
}
