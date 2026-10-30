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
];

export type DemoRule = Rule | 'claim' | 'wiring';

export interface DemoFault {
  readonly rule: DemoRule;
  readonly message: string;
}

export interface DemoReadmeInput {
  readonly source: string;
  /** Text of the project's vitest config. */
  readonly config: string;
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
