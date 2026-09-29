/** Config file paths, each relative to the consumer directory. */
export interface Configs {
  rootDir: string;
  tsconfig: string;
  swcrc: string;
  babelrc: string;
  viteConfig: string;
  denoConfig?: string;
}

export interface Toolchain {
  id: string;
  /** null for node-strip-types, which runs on the current Node. */
  version: string | null;
  packages: Record<string, string>;
  decorators: boolean;
  /** Profile to the URL of the page that documents the limitation. */
  documented?: Record<string, string>;
  note?: string;
}

export interface Command {
  cmd: string;
  args: string[];
}

export function readToolchains(): Toolchain[];
export function runtimeFor(toolchainId: string): 'node' | 'bun' | 'deno';
export function buildCommand(
  toolchainId: string,
  dir: string,
  entry: string,
  configs: Configs,
): Command | null;
export function outputOf(
  toolchainId: string,
  entry: string,
  configs: Configs,
): string;
export function compile(
  toolchainId: string,
  dir: string,
  entry: string,
  configs: Configs,
): string;
export function runCommand(
  toolchainId: string,
  modulePath: string,
  configs: Configs,
  args?: string[],
): Command;
export function runModule(
  toolchainId: string,
  dir: string,
  modulePath: string,
  configs: Configs,
  args?: string[],
): string;
export function packInto(
  dir: string,
  root: string,
  packages: ReadonlyArray<readonly [folder: string, name: string]>,
): string[];
export function installConsumer(dir: string, specs: readonly string[]): void;
