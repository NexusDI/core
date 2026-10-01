import { createReadStream, existsSync, readFileSync, statSync } from 'node:fs';
import { createServer } from 'node:http';
import { extname, join, normalize, sep } from 'node:path';

const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.md': 'text/markdown; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
  '.txt': 'text/plain; charset=utf-8',
  '.xml': 'application/xml; charset=utf-8',
  '.wasm': 'application/wasm',
  '.pf_meta': 'application/octet-stream',
  '.pf_index': 'application/octet-stream',
  '.pf_fragment': 'application/octet-stream',
};

/**
 * A static server with the GitHub Pages behaviour the site depends on:
 * `/x` for a directory answers 301 to `/x/`, `/x/` serves `/x/index.html`, a
 * file serves with its content type, and any missing path answers 404 with
 * the root `404.html`. It has no rewrites. Pages also sends
 * `Access-Control-Allow-Origin: *`, which the sandboxed frame's module fetch
 * needs (spec §11.4), so this server sends it too.
 */
export function createPagesServer(root) {
  const notFound = join(root, '404.html');

  return createServer((request, response) => {
    const url = new URL(request.url ?? '/', 'http://localhost');
    response.setHeader('Access-Control-Allow-Origin', '*');

    let path;
    try {
      path = normalize(decodeURIComponent(url.pathname));
    } catch {
      response.writeHead(400).end();
      return;
    }
    const target = join(root, path);

    if (target !== root && !target.startsWith(root + sep)) {
      response.writeHead(403).end();
      return;
    }

    if (existsSync(target) && statSync(target).isDirectory()) {
      if (!url.pathname.endsWith('/')) {
        response.writeHead(301, { Location: `${url.pathname}/` }).end();
        return;
      }
      const index = join(target, 'index.html');
      if (existsSync(index)) {
        response.writeHead(200, { 'Content-Type': TYPES['.html'] });
        createReadStream(index).pipe(response);
        return;
      }
    } else if (existsSync(target)) {
      const type = TYPES[extname(target)] ?? 'application/octet-stream';
      response.writeHead(200, { 'Content-Type': type });
      createReadStream(target).pipe(response);
      return;
    }

    response.writeHead(404, { 'Content-Type': TYPES['.html'] });
    response.end(existsSync(notFound) ? readFileSync(notFound) : 'Not Found');
  });
}
