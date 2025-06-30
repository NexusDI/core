import type { TokenType, Constructor } from './types.js';

// Metadata storage using WeakMaps (more compatible than Symbol.metadata)
const serviceMetadata = new WeakMap<Constructor, ServiceMetadata>();
const injectMetadata = new WeakMap<Constructor, InjectMetadata>();
const moduleMetadata = new WeakMap<Constructor, any>();

/**
 * Metadata for service registration
 */
interface ServiceMetadata {
  token: TokenType;
}

/**
 * Metadata for dependency injection
 */
interface InjectMetadata {
  tokens: Map<number, TokenType>; // parameter index -> token
}

/**
 * Set service metadata on a class
 */
export function setServiceMetadata(
  target: Constructor,
  token: TokenType
): void {
  serviceMetadata.set(target, { token });
}

/**
 * Get service metadata from a class
 */
export function getServiceMetadata(
  target: Constructor
): ServiceMetadata | undefined {
  return serviceMetadata.get(target);
}

/**
 * Set injection metadata for a parameter
 */
export function setInjectMetadata(
  target: Constructor,
  parameterIndex: number,
  token: TokenType
): void {
  const existing = injectMetadata.get(target);
  const tokens = existing?.tokens || new Map();
  tokens.set(parameterIndex, token);

  injectMetadata.set(target, { tokens });
}

/**
 * Get injection metadata from a class
 */
export function getInjectMetadata(
  target: Constructor
): InjectMetadata | undefined {
  return injectMetadata.get(target);
}

/**
 * Set module metadata on a class
 */
export function setModuleMetadata(target: Constructor, config: any): void {
  moduleMetadata.set(target, config);
}

/**
 * Get module metadata from a class
 */
export function getModuleMetadata(target: Constructor): any {
  return moduleMetadata.get(target);
}

/**
 * Generate a token from a class name
 */
export function generateTokenFromClass(constructor: Constructor): TokenType {
  const name = constructor.name.toLowerCase();
  return { name, toString: () => name, valueOf: () => name } as TokenType;
}

/**
 * Check if a value is a constructor
 */
export function isConstructor(obj: unknown): obj is Constructor {
  return (
    typeof obj === 'function' &&
    obj.prototype &&
    obj.prototype.constructor === obj
  );
}

/**
 * Check if a value is a token
 */
export function isToken(obj: unknown): obj is TokenType {
  return (
    obj != null &&
    typeof obj === 'object' &&
    'name' in obj &&
    typeof (obj as any).name === 'string'
  );
}

/**
 * Check if a value is a provider configuration
 */
export function isProvider(obj: unknown): boolean {
  return (
    obj != null &&
    typeof obj === 'object' &&
    ('useValue' in obj || 'useClass' in obj || 'useFactory' in obj)
  );
}
