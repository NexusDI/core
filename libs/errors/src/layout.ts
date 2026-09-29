import type { ErrorText } from '@nexusdi/core';

/**
 * The message core writes from `text`: `[CODE] `, the message, each hint on
 * its own line indented by two spaces, then the fix line. Revision 1 laid
 * its messages out the same way.
 */
export function layout(code: string, text: ErrorText): string {
  const lines = [`[${code}] ${text.message}`];
  for (const hint of text.hints ?? []) lines.push(`  ${hint}`);
  if (text.fix !== undefined) lines.push(`  Fix: ${text.fix}`);
  return lines.join('\n');
}
