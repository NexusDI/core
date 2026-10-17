#!/usr/bin/env node
// Sends a docs draft to Gemma on Ollama Cloud for a style refactor.
// Usage: node tools/gemma-refactor.mjs <file> [--out <path>] [--note "<extra instruction>"]
// Key: $OLLAMA_API_KEY, else the macOS keychain item named by
// $OLLAMA_KEYCHAIN_SERVICE (default "ollama-cloud").
import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';

const MODEL = process.env.GEMMA_MODEL ?? 'gemma4:31b';
const HOST = process.env.OLLAMA_HOST_URL ?? 'https://ollama.com';

const args = process.argv.slice(2);
const file = args.find(
  (a, i) => !a.startsWith('--') && !args[i - 1]?.startsWith('--'),
);
const flag = (name) => {
  const i = args.indexOf(`--${name}`);
  return i === -1 ? undefined : args[i + 1];
};
if (!file) {
  console.error(
    'usage: gemma-refactor.mjs <file> [--out <path>] [--note "<text>"]',
  );
  process.exit(2);
}

function apiKey() {
  if (process.env.OLLAMA_API_KEY) return process.env.OLLAMA_API_KEY;
  const service = process.env.OLLAMA_KEYCHAIN_SERVICE ?? 'ollama-cloud';
  try {
    return execFileSync(
      'security',
      ['find-generic-password', '-s', service, '-w'],
      {
        encoding: 'utf8',
        stdio: ['ignore', 'pipe', 'ignore'],
      },
    ).trim();
  } catch {
    console.error(`no OLLAMA_API_KEY and no keychain item "${service}"`);
    process.exit(2);
  }
}

const root = execFileSync('git', ['rev-parse', '--show-toplevel'], {
  encoding: 'utf8',
}).trim();
const guidePath = join(root, 'docs/documentation-style-guide.md');
// The guide lives on the docs branches; read the checkout first, then those refs.
function readGuide() {
  if (existsSync(guidePath)) return readFileSync(guidePath, 'utf8');
  for (const ref of [
    'origin/release/0.4',
    'origin/feature/docs-rewrite-0.4-v2',
  ]) {
    try {
      return execFileSync(
        'git',
        ['show', `${ref}:docs/documentation-style-guide.md`],
        {
          encoding: 'utf8',
          stdio: ['ignore', 'pipe', 'ignore'],
        },
      );
    } catch {}
  }
  console.error('no docs/documentation-style-guide.md found');
  process.exit(2);
}
const guide = readGuide();
const draft = readFileSync(file, 'utf8');

const system = `You rewrite technical documentation for NexusDI, a TypeScript dependency injection library.
Follow this style guide:

${guide}

Hard rules:
- Return the complete file and nothing else. No preamble, no closing remarks, no surrounding fence.
- In the frontmatter you may rewrite text fields such as title and description. Keep every other key and value exactly as given.
- Keep every code fence (its info string and body), every import and every link URL exactly as given. You may rewrite link text and headings.
- Keep every fact, API name, error code, version number and behaviour statement. Do not add facts, APIs, options or numbers that the draft does not state.
- Improve structure, flow and explanation only.`;

const user = `${flag('note') ? `Extra instruction: ${flag('note')}\n\n` : ''}File: ${file}\n\n${draft}`;

const res = await fetch(`${HOST}/api/chat`, {
  method: 'POST',
  headers: {
    'content-type': 'application/json',
    authorization: `Bearer ${apiKey()}`,
  },
  body: JSON.stringify({
    model: MODEL,
    stream: false,
    messages: [
      { role: 'system', content: system },
      { role: 'user', content: user },
    ],
  }),
});
if (!res.ok) {
  console.error(`ollama ${res.status}: ${await res.text()}`);
  process.exit(1);
}
let out = (await res.json()).message.content.trim();
out = out.replace(/^```[a-z]*\n([\s\S]*)\n```$/, '$1') + '\n';

// Gemma may touch what it must not: report changed fences and frontmatter.
const fences = (s) => s.match(/^```[\s\S]*?^```/gm) ?? [];
const frontKeys = (s) =>
  Object.fromEntries(
    [
      ...(s.match(/^---\n([\s\S]*?)\n---/)?.[1] ?? '').matchAll(
        /^(\w+):(.*)$/gm,
      ),
    ].map((m) => [m[1], m[2].trim()]),
  );
const before = fences(draft);
const after = new Set(fences(out));
const changed = before.filter((f) => !after.has(f));
const fa = frontKeys(draft);
const fb = frontKeys(out);
for (const key of new Set([...Object.keys(fa), ...Object.keys(fb)]))
  if (fa[key] !== fb[key]) console.error(`note: frontmatter ${key} changed`);
if (changed.length)
  console.error(`warning: ${changed.length} code fence(s) changed or removed`);

const dest = flag('out');
if (dest) writeFileSync(dest, out);
else process.stdout.write(out);
