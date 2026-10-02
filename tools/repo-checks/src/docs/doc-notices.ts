import { isPreFinalPost, stripFences, type DocsPage } from './site';

/** The notice set of public guidance decisions 7 and 8, with `Shop note` renamed. */
const NOTICE_LABELS = {
  note: 'Note',
  exception: 'Exception',
  warning: 'Warning',
  ship: 'Ship note',
} as const;

const NOTICE = /<Notice\b([^>]*)>[\s\S]*?<\/Notice>/g;

function kindOf(match: RegExpMatchArray): string {
  return /\bkind="([^"]*)"/.exec(match[1] ?? '')?.[1] ?? '';
}

/**
 * Notice labels come from the set. A page carries at most two notices, with
 * prose between any two. A post from 0.4.0 on follows the budget; an older
 * post keeps its text.
 */
export function checkNotices(pages: DocsPage[]): string[] {
  const findings: string[] = [];

  for (const page of pages) {
    if (isPreFinalPost(page)) continue;
    const body = stripFences(page.body);
    const notices = [...body.matchAll(NOTICE)];

    if (/<Callout\b/.test(body)) {
      findings.push(
        `${page.file}: <Callout> is not a notice on this site. Write <Notice kind="note">, "exception", "warning" or "ship".`,
      );
    }

    for (const notice of notices) {
      const kind = kindOf(notice);
      if (!(kind in NOTICE_LABELS)) {
        findings.push(
          `${page.file}: <Notice kind="${kind}"> names no label. The kinds are note, exception, warning and ship.`,
        );
      }
    }

    if (notices.length > 2) {
      findings.push(
        `${page.file}: carries ${notices.length} notices. A page carries at most two.`,
      );
    }

    for (let at = 1; at < notices.length; at += 1) {
      const previous = notices[at - 1] as RegExpMatchArray;
      const current = notices[at] as RegExpMatchArray;
      const between = body.slice(
        (previous.index ?? 0) + previous[0].length,
        current.index ?? 0,
      );
      if (between.trim() === '') {
        findings.push(
          `${page.file}: the ${kindOf(previous)} and ${kindOf(current)} notices are adjacent. Put prose between them, or drop one.`,
        );
      }
    }
  }

  return findings.sort();
}
