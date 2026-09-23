import { describe, expect, it } from 'vitest';

import { errorCases } from '../../test-support/error-cases.js';
import { describeThrown, NexusError, type NexusErrorCode } from './index.js';

const ALL_CODES = [
  'NEXUS_BLUEPRINT_INVALID',
  'NEXUS_MISSING_PROVIDER',
  'NEXUS_AMBIGUOUS_PROVIDER',
  'NEXUS_DUPLICATE_PROVIDER',
  'NEXUS_INVALID_EXPORT',
  'NEXUS_INVALID_PROVIDER',
  'NEXUS_INVALID_TOKEN',
  'NEXUS_INVALID_MODULE',
  'NEXUS_MISSING_DEPS',
  'NEXUS_CIRCULAR_DEPENDENCY',
  'NEXUS_LIFETIME_VIOLATION',
  'NEXUS_MODULE_IMPORT_CYCLE',
  'NEXUS_MODULE_OPTIONS_MISSING',
  'NEXUS_LOAD_GLOBAL_MODULE',
  'NEXUS_INVALID_MODULE_OPTIONS',
  'NEXUS_PROVIDER_FAILED',
  'NEXUS_NOT_READY',
  'NEXUS_ASYNC_TRANSIENT',
  'NEXUS_NOT_VISIBLE',
  'NEXUS_SCOPE_REQUIRED',
  'NEXUS_REQUEST_MISSING',
  'NEXUS_LOADED_AFTER_SCOPE',
  'NEXUS_NO_SCOPE_CONTEXT',
  'NEXUS_DISPOSED',
  'NEXUS_LEGACY_DECORATORS',
  'NEXUS_OVERRIDE_UNUSED',
  'NEXUS_OVERRIDE_EXPORTS',
] as const satisfies readonly NexusErrorCode[];

// A compile error here means a code in the union is missing from ALL_CODES.
type Unlisted = Exclude<NexusErrorCode, (typeof ALL_CODES)[number]>;
const everyCodeListed: [Unlisted] extends [never] ? true : false = true;

describe.each(errorCases)('$name', ({ error, code, fields, name }) => {
  it('carries its code and fields', () => {
    expect(error.code).toBe(code);
    expect(error).toMatchObject(fields);
  });

  it('extends NexusError and Error with its own name', () => {
    expect(error).toBeInstanceOf(NexusError);
    expect(error).toBeInstanceOf(Error);
    expect(error.name).toBe(name.split(' ')[0]);
  });
});

describe('NexusErrorCode', () => {
  it('is covered by one fixture per code', () => {
    expect(everyCodeListed).toBe(true);
    expect(new Set(errorCases.map((c) => c.code))).toEqual(new Set(ALL_CODES));
  });
});

describe('describeThrown', () => {
  it('reads the message of an Error', () => {
    expect(describeThrown(new TypeError('boom'))).toBe('TypeError: boom');
  });

  it('renders primitives and undefined', () => {
    expect(describeThrown('offline')).toBe('offline');
    expect(describeThrown(undefined)).toBe('undefined');
    expect(describeThrown(Symbol('x'))).toBe('Symbol(x)');
  });

  it('formats an object whose conversion to string throws', () => {
    expect(describeThrown(Object.create(null))).toBe('[object Object]');
  });
});
