import { execFileSync } from 'node:child_process';
import { cpSync, existsSync, mkdirSync, renameSync, rmSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { parseArgs } from 'node:util';

/**
 * Builds one of the two sites the docs deploy serves, in a checked-out tree
 * (docs spec §15.3). `next` is the /next/ site. `root` is the root site of
 * `final` and `retired` mode, with main's blog and benchmark results copied
 * into the release tag's tree. docs.yml and ci.yml's `docs` job both run
 * this, so the deploy and its check build the same way.
 */

const BLOG = 'apps/docs/content/blog';
const RESULTS = 'benchmarks/results';

export const COMMANDS = [
  ['npx', 'nx', 'build', '@nexusdi/docs'],
  ['npm', '--prefix', 'apps/docs', 'run', 'postbuild'],
  ['node', 'apps/docs/tools/check-budgets.mjs'],
];

export function buildPlan(kind, { tree, main }) {
  if (kind === 'next') {
    return {
      env: { DOCS_BASE_PATH: '/next', DOCS_CHANNEL: 'next' },
      copies: [],
      commands: COMMANDS,
    };
  }
  if (kind !== 'root') {
    throw new Error(
      `build-site.mjs builds "next" or "root"; received "${kind}".`,
    );
  }
  if (main === undefined) {
    throw new Error(
      'the root build needs --main, the checkout whose blog it copies.',
    );
  }
  if (!existsSync(join(main, BLOG, 'index.mdx'))) {
    throw new Error(
      'final mode builds the root with the blog from main, and main has no apps/docs/content/blog. Add the blog before setting final (docs spec section 6).',
    );
  }
  const copies =
    resolve(tree) === resolve(main)
      ? []
      : [
          { from: join(main, BLOG), to: join(tree, BLOG) },
          ...(existsSync(join(main, RESULTS))
            ? [{ from: join(main, RESULTS), to: join(tree, RESULTS) }]
            : []),
        ];
  return {
    env: { DOCS_BASE_PATH: '', DOCS_CHANNEL: 'release' },
    copies,
    commands: COMMANDS,
  };
}

function run(kind, { tree, main, out }) {
  const plan = buildPlan(kind, { tree, main });
  for (const { from, to } of plan.copies) {
    rmSync(to, { recursive: true, force: true });
    mkdirSync(dirname(to), { recursive: true });
    cpSync(from, to, { recursive: true });
    console.log(`copied ${from} to ${to}`);
  }
  for (const [command, ...args] of plan.commands) {
    console.log(`$ ${[command, ...args].join(' ')}`);
    execFileSync(command, args, {
      cwd: tree,
      stdio: 'inherit',
      env: { ...process.env, ...plan.env },
    });
  }
  rmSync(out, { recursive: true, force: true });
  mkdirSync(dirname(out), { recursive: true });
  renameSync(join(tree, 'apps/docs/out'), out);
  console.log(`the ${kind} site is in ${out}`);
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  const { positionals, values } = parseArgs({
    allowPositionals: true,
    options: {
      tree: { type: 'string' },
      main: { type: 'string' },
      out: { type: 'string' },
    },
  });
  const [kind] = positionals;
  if (values.tree === undefined || values.out === undefined) {
    throw new Error(
      'usage: build-site.mjs <next|root> --tree <dir> [--main <dir>] --out <dir>',
    );
  }
  run(kind, {
    tree: resolve(values.tree),
    main: values.main === undefined ? undefined : resolve(values.main),
    out: resolve(values.out),
  });
}
