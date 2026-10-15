import { Writable } from 'node:stream';

import type { ReactNode } from 'react';
import { renderToPipeableStream } from 'react-dom/server';

/** The full server HTML of `node`, rendered with renderToPipeableStream. */
export function html(node: ReactNode): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    const sink = new Writable({
      write(chunk: Buffer, _encoding, done) {
        chunks.push(chunk);
        done();
      },
      final(done) {
        resolve(Buffer.concat(chunks).toString('utf8'));
        done();
      },
    });
    const { pipe } = renderToPipeableStream(node, {
      onAllReady: () => pipe(sink),
      onShellError: reject,
      onError: reject,
    });
  });
}
