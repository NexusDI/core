/**
 * The type scale from spec §8.3: a major third (1.25) on a 16px root.
 * The families are names; `apps/docs` self-hosts the fonts through `next/font`
 * and fills `--font-display`, `--font-body` and `--font-mono`.
 */
export const family = {
  display:
    "var(--font-display), 'Space Grotesk', ui-sans-serif, system-ui, sans-serif",
  body: "var(--font-body), 'IBM Plex Sans', ui-sans-serif, system-ui, sans-serif",
  mono: "var(--font-mono), 'IBM Plex Mono', ui-monospace, monospace",
} as const;

export const type = {
  display: { size: '3.052rem', leading: '1.05', family: 'display' },
  h1: { size: '2.441rem', leading: '1.1', family: 'display' },
  h2: { size: '1.953rem', leading: '1.2', family: 'display' },
  h3: { size: '1.563rem', leading: '1.25', family: 'display' },
  lead: { size: '1.25rem', leading: '1.5', family: 'body' },
  body: { size: '1rem', leading: '1.65', family: 'body' },
  small: { size: '0.875rem', leading: '1.5', family: 'body' },
  micro: { size: '0.8rem', leading: '1.4', family: 'mono' },
  code: { size: '0.875rem', leading: '1.6', family: 'mono' },
} as const;

export const tracking = { display: '-0.02em', micro: '0.08em' } as const;
