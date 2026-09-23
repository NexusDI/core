#!/usr/bin/env node
// Measures the minified/gzipped bundle size of @nexusdi/core@0.3.2 for three
// import scenarios, using the tsconfig the 0.3 docs tell consumers to use
// (target ES2022, experimentalDecorators, useDefineForClassFields).
//
// Installs the package from the npm registry (the same tarball a consumer
// would get from `npm install @nexusdi/core`) into a throwaway temp
// directory, so the numbers reflect what ships, not the local workspace
// build. Run with: node scripts/measure-bundle-0.3.mjs
//
// The temp consumer package is marked "type": "module". @nexusdi/core ships
// ESM-only and the docs show ESM `import` syntax, so this is what a real
// consumer looks like. A consumer package.json with "type": "commonjs" (for
// example the one `npm init -y` generates) makes esbuild bundle
// @nexusdi/core through its CommonJS-interop path instead of resolving it
// as native ESM: esbuild adds a lazy __esm() init wrapper around every
// module in the dependency graph, which cost around 590 bytes raw / 260
// bytes gzipped on this same consumer when measured that way. That was the
// cause of an earlier mismatch between two independent measurements of this
// same scenario in this repo (6,840 / 2,517 from a `npm init -y` consumer
// directory, whose package.json had "type": "commonjs", against 6,254 /
// 2,270 for one marked "type": "module").
//
// This is the canonical method behind the bundle-size figures in
// README.md. If the figures there ever drift from this script's output,
// trust this script and update the README.

import { build } from 'esbuild';
import { execFileSync } from 'node:child_process';
import { gzipSync } from 'node:zlib';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const PACKAGE_SPEC = '@nexusdi/core@0.3.2';

const TSCONFIG_RAW = {
  compilerOptions: {
    target: 'ES2022',
    experimentalDecorators: true,
    useDefineForClassFields: true,
  },
};

const SCENARIOS = [
  {
    name: 'Nexus + Service + Inject + Token (two services registered, one resolved)',
    file: 'consumer.ts',
    source: `import { Nexus, Service, Inject, Token } from '@nexusdi/core';

const A_TOKEN = new Token('A');
const B_TOKEN = new Token('B');

@Service(A_TOKEN)
class ServiceA {
  greet() {
    return 'a';
  }
}

@Service(B_TOKEN)
class ServiceB {
  constructor(@Inject(A_TOKEN) a) {
    this.a = a;
  }
  greet() {
    return this.a.greet() + 'b';
  }
}

const nexus = new Nexus();
nexus.set(A_TOKEN, ServiceA);
nexus.set(B_TOKEN, ServiceB);
const b = nexus.get(B_TOKEN);
console.log(b.greet());
`,
  },
  {
    name: 'Nexus + Token only',
    file: 'nexus-token-only.ts',
    source: `import { Nexus, Token } from '@nexusdi/core';

const T = new Token('T');
const nexus = new Nexus();
console.log(nexus, T);
`,
  },
  {
    name: 'Every export',
    file: 'all-exports.ts',
    source: `export * from '@nexusdi/core';
`,
  },
];

function setupPackage() {
  const dir = mkdtempSync(join(tmpdir(), 'nexusdi-bundle-check-'));
  writeFileSync(
    join(dir, 'package.json'),
    JSON.stringify({ name: 'bundle-check', private: true, type: 'module' }),
  );
  execFileSync(
    'npm',
    ['install', PACKAGE_SPEC, '--no-save', '--no-audit', '--no-fund'],
    {
      cwd: dir,
      stdio: 'ignore',
    },
  );
  return dir;
}

async function measure(dir, scenario) {
  const entry = join(dir, scenario.file);
  writeFileSync(entry, scenario.source);

  const result = await build({
    entryPoints: [entry],
    bundle: true,
    minify: true,
    format: 'esm',
    write: false,
    tsconfigRaw: TSCONFIG_RAW,
  });

  const code = result.outputFiles[0].contents;
  const raw = code.byteLength;
  const gzipped = gzipSync(Buffer.from(code), { level: 9 }).byteLength;
  return { raw, gzipped };
}

async function main() {
  const dir = setupPackage();
  try {
    console.log(
      `Method: esbuild --bundle --minify --format=esm against ${PACKAGE_SPEC} from npm`,
    );
    console.log(
      `tsconfig: target ES2022, experimentalDecorators, useDefineForClassFields\n`,
    );

    for (const scenario of SCENARIOS) {
      const { raw, gzipped } = await measure(dir, scenario);
      console.log(`${scenario.name}`);
      console.log(`  raw:    ${raw.toLocaleString()} bytes`);
      console.log(`  gzip -9: ${gzipped.toLocaleString()} bytes\n`);
    }
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

main();
