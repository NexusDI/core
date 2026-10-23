/**
 * Serves one build folder on one port with node:http, as a static host
 * serves the built apps: `node e2e/serve.ts <folder> <port>`. A path with
 * no file gets index.html, so the shell's routes load on a fresh visit.
 * When REMOTES names a file, /remotes.json answers with it, which picks
 * the remote list a shell instance loads. When BRIDGE_API_URL is set,
 * /bridge.json answers `{ "url": BRIDGE_API_URL }`, which picks the
 * bridge-api the stations talk to.
 */
import { readFile } from 'node:fs/promises';
import { createServer } from 'node:http';
import { extname, join, normalize, resolve } from 'node:path';

const [folder, port] = process.argv.slice(2);
if (folder === undefined || port === undefined)
  throw new Error('usage: node e2e/serve.ts <folder> <port>');

const root = resolve(folder);
const remotes = process.env['REMOTES'];
const bridge = process.env['BRIDGE_API_URL'];

const TYPES: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
};

async function read(file: string): Promise<Buffer | undefined> {
  try {
    return await readFile(file);
  } catch {
    return undefined;
  }
}

/** The file a request names: the REMOTES list, or a file of the folder. */
function fileFor(pathname: string): string | undefined {
  if (pathname === '/remotes.json' && remotes !== undefined)
    return resolve(remotes);
  const file = join(root, normalize(pathname));
  return file.startsWith(root) ? file : undefined;
}

createServer(async (request, response) => {
  const { pathname } = new URL(request.url ?? '/', 'http://127.0.0.1');
  // The shell on another port loads each remote's chunks.
  const cors = { 'access-control-allow-origin': '*' };
  if (pathname === '/bridge.json' && bridge !== undefined) {
    response.writeHead(200, { 'content-type': TYPES['.json'], ...cors });
    response.end(JSON.stringify({ url: bridge }));
    return;
  }
  const file = fileFor(pathname);
  const body = file === undefined ? undefined : await read(file);
  const page = body ?? (await read(join(root, 'index.html')));
  response.writeHead(page === undefined ? 404 : 200, {
    'content-type':
      TYPES[
        body === undefined || file === undefined ? '.html' : extname(file)
      ] ?? 'application/octet-stream',
    ...cors,
  });
  response.end(page);
}).listen(Number(port), '127.0.0.1');
