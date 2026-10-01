import type { DocsPage } from './site';

const CAPTION = /(?:^|\s)caption="[^"]*\S[^"]*"/;

/** Every mermaid fence carries a caption that says what the diagram shows. */
export function checkCaptions(pages: DocsPage[]): string[] {
  return pages
    .flatMap((page) =>
      page.fences
        .filter(
          (fence) => fence.lang === 'mermaid' && !CAPTION.test(fence.meta),
        )
        .map(
          (fence) =>
            `${page.file}:${fence.line}: a mermaid fence has no caption. Write caption="…" stating what the diagram shows; the prose carries every fact it draws.`,
        ),
    )
    .sort();
}
