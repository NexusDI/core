import type { ReactNode } from 'react';

import { ConsoleFrame } from './console-frame.js';
import { Status, type StatusState } from './status.js';

export interface TerminalLine {
  /** The tick or time, in the gutter. */
  tick: string;
  /** The module or system that wrote the line. */
  source: string;
  message: ReactNode;
  /** The status word, right-aligned; the `states` table maps it. */
  status?: string;
  /** A refused command prints its message and then a `Fix:` line. */
  fix?: ReactNode;
}

export interface TerminalProps {
  title: string;
  lines: readonly TerminalLine[];
  /** The app's table from each status word to a state. */
  states: Readonly<Record<string, StatusState>>;
  /** Header content at the end of the band, such as an online status. */
  actions?: ReactNode;
  /** The tab strip after the title, such as a Run and a Source tab. */
  tabs?: ReactNode;
  /**
   * Replaces the log with other content, such as a tab's source listing. The
   * header and the prompt stay.
   */
  body?: ReactNode;
  /** The prompt line under the log. */
  prompt?: ReactNode;
}

/**
 * A screen for logs, console output and command answers (design system spec
 * section 7.2). It composes `ConsoleFrame` and adds the line columns and the
 * prompt. The body is a log region; the stylesheet opens it at the end and
 * keeps it there until the reader scrolls up. No CRT effect.
 */
export function Terminal({
  title,
  lines,
  states,
  actions,
  tabs,
  body,
  prompt,
}: TerminalProps) {
  return (
    <ConsoleFrame
      title={title}
      tabs={tabs}
      actions={actions}
      className="meridian-terminal"
    >
      {body ? (
        <div
          className="meridian-terminal__body"
          role="region"
          aria-label={`${title} content`}
          tabIndex={0}
        >
          {body}
        </div>
      ) : (
        <div
          className="meridian-terminal__log"
          role="log"
          aria-label={title}
          tabIndex={0}
        >
          <div className="meridian-terminal__lines">
            {lines.map((line, at) => (
              <div className="meridian-terminal__line" key={at}>
                <span className="meridian-terminal__tick">{line.tick}</span>
                <span className="meridian-terminal__source">{line.source}</span>
                <span className="meridian-terminal__message">
                  {line.message}
                  {line.fix ? (
                    <span className="meridian-terminal__fix">
                      Fix: {line.fix}
                    </span>
                  ) : null}
                </span>
                <span className="meridian-terminal__status">
                  {line.status ? (
                    <Status word={line.status} states={states} />
                  ) : null}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
      {prompt ? (
        <div className="meridian-terminal__prompt">
          <span aria-hidden="true">&gt;</span> {prompt}
        </div>
      ) : null}
    </ConsoleFrame>
  );
}
