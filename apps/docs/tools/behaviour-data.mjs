import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { basename, dirname, join, relative } from 'node:path';

import { behavioursOf } from '@nexusdi/doc-examples/behaviours';
import { exportedNames } from '@nexusdi/doc-examples/package-exports';
import { createTransformerFactory, rendererRich } from '@shikijs/twoslash';
import { codeToHast } from 'shiki';
import ts from 'typescript';
import { createTwoslasher } from 'twoslash';

import { classesOf, codeClasses, stylesheet, THEMES } from './code-classes.mjs';
import { libraries } from './libraries.mjs';
import { panelHtml } from './popup-fold.mjs';
import { sidecarsOf } from './sidecars.mjs';

/**
 * Writes what each library's tests state, for the reference loader to render.
 *
 * An entry on an API page lists the sentences the package's own suite carries
 * about that export, and opening one shows the case the sentence names. This
 * parses the test sources and writes an index per library and a sidecar per
 * export. The index, `components/api/behaviour/<dir>.json`, holds the
 * sentences; `mdx-reference-loader.mjs` reads it while expanding a directive
 * during `next build` and puts the sentences in the page. The sidecar,
 * `public/behaviour/<dir>/<name>.json`, holds the cases one entry's rail
 * opens, highlighted, and the catalogue fetches it when a reader reaches the
 * entry.
 *
 * The sentences and the cases are apart because of what they weigh. A page
 * carrying every highlighted body would send every case of the package to a
 * reader who opened the page to read one signature. The sentences are what
 * search indexes and what a reader scans, so they stay in the HTML; the cases
 * are code, which Nextra's search leaves out of the index anyway.
 *
 * A sidecar holds one export's cases for the same reason. `@nexusdi/core`'s
 * cases come to several megabytes of JSON with every token's colours in a
 * class, and a reader who opens one case of `Nexus` downloads and parses
 * `Nexus`'s file alone.
 *
 * The cases are highlighted here, at build time. `next.config.ts` sets
 * `output: 'export'`, so no request-time route exists to highlight on, and a
 * browser highlighter would ship a TextMate grammar to a reader who wanted to
 * read four lines of a test.
 *
 * This reads the test sources and runs no suite, so a reference page's
 * rebuild waits on a parse and a compile and never on a test run.
 */

const docsRoot = join(import.meta.dirname, '..');
const workspaceRoot = join(docsRoot, '..', '..');
const index = join(docsRoot, 'components', 'api', 'behaviour');
const sidecars = join(docsRoot, 'public', 'behaviour');

/** The rules for the classes `codeClasses` puts on a case's tokens. */
const classSheet = join(docsRoot, 'public', 'code-classes.css');

/**
 * What the compiler is told about a test file.
 *
 * `tsconfig.base.json`'s settings, down to the ones that decide whether a
 * specifier resolves: `customConditions` is what sends `@nexusdi/core` to the
 * package's own TypeScript source, and `nodenext` on both is the mode the
 * repository's relative specifiers carry an extension for. `types: []` keeps
 * the compiler from sweeping every `@types` package in the workspace for a
 * hover the pane will never show.
 */
const COMPILER = {
  customConditions: ['@nexusdi/source'],
  jsx: ts.JsxEmit.ReactJSX,
  module: ts.ModuleKind.NodeNext,
  moduleResolution: ts.ModuleResolutionKind.NodeNext,
  strict: true,
  target: ts.ScriptTarget.ES2022,
  types: [],
};

/**
 * The compiler a directory's test files are read through.
 *
 * Twoslash puts the code it is given in a virtual file overlaid on the real
 * filesystem, so the directory it is rooted at is what makes `./authoring.js`
 * resolve. One instance per directory holds one language service across every
 * file under it, so the files of one directory share one program load.
 */
const compilers = new Map();

function compilerFor(directory) {
  const held = compilers.get(directory);
  if (held) return held;

  const made = createTwoslasher({
    vfsRoot: directory,
    compilerOptions: COMPILER,
    // A test can hand an export input its types refuse, and Twoslash reads a
    // compiler error nobody marked as a failure of the whole file. The pane
    // shows hovers and never an error box, so the errors are dropped and the
    // file keeps its types.
    handbookOptions: { noErrorValidation: true },
  });

  compilers.set(directory, made);
  return made;
}

/** What a file is written in, which decides both the compile and the grammar. */
const languageOf = (path) => (path.endsWith('x') ? 'tsx' : 'ts');

/**
 * Every type one test file's compile knows, at that file's own offsets.
 *
 * One compile per file and not one per case. Each case is a fragment standing
 * on imports and fixtures at module scope, so the compile unit has to be the
 * whole file either way; cutting the file down to one case with `// ---cut---`
 * would ask the language service for a program per case where one per file
 * answers the same question. `chainsOf` already carries where each body sits
 * in the file, so a hover belongs to the case whose body its offset falls in.
 *
 * The `// @filename:` line names the virtual file after the real one. Without
 * it Twoslash writes `index.ts`, which in `libs/testing/src` is the package's
 * own entry and would hand `index.test.ts` itself back to the import of
 * `./index.js`. The line stays in the code Twoslash returns, so every offset
 * comes back shifted by its length.
 */
function hoversIn(path) {
  const code = readFileSync(path, 'utf8');
  const named = `// @filename: ${basename(path)}\n`;
  const read = compilerFor(dirname(path))(named + code, languageOf(path));

  if (read.code !== named + code)
    throw new Error(`twoslash rewrote ${relative(workspaceRoot, path)}`);

  return read.nodes
    .filter((node) => node.type === 'hover')
    .map((node) => ({ ...node, start: node.start - named.length }))
    .sort((left, right) => left.start - right.start);
}

/**
 * The hovers that fall inside one case, at that case's own offsets.
 *
 * A body is its file's text with the nesting's indentation taken off, so a
 * hover's position in the file is not its position in the body and `offsets`
 * is the map between them. A hover whose first character was cut away, or
 * whose span crosses a cut, is dropped: the pane would otherwise mark a run of
 * characters the reader is not looking at.
 */
function hoversOf(hovers, body, offsets) {
  const where = new Map();
  offsets.forEach((offset, at) => where.set(offset, at));

  // Where each line of the body starts, so a hover reports the line and column
  // the highlighter's own tokens are indexed by.
  const starts = [0];
  for (let at = 0; at < body.length; at += 1)
    if (body[at] === '\n') starts.push(at + 1);

  const within = [];

  for (const node of hovers) {
    const start = where.get(node.start);
    if (start === undefined) continue;
    if (where.get(node.start + node.length - 1) !== start + node.length - 1)
      continue;

    let line = starts.length - 1;
    while (starts[line] > start) line -= 1;

    within.push({ ...node, start, line, character: start - starts[line] });
  }

  return within;
}

/**
 * Each hover's type lifted out of the token that carries it.
 *
 * `rendererRich` writes a whole popup into every token it decorates, and a
 * suite decorates thousands of tokens with far fewer distinct types. So the
 * popup is stored once under a number and the token carries the number, which
 * is what the catalogue looks up when a reader reaches the token.
 */
function fold(node, popups) {
  if (node.type !== 'element') return;

  for (const child of node.children ?? []) fold(child, popups);

  if (!classesOf(node).includes('twoslash-hover')) return;

  const at = (node.children ?? []).findIndex((child) =>
    classesOf(child).includes('twoslash-popup-container'),
  );
  if (at === -1) return;

  const [popup] = node.children.splice(at, 1);
  // Sanitized as a page fence's panel is: the pane injects it as HTML.
  const html = panelHtml(popup.children);
  if (!popups.has(html)) popups.set(html, popups.size);
  node.properties.dataPop = String(popups.get(html));
}

/**
 * One case, as the pane shows it.
 *
 * The frame is Shiki's `<pre>`, its `<code>` and a span per line, and none of
 * the three survives: the pane draws its own frame and nothing here styles a
 * line. Shiki produces them anyway because the transformer that puts a hover
 * on a token reads the line elements to find it, so the frame comes off after
 * the transformer has run.
 */
async function highlight(body, language, hovers, popups) {
  const twoslash =
    hovers === null
      ? []
      : [
          createTransformerFactory(
            () => ({ code: body, nodes: hovers, meta: {} }),
            // The type signature alone, without the docblock above it. A
            // reader on this entry has the export's own prose higher up the
            // page, and repeating it under every token that mentions it would
            // multiply what a reader downloads to read four lines of a test.
            rendererRich({ jsdoc: false }),
          )({ langs: ['ts', 'tsx'] }),
        ];

  const tree = await codeToHast(body, {
    lang: language,
    // `defaultColor: false` writes each token's colour as `--shiki-light` and
    // `--shiki-dark`, `codeClasses` moves the pair into a class that sets the
    // same two variables, and `behaviour.css` picks one by theme.
    themes: THEMES,
    defaultColor: false,
    transformers: [...twoslash, codeClasses()],
  });

  const code = tree.children[0]?.children?.find(
    (child) => child.type === 'element' && child.tagName === 'code',
  );
  if (!code) throw new Error('shiki produced no code element');

  fold(code, popups);

  // Sanitized as a type card is, since the pane injects the body as HTML.
  return panelHtml(
    code.children.flatMap((child) =>
      child.type === 'element' && classesOf(child).includes('line')
        ? child.children
        : [child],
    ),
  );
}

/** How many cases came back without their types, across every library. */
let fallbacks = 0;

/**
 * One library's index, and the highlighted cases and popups its sidecars draw
 * on.
 */
async function filesFor(project) {
  const { files, chains, states } = behavioursOf(
    join(workspaceRoot, project.root),
  );

  // Per library, because a popup is a type out of that library's own sources
  // and a sidecar carrying every library's types would send the reader of
  // `/api-node/` the types `/api/` needs.
  const popups = new Map();

  // A file whose compile threw takes its own cases down to plain highlighting
  // and leaves every other file's alone. A case is never lost: what falls away
  // is the type on a token, and the body the pane shows is the same either way.
  const compiled = new Map();
  for (const path of new Set(chains.map((each) => each.file))) {
    try {
      compiled.set(path, hoversIn(path));
    } catch (thrown) {
      compiled.set(path, null);
      console.warn(
        `  ${relative(workspaceRoot, path)}: ${thrown.message}, ` +
          'so its cases carry no types',
      );
    }
  }

  const bodies = {};
  for (const each of chains) {
    const hovers = compiled.get(each.file);
    let html;

    try {
      if (hovers === null) throw new Error('the file carries no types');
      html = await highlight(
        each.body,
        languageOf(each.file),
        hoversOf(hovers, each.body, each.offsets),
        popups,
      );
    } catch {
      fallbacks += 1;
      html = await highlight(each.body, languageOf(each.file), null, popups);
    }

    bodies[each.id] = {
      where: relative(workspaceRoot, each.file),
      line: each.line,
      html,
    };
  }

  return {
    name: project.dir,
    index: {
      package: project.name,
      // The sources behind the sentences, workspace relative. The loader
      // declares them as inputs of the page, so editing a test rebuilds the
      // page quoting it.
      files: files.map((path) => relative(workspaceRoot, path)),
      states: Object.fromEntries(
        [...states]
          .map(([name, held]) => [
            name,
            [...held.values()].map(({ chain, generated, id }) => ({
              chain,
              generated,
              id,
            })),
          ])
          .sort(([left], [right]) => left.localeCompare(right)),
      ),
    },
    bodies,
    popups: new Map([...popups].map(([html, at]) => [String(at), html])),
  };
}

const projects = libraries(workspaceRoot);
if (projects.length === 0)
  throw new Error('no libs/* package publishes a library entry');

// Written fresh each run, so a library that stops publishing an entry takes
// its files with it and leaves none the loader would still read.
for (const directory of [index, sidecars]) {
  rmSync(directory, { recursive: true, force: true });
  mkdirSync(directory, { recursive: true });
}

let stated = 0;
let weight = 0;
let files = 0;
let heaviest = { path: '', bytes: 0 };
const written = [];

for (const project of projects) {
  written.push({ project, ...(await filesFor(project)) });
}

writeFileSync(
  classSheet,
  `/* Written by \`nx run @nexusdi/docs:behaviour-data\` from tools/code-classes.mjs. */\n${stylesheet}`,
);

for (const { project, name, index: contents, bodies, popups } of written) {
  stated += Object.keys(contents.states).length;
  writeFileSync(
    join(index, `${name}.json`),
    `${JSON.stringify(contents, null, 2)}\n`,
  );

  mkdirSync(join(sidecars, name));
  const exported = exportedNames(
    join(workspaceRoot, project.root, 'package.json'),
  );
  for (const each of sidecarsOf(project, contents, bodies, popups, exported)) {
    const path = join(sidecars, name, `${each.name}.json`);
    const body = `${JSON.stringify(each.sidecar)}\n`;
    const bytes = Buffer.byteLength(body);
    weight += bytes;
    files += 1;
    if (bytes > heaviest.bytes) heaviest = { path, bytes };
    writeFileSync(path, body);
  }
}

console.log(
  `${relative(workspaceRoot, index)}: ${stated} names stated across ` +
    `${projects.length} libraries`,
);
console.log(
  `${relative(workspaceRoot, sidecars)}: ${files} sidecars, ` +
    `${Math.round(weight / 1024)} kB of cases, ${fallbacks} of them without ` +
    `types; the largest is ${relative(sidecars, heaviest.path)} at ` +
    `${Math.round(heaviest.bytes / 1024)} kB`,
);
