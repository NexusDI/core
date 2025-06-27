// Helpers for Symbol.metadata access
import { SYMBOL_METADATA } from './constants';

export function setMetadata(target: any, key: string, value: any) {
  // Ensure the metadata object is own, not inherited
  if (!Object.prototype.hasOwnProperty.call(target, (Symbol as any).metadata)) {
    Object.defineProperty(target, (Symbol as any).metadata, {
      value: {},
      enumerable: false,
      configurable: true,
      writable: true,
    });
  }
  (target as any)[(Symbol as any).metadata][key] = value;
}

export function getMetadata(target: any, key: string) {
  return (target as any)[(Symbol as any).metadata]?.[key];
}
