import { readFileSync } from 'node:fs';
import { basename, dirname, join } from 'node:path';

import { DeclarationError, readReference } from './declarations.mjs';
import { preamblePath, readPreamble, withPreamble } from './preamble.mjs';
import { readRegion } from './regions.mjs';

/**
 * Fills an API reference entry from the package's own declarations, during
 * `next build`.
 *
 * A page writes the heading and whatever editorial prose it owes a reader, and
 * one directive under the heading:
 *
 *     ## `hydratePolicy`
 *
 *     <!-- reference @nexusdi/core#hydratePolicy example=quick-start -->
 *
 *     Prose the author writes, which this never touches.
 *
 * The directive becomes five things: the docblock's first paragraph as the
 * entry's summary, its block tags as a parameter list, the rest of the docblock
 * inside a collapsed `<details>`, a `twoslash` fence querying the compiler for
 * the signature, and a `twoslash` fence holding the named README region. The
 * whole entry is wrapped in an element binding the export's kind hue, so the
 * name is coloured by what the export is while the chip beside it says the same
 * word in text.
 *
 * The example comes from a named region of the package's README, through the
 * same reader the region loader uses, so an example on a reference page is
 * still an example a package's own tests run and a renamed region fails the
 * build.
 *
 * Nextra injects the `Popup` component only for a fence whose meta is exactly
 * `twoslash`, so every fence here is emitted as `ts twoslash` and nothing else.
 * The loader that runs next consumes the example's `file=` and `region=`.
 *
 * The signature fence holds the declaration the package published, printed
 * from its own `.d.ts` and given the imports it names. The `signature` fences
 * this replaces were hand-written and could not simply be re-tagged: a
 * `function` declaration with no implementation is a type error and Twoslash
 * refuses it, while a printed one carries `declare` and compiles.
 * `declarations.mjs` carries why this is printed and never queried.
 *
 * A reference that does not resolve fails the build. The region loader
 * already throws on a missing file or region, so `next build` fails and
 * never deploys a page with an empty code block. The same rule applied to a
 * symbol makes "every heading names a real export" a structural
 * guarantee that no test's opinion has to supply.
 */

const DIRECTIVE =
  /^<!--\s*reference\s+(@?[\w./-]+)#([\w$]+)(?:\s+example=([\w-]+))?\s*-->\s*$/;
const HEADING = /^(#{1,6})\s+/;
const FENCE = /^(\s*)(`{3,})(.*)$/;

/** The words the chip shows, one per member of the export-kind scale. */
const KIND_LABELS = {
  error: 'error',
  class: 'class',
  function: 'function',
  constant: 'constant',
  interface: 'interface',
  typeAlias: 'type',
};

/**
 * A docblock's prose as MDX.
 *
 * A docblock is written for an editor's hover, where `{` and `<` are ordinary
 * characters. MDX reads `{` as the start of an expression and `<` as the start
 * of a tag, so a `{@link Matrix}` in a library's comment fails the whole build
 * with `Unexpected character '@'`. Six of `@nexusdi/core`'s 105 entries carry
 * one.
 *
 * An inline tag becomes what it meant: the label where the author wrote one,
 * and the target as code where they did not. Everything else that MDX would
 * read as syntax is escaped, so a docblock written years before this loader
 * existed renders as the sentence it is.
 *
 * Code spans are left alone. MDX does not read an expression inside one, and
 * escaping there would put a backslash on the page.
 */
export function mdxProse(text) {
  return text
    .split(/(`+[^`]*`+)/)
    .map((part, at) => {
      if (at % 2 === 1) return part;

      return part
        .replace(
          /\{@(?:link|linkcode|linkplain)[ \t]+([^}|\s]+)[ \t]*\|?([^}]*)\}/g,
          (_, target, label) =>
            label.trim() === '' ? `\`${target}\`` : label.trim(),
        )
        .replace(/[{}<]/g, (character) => `\\${character}`);
    })
    .join('');
}

/** `typeAlias` as the stylesheet spells it, matching `slug` in the kit. */
function kindSlug(kind) {
  return kind.replace(/[A-Z]/g, (letter) => `-${letter.toLowerCase()}`);
}

/**
 * The block tags as one prose line.
 *
 * Prose, because this is the half of an entry the search index
 * can reach, which a fence would hide: every `<pre>` on the site carries `data-pagefind-ignore`, so a
 * parameter named only inside the signature is a name no search finds.
 */
function tagLine(tags) {
  const rendered = tags.map((tag) => {
    if (tag.name === 'param') {
      const [name, ...rest] = tag.text.split(/\s+/);
      return `\`${name}\` ${mdxProse(rest.join(' '))}`.trim();
    }
    const label = tag.name === 'return' ? 'returns' : tag.name;
    return `**${label}** ${mdxProse(tag.text)}`.trim();
  });

  return rendered.filter(Boolean).join(' · ');
}

/**
 * The fence holding the declaration the package published.
 *
 * Wrapped in an element of its own, because this is the one fence on the site
 * that should wrap and never scroll. A reader takes in a signature left to
 * right once and does not follow it down the page like a program, and the
 * longest one here is 154 characters.
 *
 * An import line stays on one line. A prettier-wrapped multi-line `import`
 * inside a fence fails with a misleading "Cannot use import statement outside a
 * module" (issue #255), so the names go on one line and the stylesheet wraps
 * them.
 */
function signatureFence(reference, prefix) {
  const { signature, specifier } = reference;
  if (!signature) return [];

  const context = [
    signature.values.length > 0 &&
      `import { ${signature.values.join(', ')} } from '${specifier}';`,
    signature.types.length > 0 &&
      `import type { ${signature.types.join(', ')} } from '${specifier}';`,
    signature.fromRoot.length > 0 &&
      `import type { ${signature.fromRoot.join(', ')} } from '${reference.rootSpecifier}';`,
    ...signature.prelude,
  ].filter(Boolean);

  // The imports and the private types are compilation context and add nothing to the
  // entry's content, so they are cut from what the reader sees. A merging
  // declaration is wrapped in a module block for the reason `declarations.mjs`
  // gives, and the two lines of wrapper are cut as well, so the fence shows the
  // declaration and nothing around it.
  const body = signature.merges
    ? [
        '// ---cut-start---',
        `declare module '${specifier}' {`,
        '// ---cut-end---',
        ...signature.text.split('\n'),
        '// ---cut-start---',
        '}',
        '// ---cut-end---',
      ]
    : signature.text.split('\n');

  return [
    `<div className="${prefix}-api-entry__signature">`,
    '',
    '```ts twoslash',
    ...context,
    ...(context.length > 0 ? ['// ---cut---'] : []),
    ...body,
    '```',
    '',
    '</div>',
  ];
}

/** Where `docs:behaviour-data` writes what each library's tests state. */
const BEHAVIOURS = join('apps', 'docs', 'components', 'api', 'behaviour');

/** The kinds a reader is owed a catalogue for, empty or not. */
const STATED_KINDS = new Set(['function', 'class']);

/**
 * The file holding what the package behind an entry states.
 *
 * Named after the package's own directory, which the entry already carries
 * through its README path. A missing file fails the build, for the reason an
 * unresolved symbol and a missing README region already do: an entry that
 * rendered its catalogue as empty because a target had not run would be making
 * the claim of § 9 without having looked.
 */
export function behaviourPath(root, reference) {
  return join(root, BEHAVIOURS, `${libraryOf(reference)}.json`);
}

/**
 * The package's own directory, which is what both of its data files are named
 * after: the one the loader reads during the build, and the one the catalogue
 * fetches from `/behaviour/` when a reader reaches it.
 */
export function libraryOf(reference) {
  return basename(dirname(join('/', reference.readme)));
}

/** What a package's tests state, read off disk. */
function readBehaviours(root, reference, file) {
  const path = behaviourPath(root, reference);
  try {
    return JSON.parse(readFileSync(path, 'utf8'));
  } catch {
    throw new Error(
      `${file}: cannot read '${path}', which is where the behaviours of ` +
        `'${reference.specifier}' are written. Run ` +
        `\`npx nx run docs:behaviour-data\`.`,
    );
  }
}

/**
 * What one export's entry carries, grouped the way the suite wrote it.
 *
 * The owning segment is dropped along with everything above it, because the
 * reader is on that export's entry and has just read its name in the heading.
 * What sits below it is kept, and its first level is kept as structure and
 * stays out of the sentence: `diffMatrix > a widening > reports an added
 * allow branch as granted` states the condition the sentence holds under, and
 * the suite writes several sentences under each condition. So `a widening`
 * labels its own sentences in the rail, which is the one thing a test reporter
 * gives a reader that this block can take.
 *
 * The sentences the suite states under the export's own name, with nothing
 * between, are a group too, labelled with that name. They used to render flush
 * at the top of the block under no label at all, beside the labelled groups,
 * and read as belonging to nowhere. The `describe` they sit under is the
 * export's own, so that is what the rail calls them.
 *
 * A level below the first is joined with the interpunct the rest of an entry
 * joins with, because a third level of indent in a rail this narrow reads as a
 * directory listing.
 *
 * A chain that ends at the owning `describe` contributes nothing. That is a
 * block of generated cases sitting directly under the export's own name, and
 * the only title it carries is the name the reader is already looking at.
 */
export function statedBy(behaviours, name) {
  const groups = new Map();

  const add = (label, title, id) => {
    const rows = groups.get(label) ?? [];
    if (!rows.some((row) => row.title === title)) rows.push({ title, id });
    groups.set(label, rows);
  };

  for (const { chain, id } of behaviours.states[name] ?? []) {
    const rest = chain.slice(chain.indexOf(name) + 1);
    if (rest.length === 0) continue;
    if (rest.length === 1) add(name, rest[0], id);
    else add(rest[0], rest.slice(1).join(' · '), id);
  }

  const under = [...groups].map(([label, rows]) => ({ label, rows }));
  const stated = under.reduce((sum, each) => sum + each.rows.length, 0);

  return { groups: under, stated };
}

/**
 * What the tests state about this export.
 *
 * Prose, because every `<pre>` on the site carries
 * `data-pagefind-ignore` and a sentence inside one is a sentence no search
 * reaches. These sentences are the most searchable thing on the entry: a
 * reader looking for the export that refuses an unknown key is looking for
 * words a test wrote.
 *
 * Shaped like the suite, which differs from a test report. A reporter makes a
 * nesting legible, says how many cases sit in it and shows a reader the case
 * behind a line they pick, and all of that is here: the
 * conditions the suite wrote label their own sentences in the rail, the count
 * says how dense the export's catalogue is before the reader has read a line of
 * it, and the pane beside the rail carries the case. A reporter is also built
 * on status, and none of that transfers. Every sentence here comes from a
 * suite that passes, so a tick on each line would carry no information, and a
 * green tick reads as "verified", which is the one thing this block may not
 * claim. The honesty argument is made in the prose, and markup that
 * contradicted it would undo it.
 *
 * The pane shows the case verbatim and offers no reading of it. A summary of
 * what a test asserts is this loader's opinion about a suite it did not write,
 * and the docs site design (`specs/2026-09-23-docs-site-design.md`) has the
 * entry report what the suite states and infer nothing. The source is the answer a
 * reader can argue with.
 *
 * The heading says `state` and the line at the foot says what that leaves open.
 * The suite's authors wrote these sentences and this block reports them; a
 * sentence here is a name a test carries, and the assertions under that name
 * are in the pane. `libs/acl/SECURITY.md` is the other kind of claim: a person
 * wrote each of its rows and chose its tier.
 *
 * An export with nothing stated says so, in a block of its own shape. A blank,
 * an empty list or a hidden block would leave the page silent, and an absent
 * catalogue on a page built for a sceptic is the hardest thing on the page for
 * the project to publish honestly. The block says no test states a behaviour
 * under this name, which is narrower than untested, because a name with no `describe` of its own can
 * still be exercised by every case in the file.
 */
function statedBlock(reference, behaviours, library, prefix) {
  const { groups, stated } = statedBy(behaviours, reference.name);
  if (stated === 0 && !STATED_KINDS.has(reference.kind)) return [];

  if (stated === 0) {
    return [
      `<div className="${prefix}-api-entry__states ${prefix}-api-entry__states--silent">`,
      '',
      `<p className="${prefix}-api-entry__states-heading">What the tests state</p>`,
      '',
      `<p className="${prefix}-api-entry__states-silence">No test in this package ` +
        'states a behaviour under this name.</p>',
      '',
      '</div>',
    ];
  }

  return [
    `<div className="${prefix}-api-entry__states">`,
    '',
    `<div className="${prefix}-api-entry__states-head">`,
    '',
    `<p className="${prefix}-api-entry__states-heading">What the tests state</p>`,
    '',
    `<p className="${prefix}-api-entry__states-count"><Figure>${stated}</Figure> ` +
      `${stated === 1 ? 'behaviour' : 'behaviours'}</p>`,
    '',
    '</div>',
    '',
    // The rail and the pane, as one client component. Its rows arrive as
    // props, and the component reads no children off the page, because a
    // static export prerenders a client component's markup and Pagefind indexes
    // what that prerender wrote, so the sentences reach the index either way
    // and props are the shape the keyboard needs.
    `<BehaviourCatalogue library="${library}" name="${reference.name}" ` +
      `groups={${JSON.stringify(groups)}} />`,
    '',
    // One line, because MDX reads an indented block inside a tag as markdown
    // and wraps it in a paragraph of its own, which puts a `<p>` inside a `<p>`.
    `<p className="${prefix}-api-entry__states-note">Each line is the name of a ` +
      'test in the package. A test states a behaviour; whether it proves one ' +
      'is a question its own source answers, and the pane carries that ' +
      'source.</p>',
    '',
    '</div>',
  ];
}

/** Everything an entry emits between its heading and its editorial prose. */
function head(reference, prefix) {
  const lines = [];

  if (reference.summary) lines.push(mdxProse(reference.summary), '');

  const tags = tagLine(reference.tags);
  if (tags) lines.push(tags, '');

  if (reference.rest) {
    lines.push(
      `<details className="${prefix}-api-entry__more">`,
      '<summary>Full documentation</summary>',
      '',
      mdxProse(reference.rest),
      '',
      '</details>',
      '',
    );
  }

  return lines;
}

/**
 * The example fence, filled from the named region of the package's README.
 *
 * Resolved here. A `file=`/`region=` reference left for the region loader to
 * fill on a later pass would arrive too late. Turbopack runs the `*.mdx`
 * loaders in the reverse of the order they are listed, so a fence this emits
 * for another loader arrives after that loader has already run and reaches the
 * page empty.
 * The region reader is a module either loader can call, so a call to it is the
 * fix that does not depend on which way round the chain runs.
 *
 * The README's preamble goes in front of the region behind a `// ---cut---`
 * the reader never sees, which is what `expandRegions` does for a Twoslash
 * fence and for the same reason: the fence has to compile and the README does
 * not show the imports that make it compile.
 */
function exampleFence(root, reference, region, file) {
  const path = join(root, reference.readme);
  let contents;
  try {
    contents = readFileSync(path, 'utf8');
  } catch {
    throw new Error(
      `${file}: cannot read '${reference.readme}', which is where ` +
        `'${reference.name}' names the region '${region}'`,
    );
  }

  const found = readRegion(contents, reference.readme, region);
  const code = withPreamble(readPreamble(dirname(path)), found.code);

  return ['```ts twoslash', ...code.split('\n'), '```'];
}

/**
 * What closes an entry: the signature, what the tests state, then a call.
 *
 * In that order because it is the order a reader needs it in. The signature
 * says what the export is, the sentences say what it does, and the example
 * shows a call.
 */
function foot(root, reference, behaviours, example, file, prefix) {
  const lines = ['', ...signatureFence(reference, prefix)];

  const stated = statedBlock(
    reference,
    behaviours,
    libraryOf(reference),
    prefix,
  );
  if (stated.length > 0) lines.push('', ...stated);

  if (example) {
    lines.push('', ...exampleFence(root, reference, example, file));
  }

  return lines;
}

/**
 * The class prefix every emitted element carries (docs spec §14.1, change 3).
 * It has no default, so a caller that forgets it fails at load time.
 */
function assertClassPrefix(prefix) {
  if (typeof prefix !== 'string' || !/^[a-z][a-z0-9-]*$/.test(prefix)) {
    throw new TypeError(
      `expandReferences needs a classPrefix option such as 'nexus' (lower-case letters, digits and hyphens); received ${JSON.stringify(prefix)}.`,
    );
  }
}

/**
 * Expands every reference directive in an MDX source.
 *
 * Textual for the reason `expandRegions` is textual: a directive is a line and
 * its replacement is lines, so a full parse of the document would return
 * nothing the line scan does not already return.
 *
 * `read` is the declaration reader, taken as an argument so a test can drive
 * the expansion without a built package behind it.
 */
export function expandReferences(source, root, file, options) {
  const {
    classPrefix: prefix,
    read = readReference,
    onResolve,
  } = options ?? {};
  assertClassPrefix(prefix);

  const out = [];
  let fence = null;
  // The entry whose fences have not been emitted yet.
  let open = null;
  // One read per package for all its entries: `/acl/api/` holds 107
  // entries and every one of them asks the same file the same question.
  const behaviours = new Map();

  const statedFor = (reference) => {
    const path = behaviourPath(root, reference);
    const held = behaviours.get(path) ?? readBehaviours(root, reference, file);
    behaviours.set(path, held);
    return held;
  };

  const close = () => {
    if (!open) return;
    // Trailing blank lines belong after the entry and stay out of it.
    while (out.length > 0 && out[out.length - 1].trim() === '') out.pop();
    out.push(
      ...foot(
        root,
        open.reference,
        open.behaviours,
        open.example,
        file,
        prefix,
      ),
      '',
      '</div>',
      '',
    );
    open = null;
  };

  for (const line of source.split('\n')) {
    const marker = line.match(FENCE);

    if (marker && fence === null) {
      fence = marker[2];
      out.push(line);
      continue;
    }

    if (marker && fence !== null && marker[2].startsWith(fence)) {
      fence = null;
      out.push(line);
      continue;
    }

    if (fence !== null) {
      out.push(line);
      continue;
    }

    if (HEADING.test(line)) {
      close();
      out.push(line);
      continue;
    }

    const directive = line.match(DIRECTIVE);
    if (!directive) {
      out.push(line);
      continue;
    }

    const [, specifier, name, example] = directive;

    // The heading is the entry's identity and the guards read it off the page
    // as written, so the directive names nothing and stands under one.
    let at = out.length - 1;
    while (at >= 0 && out[at].trim() === '') at -= 1;
    if (at < 0 || !HEADING.test(out[at])) {
      throw new Error(
        `${file}: the reference to '${specifier}#${name}' has no heading ` +
          `above it. An entry is a heading and a directive, in that order.`,
      );
    }

    let reference;
    try {
      reference = read(root, specifier, name);
    } catch (error) {
      if (!(error instanceof DeclarationError)) throw error;
      throw new Error(`${file}: ${error.message}`);
    }

    const stated = statedFor(reference);
    onResolve?.(reference, stated);

    const heading = out.splice(at).filter((each) => each.trim() !== '');
    // The name and the chip share a row, so they share a parent. The heading
    // stays a markdown heading inside it, which is what keeps its anchor, its
    // place in the table of contents and its entry in the search index.
    out.push(
      `<div className="${prefix}-api-entry ${prefix}-kind-${kindSlug(reference.kind)}">`,
      '',
      `<div className="${prefix}-api-entry__name">`,
      '',
      ...heading,
      '',
      `<Chip>${KIND_LABELS[reference.kind]}</Chip>`,
      '',
      '</div>',
      '',
      ...head(reference, prefix),
    );

    open = { reference, behaviours: stated, example: example ?? null };
  }

  close();

  return out.join('\n');
}

/**
 * The loader entry point, configured in `apps/docs/next.config.ts` under
 * `turbopack.rules` ahead of the region loader. `root` is the workspace root
 * every specifier resolves from.
 */
export default function mdxReferenceLoader(source) {
  const { root, classPrefix } = this.getOptions();

  // Declares what each entry was read from as an input of this page, so
  // rebuilding a library rebuilds the pages quoting its signatures and editing
  // a README rebuilds the pages quoting its regions. Without this the page's
  // own mtime is the only thing the build watches, and an entry keeps showing
  // a signature the package no longer has.
  return expandReferences(source, root, this.resourcePath, {
    classPrefix,
    read: readReference,
    onResolve: (reference, behaviours) => {
      const readme = join(root, reference.readme);
      this.addDependency(reference.declaration);
      this.addDependency(readme);
      this.addDependency(preamblePath(dirname(readme)));
      this.addDependency(behaviourPath(root, reference));
      // The test sources behind the sentences, so editing a test rebuilds the
      // page that quotes it. No page keeps a name the suite no longer carries.
      for (const each of behaviours.files) this.addDependency(join(root, each));
    },
  });
}
