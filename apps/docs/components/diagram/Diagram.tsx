'use client';

import { useEffect, useId, useRef, useState } from 'react';

import { accentClass, recolour, themeVariables } from './palette';

interface DiagramProps {
  /** The Mermaid source, with one `:::accent` node. */
  chart: string;
  /** What the diagram shows. The prose around it carries every fact it draws. */
  caption: string;
}

/**
 * A Mermaid diagram drawn in the browser, coloured by the Meridian tokens.
 *
 * `tools/mdx-diagram-loader.mjs` writes this element in place of a `mermaid`
 * fence. Mermaid is large, so it loads with a dynamic import, and only once
 * the figure is about to scroll into view.
 */
export default function Diagram({ chart, caption }: Readonly<DiagramProps>) {
  const id = `nexus-diagram-${useId().replaceAll(/[^\w-]/g, '')}`;
  const captionId = `${id}-caption`;
  const figure = useRef<HTMLElement>(null);
  const [svg, setSvg] = useState<string | null>(null);

  useEffect(() => {
    const node = figure.current;
    if (!node) return undefined;
    let cancelled = false;

    const draw = async () => {
      try {
        await render();
      } catch {
        // The figure keeps its caption. Mermaid leaves an error element in
        // the document when a render fails.
        document.getElementById(`d${id}`)?.remove();
      }
    };

    const render = async () => {
      const { default: mermaid } = await import('mermaid');
      mermaid.initialize({
        startOnLoad: false,
        securityLevel: 'strict',
        theme: 'base',
        themeVariables,
      });
      const drawn = await mermaid.render(id, `${chart}\n${accentClass}`);
      if (!cancelled) setSvg(recolour(drawn.svg));
    };

    if (typeof IntersectionObserver === 'undefined') {
      void draw();
      return () => {
        cancelled = true;
      };
    }

    const observer = new IntersectionObserver((entries) => {
      if (!entries.some((entry) => entry.isIntersecting)) return;
      observer.disconnect();
      void draw();
    });
    observer.observe(node);
    return () => {
      cancelled = true;
      observer.disconnect();
    };
  }, [chart, id]);

  return (
    <figure
      ref={figure}
      className="nexus-diagram"
      style={{ margin: 'var(--meridian-space-5) 0' }}
    >
      <div
        role="img"
        aria-labelledby={captionId}
        style={{
          minBlockSize: 'var(--meridian-space-8)',
          overflowX: 'auto',
          padding: 'var(--meridian-space-4)',
          background: 'var(--meridian-hull)',
          border: '1px solid var(--meridian-rule)',
          borderRadius: 'var(--meridian-radius-panel)',
        }}
        // Mermaid returns sanitised SVG under securityLevel 'strict'.
        dangerouslySetInnerHTML={svg ? { __html: svg } : undefined}
      />
      <figcaption
        id={captionId}
        style={{
          marginBlockStart: 'var(--meridian-space-3)',
          color: 'var(--meridian-text-secondary)',
          fontSize: 'var(--meridian-text-small)',
        }}
      >
        {caption}
      </figcaption>
    </figure>
  );
}
