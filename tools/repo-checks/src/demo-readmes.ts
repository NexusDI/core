import {
  BANNED,
  CLAIM,
  DOCTEST,
  bannedProse,
  bannedRaw,
  doctestInterfaceFirstFaults,
  isDoctest,
  parse,
  tsBlockFaults,
  type Rule,
} from './npm-readmes.js';

/**
 * The demo README standard: rules over one demo README's text, plus the
 * wiring of the project that runs it. Demo READMEs are not published, so the
 * npm-only rules (badges, tagline, install line, licence, headings) do not
 * apply. The prose rules, the doctest rules and the interface-first rule are
 * the npm README check's own, reused from npm-readmes.ts.
 */

/** The demo READMEs the check covers. Each demo task appends its own. */
export const DEMO_READMES: readonly string[] = [
  'examples/meridian-systems/README.md',
  'examples/bridge-api/README.md',
  'examples/bridge-console/README.md',
  'examples/federation-shell/README.md',
  'examples/federation-command/README.md',
  'examples/federation-cartography/README.md',
  'examples/federation-engineering/README.md',
  'examples/federation-life-support/README.md',
];

export type DemoRule = Rule | 'claim' | 'wiring' | 'error-codes';

export interface DemoFault {
  readonly rule: DemoRule;
  readonly message: string;
}

export interface DemoReadmeInput {
  readonly source: string;
  /** Text of the project's vitest config. */
  readonly config: string;
  /** The demo's directory name under examples/. Needed with `sources`. */
  readonly project?: string;
  /** Text of the project's .ts files, searched for the codes the README must anchor. */
  readonly sources?: readonly string[];
}

/**
 * A code is linked to the README when its errorBase call passes a constant
 * named DOCS (or ending in DOCS) as the third argument, and the file holds that
 * constant's url `.../examples/<project>#`. The check reads the call's text,
 * `'CODE', 'ClassName', DOCS`, so it needs no list the project exports.
 */
const LINKED_CODE = /'([A-Z][A-Z0-9_]+)'\s*,\s*'[A-Za-z]+'\s*,\s*\w*DOCS\b/g;

function errorCodeFaults(input: DemoReadmeInput): DemoFault[] {
  if (input.project === undefined || input.sources === undefined) return [];
  const url = `/examples/${input.project}#`;
  const codes = new Set<string>();
  for (const text of input.sources) {
    if (!text.includes(url)) continue;
    for (const m of text.matchAll(LINKED_CODE)) codes.add(m[1] as string);
  }
  return [...codes]
    .filter((code) => !input.source.includes(`id="${code}"`))
    .map((code) => ({
      rule: 'error-codes' as const,
      message: `src links ${code} to the README, which has no <a id="${code}"></a> anchor`,
    }));
}

/**
 * The project's vitest config passes the README to `includeSource` and spreads
 * the doc-examples plugins. The check reads the config's text, as
 * docs/doc-regions.ts reads a package's vite.config.ts: loading the config
 * would run the plugins, and the text is what a reader edits.
 */
function wiringFaults(config: string): DemoFault[] {
  const faults: DemoFault[] = [];
  if (!/\bdocExamples\(/.test(config))
    faults.push({
      rule: 'wiring',
      message:
        "the project's vitest config does not use docExamples() from @nexusdi/doc-examples",
    });
  const include =
    /\bincludeSource\s*:\s*(\[[^\]]*\]|docExampleSources\(\))/.exec(
      config,
    )?.[1];
  if (
    include === undefined ||
    !(
      include.includes("'README.md'") || include.startsWith('docExampleSources')
    )
  )
    faults.push({
      rule: 'wiring',
      message:
        "the project's vitest config does not pass README.md to includeSource",
    });
  return faults;
}

export function demoReadmeFaults(input: DemoReadmeInput): DemoFault[] {
  const parsed = parse(input.source);
  const faults: DemoFault[] = [];
  const doctests = parsed.fences.filter((f) => isDoctest(f.info));

  faults.push(...tsBlockFaults('README.md', parsed));
  if (doctests.length === 0)
    faults.push({
      rule: 'doctests',
      message: `has no \`\`\`${DOCTEST} block`,
    });
  else if (!doctests.some((f) => f.body.some((l) => l.includes(CLAIM))))
    faults.push({
      rule: 'claim',
      message: 'no doctest holds a // -> claim',
    });

  faults.push(...doctestInterfaceFirstFaults(doctests));

  faults.push(...wiringFaults(input.config));
  faults.push(...errorCodeFaults(input));
  // The npm check's error-code rule bans NEXUS_ words; a demo README names
  // the codes its refusals carry, so that one rule is left out.
  for (const hit of bannedRaw(
    input.source,
    new Set(),
    BANNED.filter((p) => p.name !== 'error code'),
  ))
    faults.push({ rule: 'banned', message: hit });
  for (const hit of bannedProse(input.source))
    faults.push({ rule: 'banned-prose', message: hit });
  return faults;
}
