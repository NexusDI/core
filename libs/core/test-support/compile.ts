import type { Blueprint, TokenKey } from '../src/blueprint/blueprint.js';
import { compile, type CompileInput } from '../src/blueprint/compile.js';
import { BlueprintError, type NexusError } from '../src/errors/index.js';

/** The errors of a compile that must fail. */
export function compileErrors(
  root: unknown,
  rest: Omit<CompileInput, 'root'> = {},
): NexusError[] {
  try {
    compile({ root, ...rest });
  } catch (error) {
    if (error instanceof BlueprintError) return [...error.errors];
    throw error;
  }
  throw new Error('expected compile() to fail, and it succeeded');
}

function moduleId(bp: Blueprint, name: string): string {
  const node = [...bp.modules.values()].find((m) => m.name === name);
  if (node === undefined) throw new Error(`no module named ${name}`);
  return node.id;
}

/** The provider ids a module sees for a token. */
export function visible(
  bp: Blueprint,
  moduleName: string,
  token: TokenKey,
): readonly string[] {
  return bp.visibility.get(moduleId(bp, moduleName))?.get(token) ?? [];
}

/** The id of the provider of a token, optionally in a named module. */
export function idOf(
  bp: Blueprint,
  token: TokenKey,
  moduleName?: string,
): string {
  const owner = moduleName === undefined ? undefined : moduleId(bp, moduleName);
  const record = [...bp.providers.values()].find(
    (r) => r.token === token && (owner === undefined || r.module === owner),
  );
  if (record === undefined) throw new Error('no such provider');
  return record.id;
}
