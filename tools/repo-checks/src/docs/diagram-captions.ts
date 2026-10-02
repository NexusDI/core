import type { DocsPage } from './site';

// The rule of apps/docs/tools/mdx-diagram-loader.mjs, which fails `next build`.
const CAPTION = /(?:^|\s)caption="([^"]*)"/;

/** Every mermaid fence carries a caption that says what the diagram shows, with no quote or backslash in it. */
export function checkCaptions(pages: DocsPage[]): string[] {
  return pages
    .flatMap((page) =>
      page.fences
        .filter((fence) => fence.lang === 'mermaid')
        .flatMap((fence) => {
          const at = `${page.file}:${fence.line}`;
          const found = CAPTION.exec(fence.meta);
          if (found && /["\\]/.test(fence.meta.replace(CAPTION, ''))) {
            return [
              `${at}: the caption of a mermaid fence contains a quote or a backslash. Reword it without one.`,
            ];
          }
          if (!found?.[1]?.trim()) {
            return [
              `${at}: a mermaid fence has no caption. Write caption="…" stating what the diagram shows; the prose carries every fact it draws.`,
            ];
          }
          return [];
        }),
    )
    .sort();
}
