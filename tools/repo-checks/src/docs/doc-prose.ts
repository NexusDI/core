import { isPreFinalPost, proseLines, type DocsPage } from './site';

interface Refusal {
  pattern: RegExp;
  instead: string;
}

/** The libraries list, the two dashes this site keeps out of prose and the owner's word rules. */
const REFUSED: readonly Refusal[] = [
  {
    pattern: /\bsimply\b/i,
    instead: 'cut it; the sentence states the step without it',
  },
  { pattern: /\beasily\b/i, instead: 'cut it, or say what makes it cheap' },
  { pattern: /\bquickly\b/i, instead: 'cut it, or name the number' },
  {
    pattern: /\bplease\b/i,
    instead: 'cut it; an instruction needs no courtesy word',
  },
  { pattern: /\band\/or\b/i, instead: 'say which, or say both' },
  {
    pattern: /\bnote that\b/i,
    instead: 'cut it and keep the fact that follows',
  },
  {
    pattern: /—/,
    instead: 'write two sentences, or put a short aside in parentheses',
  },
  {
    pattern: /–/,
    instead: 'write "to" in a range, or a hyphen in a compound',
  },
  {
    pattern: /\bnative(?:ly)?\b/i,
    instead: 'name the property: standard (TC39) or built into the runtime',
  },
  {
    pattern: /reflect-metadata/i,
    instead: 'name no metadata library; say what NexusDI reads',
  },
  {
    pattern: /\binstead of\b/i,
    instead: 'state what the reader does, and drop the alternative',
  },
  {
    pattern: /\brather than\b/i,
    instead: 'state what the reader does, and drop the alternative',
  },
];

/** The libraries list, plus the verbs the owner's rules refuse. */
const FIGURES: readonly Refusal[] = [
  { pattern: /\bbuys\b/i, instead: 'name what it gives the reader' },
  {
    pattern: /\bcosts you\b/i,
    instead: 'name the cost: a call or a rebuild',
  },
  { pattern: /\boutlive[sd]?\b/i, instead: 'say what crosses and how' },
  { pattern: /\bunder the hood\b/i, instead: 'name the function that does it' },
  {
    pattern: /\bout of the box\b/i,
    instead: 'say what the package exports, and what a caller writes',
  },
  { pattern: /\bheavy lifting\b/i, instead: 'name the work and what does it' },
  {
    pattern: /\bsilver bullet\b/i,
    instead: 'say which case it does not cover',
  },
  { pattern: /\bboils down to\b/i, instead: 'state the thing it reduces to' },
  {
    pattern: /\bgives the game away\b/i,
    instead: 'say what is disclosed and to whom',
  },
  { pattern: /\bin your hands\b/i, instead: 'name the value the caller holds' },
  { pattern: /\blands\b/i, instead: 'say what arrives and where' },
  { pattern: /\bbites\b/i, instead: 'name the failure and who meets it' },
  { pattern: /\bearns\b/i, instead: 'name what it gives the reader' },
  { pattern: /\bpays\b/i, instead: 'name the cost or the gain' },
  {
    pattern: /\bcosts\b/i,
    instead: 'name the cost: a call or a rebuild',
  },
  { pattern: /\bsurvives?\b/i, instead: 'say what stays, and through what' },
  {
    pattern: /\b(?:ships|shipped|shipping)\b/i,
    instead: 'say "publishes" or "includes"',
  },
];

/** Unchanged from the libraries guard. */
const ANTITHESIS = /\bnot\b[^.!?;:]{2,60}?\bbut\b/i;

/** Table rows are data, as the libraries guards read them. */
function lines(page: DocsPage): { line: number; text: string }[] {
  return proseLines(page).filter(({ text }) => !text.startsWith('|'));
}

function scan(
  pages: DocsPage[],
  list: readonly Refusal[],
  skipPreFinal: boolean,
): string[] {
  const found: string[] = [];
  for (const page of pages) {
    if (skipPreFinal && isPreFinalPost(page)) continue;
    for (const { line, text } of lines(page)) {
      for (const { pattern, instead } of list) {
        const hit = pattern.exec(text);
        if (hit) found.push(`${page.file}:${line}: "${hit[0]}" -- ${instead}`);
      }
    }
  }
  return found.sort();
}

/** Refused words and both dashes. A post below 0.4.0 keeps its text (spec section 6.3). */
export function checkRefusedWords(pages: DocsPage[]): string[] {
  return scan(pages, REFUSED, true);
}

/** Figures of speech a reader has to translate. */
export function checkFigures(pages: DocsPage[]): string[] {
  return scan(pages, FIGURES, false);
}

/** A sentence that pairs a "not" clause with a "but" clause. */
export function checkAntithesis(pages: DocsPage[]): string[] {
  const found: string[] = [];

  for (const page of pages) {
    const paragraphs: { line: number; text: string }[] = [];
    let open: { line: number; text: string } | null = null;
    let last = -1;

    for (const { line, text } of lines(page)) {
      if (open !== null && line !== last + 1) {
        paragraphs.push(open);
        open = null;
      }
      open =
        open === null
          ? { line, text }
          : { line: open.line, text: `${open.text} ${text}` };
      last = line;
    }
    if (open !== null) paragraphs.push(open);

    for (const { line, text } of paragraphs) {
      for (const sentence of text.split(/(?<=[.!?])\s+/)) {
        if (ANTITHESIS.test(sentence))
          found.push(`${page.file}:${line}: ${sentence.trim()}`);
      }
    }
  }

  return found.sort();
}
