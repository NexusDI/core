import { isPreFinalPost, type DocsPage } from './site';

const IMPORT =
  /import\s+(?:type\s+)?(?:([A-Za-z_$][\w$]*)\s*,?\s*)?(?:\{([^}]*)\})?(?:\*\s+as\s+[\w$]+)?\s*from\s*['"](@nexusdi\/[^'"]+)['"]/g;
const MERMAID_REFERENCE =
  /(@nexusdi\/[a-z][\w-]*(?:\/[a-z][\w-]*)*)(?:#([\w$]+))?/g;
const CODE_LANGS = ['ts', 'tsx', 'js', 'jsx', 'typescript'];

function boundNames(
  defaultName: string | undefined,
  named: string | undefined,
): string[] {
  const names = defaultName ? ['default'] : [];
  for (const part of (named ?? '').split(',')) {
    const name = part
      .trim()
      .replace(/^type\s+/, '')
      .split(/\s+as\s+/)[0]
      ?.trim();
    if (name) names.push(name);
  }
  return names;
}

/**
 * G5: a fence imports only what `@nexusdi/core` exports, a `signature` fence
 * sits under a heading naming an export, and a diagram names only exports.
 * A post that describes a version below 0.4.0 keeps its 0.3 imports
 * (amendment A2).
 */
export function checkExports(input: {
  pages: DocsPage[];
  exportsOf: Map<string, Set<string>>;
}): string[] {
  const { pages, exportsOf } = input;
  const every = new Set([...exportsOf.values()].flatMap((names) => [...names]));
  const entries = [...exportsOf.keys()].join(', ');
  const findings: string[] = [];

  for (const page of pages) {
    if (isPreFinalPost(page)) continue;

    for (const fence of page.fences) {
      const at = `${page.file}:${fence.line}`;

      if (CODE_LANGS.includes(fence.lang)) {
        for (const [
          ,
          defaultName,
          named,
          specifier = '',
        ] of fence.body.matchAll(IMPORT)) {
          const names = exportsOf.get(specifier);
          if (names === undefined) {
            findings.push(
              `${at}: '${specifier}' is not an entry of the exports map. Import from ${entries}.`,
            );
            continue;
          }
          for (const name of boundNames(defaultName, named)) {
            if (!names.has(name)) {
              findings.push(
                `${at}: '${name}' is not exported by '${specifier}'. Import a name the package exports.`,
              );
            }
          }
        }
      }

      if (fence.tags.includes('signature')) {
        const heading =
          fence.section?.replace(/`/g, '').replace(/\(\)$/, '').trim() ?? '';
        if (!every.has(heading)) {
          findings.push(
            `${at}: the signature fence sits under "## ${fence.section ?? '(no heading)'}", which names no export. A signature belongs under the heading of the export it shows.`,
          );
        }
      }

      if (fence.lang === 'mermaid') {
        const text = `${fence.meta}\n${fence.body}`;
        for (const [whole, specifier = '', name] of text.matchAll(
          MERMAID_REFERENCE,
        )) {
          const names = exportsOf.get(specifier);
          if (names === undefined) {
            findings.push(
              `${at}: the mermaid fence names '${whole}', which is not an entry of the exports map.`,
            );
          } else if (name !== undefined && !names.has(name)) {
            findings.push(
              `${at}: the mermaid fence names '${whole}', and '${name}' is not exported by '${specifier}'.`,
            );
          }
        }
      }
    }
  }

  return findings.sort();
}
