import { describe, expect, it } from 'vitest';

import { errorCases } from '../../test-support/error-cases.js';
import {
  errorBase,
  isNexusError,
  MissingProviderError,
  NexusError,
} from './index.js';

/** Each class's fields, in the order of the spec's error table. */
const FIELD_ORDER: Readonly<Record<string, readonly string[]>> = {
  BlueprintError: ['errors'],
  MissingProviderError: ['token', 'requester', 'module', 'entry', 'nearMisses'],
  AmbiguousProviderError: ['token', 'module', 'candidates'],
  DuplicateProviderError: ['token', 'module'],
  InvalidExportError: ['token', 'module'],
  InvalidProviderError: ['module', 'index', 'reason', 'detail'],
  InvalidTokenError: [
    'received',
    'entry',
    'module',
    'index',
    'reason',
    'detail',
  ],
  InvalidModuleError: ['received', 'path'],
  MissingDepsError: ['token', 'module', 'arity', 'useClass', 'bare'],
  CircularDependencyError: ['path'],
  LifetimeError: ['path', 'lifetimes'],
  ModuleImportCycleError: ['path'],
  ModuleOptionsError: ['module', 'issues'],
  LoadError: ['module'],
  ProviderError: ['token', 'module', 'path', 'alsoFailed', 'disposalErrors'],
  NotReadyError: ['owner', 'target', 'path'],
  AsyncTransientError: ['token', 'module'],
  NotVisibleError: ['token', 'owners', 'entry'],
  ScopeRequiredError: ['token', 'path', 'entry'],
  RequestMissingError: ['dependents'],
  LoadedAfterScopeError: ['token', 'module', 'entry'],
  NoScopeContextError: [],
  DisposedError: ['target'],
  LegacyDecoratorsError: ['decorator'],
  OverrideError: ['token', 'module', 'missing'],
  PluginError: [
    'plugin',
    'reason',
    'detail',
    'apiVersion',
    'supported',
    'plugins',
    'target',
    'hook',
    'disposalErrors',
  ],
};

describe('NexusError', () => {
  it.each(errorCases)(
    'makes the fields of $name its enumerable keys',
    ({ error, fields }) => {
      for (const key of Object.keys(fields))
        expect(Object.keys(error)).toContain(key);
      expect(Object.keys(error)).toEqual(FIELD_ORDER[error.name]);
      expect(Object.keys(error)).not.toContain('code');
      expect(Object.keys(error)).not.toContain('name');
      expect(Object.keys(error)).not.toContain('cause');
      expect(
        Object.getOwnPropertySymbols(error).map(
          (s) => Object.getOwnPropertyDescriptor(error, s)?.enumerable,
        ),
      ).toEqual([false]);
    },
  );

  it.each(errorCases.filter((c) => 'cause' in c))(
    'makes the cause of $name its Error.cause',
    ({ error, cause }) => {
      expect(error.cause).toEqual(cause);
    },
  );

  it('writes a one-line message from the code and the fields', () => {
    const error = new MissingProviderError({
      token: 'NavCharts',
      requester: 'ShipComputer',
      module: 'Engineering',
      entry: null,
      nearMisses: [],
    });
    expect(error.message).toBe(
      '[NEXUS_MISSING_PROVIDER] token=NavCharts requester=ShipComputer module=Engineering. https://nexus.js.org/errors/NEXUS_MISSING_PROVIDER',
    );
    expect({ ...error, code: error.code }).toEqual({
      token: 'NavCharts',
      requester: 'ShipComputer',
      module: 'Engineering',
      nearMisses: [],
      entry: null,
      code: 'NEXUS_MISSING_PROVIDER',
    });
  });

  it('escapes a line break inside a field, so the message stays on one line', () => {
    const error = new MissingProviderError({
      token: 'Nav\nCharts\r\u2028',
      requester: null,
      module: 'Engineering',
      entry: null,
      nearMisses: [],
    });
    expect(error.message).toBe(
      '[NEXUS_MISSING_PROVIDER] token=Nav\\nCharts\\r\\u2028 module=Engineering. https://nexus.js.org/errors/NEXUS_MISSING_PROVIDER',
    );
    expect(error.message.split(/[\n\r\u2028]/)).toHaveLength(1);
    expect(error.token).toBe('Nav\nCharts\r\u2028');
  });

  it('prints numbers and string arrays, and skips empty arrays and objects', () => {
    class ShapeError extends errorBase<
      'NEXUS_TEST_SHAPE',
      {
        count: number;
        names: readonly string[];
        none: readonly string[];
        extra: object;
      }
    >('NEXUS_TEST_SHAPE', 'ShapeError') {}
    const error = new ShapeError({
      count: 2,
      names: ['A', 'B'],
      none: [],
      extra: {},
    });
    expect(error.message).toBe(
      '[NEXUS_TEST_SHAPE] count=2 names=A,B. https://nexus.js.org/errors/NEXUS_TEST_SHAPE',
    );
  });

  it('writes the docs link alone for an error without printable fields', () => {
    class BareError extends errorBase<'NEXUS_TEST_BARE', object>(
      'NEXUS_TEST_BARE',
      'BareError',
    ) {}
    expect(new BareError({}).message).toBe(
      '[NEXUS_TEST_BARE] https://nexus.js.org/errors/NEXUS_TEST_BARE',
    );
  });

  it('takes the whole body from the text option', () => {
    class OwnTextError extends errorBase<'NEXUS_TEST_TEXT', { plugin: string }>(
      'NEXUS_TEST_TEXT',
      'OwnTextError',
    ) {}
    const error = new OwnTextError(
      { plugin: 'bank' },
      { text: 'bank has its own words.' },
    );
    expect(error.message).toBe('[NEXUS_TEST_TEXT] bank has its own words.');
    expect(error.plugin).toBe('bank');
  });
});

describe('errorBase', () => {
  it('makes a class a package can declare its codes with', () => {
    class ContractError extends errorBase<
      'NEXUS_TEST_CONTRACT',
      { contract: string }
    >('NEXUS_TEST_CONTRACT', 'ContractError') {}
    const error = new ContractError({ contract: 'bank/Auth' });
    expect(error).toBeInstanceOf(NexusError);
    expect(error).toBeInstanceOf(ContractError);
    expect(error.name).toBe('ContractError');
    expect(error.contract).toBe('bank/Auth');
  });

  it('picks the code from the fields for a class with several', () => {
    class PairError extends errorBase<
      'NEXUS_TEST_ONE' | 'NEXUS_TEST_TWO',
      { code: 'NEXUS_TEST_ONE' | 'NEXUS_TEST_TWO'; side: string }
    >((fields) => fields.code, 'PairError') {}
    const error = new PairError({ code: 'NEXUS_TEST_TWO', side: 'port' });
    expect(error.code).toBe('NEXUS_TEST_TWO');
    expect(Object.keys(error)).toEqual(['side']);
    expect(error.message).toBe(
      '[NEXUS_TEST_TWO] side=port. https://nexus.js.org/errors/NEXUS_TEST_TWO',
    );
  });
});

describe('isNexusError', () => {
  it('recognises an error by its brand and narrows by code', () => {
    const error = new MissingProviderError({
      token: 'A',
      requester: null,
      module: 'Root',
      entry: null,
      nearMisses: [],
    });
    const foreign = Object.assign(new Error('x'), { code: 'NEXUS_DISPOSED' });
    Object.defineProperty(foreign, Symbol.for('nexusdi.error'), {
      value: true,
    });
    expect(isNexusError(error, 'NEXUS_MISSING_PROVIDER')).toBe(true);
    expect(isNexusError(error, 'NEXUS_DISPOSED')).toBe(false);
    expect(isNexusError(foreign)).toBe(true);
    expect(isNexusError(new Error('plain'))).toBe(false);
    expect(isNexusError(null)).toBe(false);
    expect(isNexusError('NEXUS_DISPOSED')).toBe(false);
  });
});
