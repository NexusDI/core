#!/usr/bin/env node
// Runs the layer-1 assertions of the profiler's golden test inside the
// DevTools frontend of a real Chrome (startup profiler spec 10.2): the main
// frame, one NexusDI group, the golden tracks and each track's entry count.
//   node tools/trace-canary/run.mjs <chrome binary>
import { spawn } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const [chrome] = process.argv.slice(2);
if (chrome === undefined || chrome === '') {
  console.error('usage: node tools/trace-canary/run.mjs <chrome binary>');
  process.exit(2);
}
const golden = JSON.parse(
  readFileSync(
    new URL(
      '../../libs/devtools/test-fixtures/profile/chrome-trace.golden.json',
      import.meta.url,
    ),
    'utf8',
  ),
);
// The golden track list of libs/devtools/src/profile/trace-engine.trace.test.ts.
const TRACKS = [
  'Runs',
  'Steps',
  'create · level 0',
  'create · level 1',
  'create · level 2',
  'create · level 3',
  'create · onInit',
  'load 1 · level 0',
];

/** The entries the file writes per track: each non-marker `b` event. */
function writtenCounts(events) {
  const counts = {};
  for (const e of events) {
    if (e.ph !== 'b') continue;
    const { devtools } = JSON.parse(e.args.detail);
    if (devtools.dataType === 'marker' || devtools.track === undefined)
      continue;
    counts[devtools.track] = (counts[devtools.track] ?? 0) + 1;
  }
  return counts;
}

const port = 9333;
const profileDir = mkdtempSync(join(tmpdir(), 'trace-canary-'));
const browser = spawn(
  chrome,
  [
    '--headless=new',
    `--remote-debugging-port=${port}`,
    `--user-data-dir=${profileDir}`,
    '--no-first-run',
    // Ubuntu 24.04 blocks the unprivileged user namespaces Chrome's sandbox
    // needs. The browser loads only its own DevTools frontend here.
    ...(process.platform === 'linux' ? ['--no-sandbox'] : []),
    'about:blank',
  ],
  { stdio: 'ignore' },
);
let spawnError = null;
browser.once('error', (error) => {
  spawnError = error;
});

async function endpoint(path, method = 'GET') {
  for (let i = 0; i < 100; i++) {
    if (spawnError !== null) throw spawnError;
    try {
      const response = await fetch(`http://127.0.0.1:${port}${path}`, {
        method,
      });
      if (response.ok) return await response.json();
    } catch {
      // Chrome is still starting.
    }
    await new Promise((r) => setTimeout(r, 200));
  }
  throw new Error(`no DevTools endpoint at ${path}`);
}

let failures = [];
let build = 'Chrome';
try {
  build = (await endpoint('/json/version')).Browser;
  const target = await endpoint(
    `/json/new?http://127.0.0.1:${port}/devtools/devtools_app.html`,
    'PUT',
  );
  const socket = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise((resolve, reject) => {
    socket.addEventListener('open', resolve, { once: true });
    socket.addEventListener('error', reject, { once: true });
  });
  let next = 0;
  const send = (method, params) =>
    new Promise((resolve, reject) => {
      const id = ++next;
      const onMessage = (message) => {
        const data = JSON.parse(String(message.data));
        if (data.id !== id) return;
        socket.removeEventListener('message', onMessage);
        if (data.error || data.result?.exceptionDetails)
          reject(
            new Error(
              JSON.stringify(data.error ?? data.result.exceptionDetails),
            ),
          );
        else resolve(data.result);
      };
      socket.addEventListener('message', onMessage);
      socket.send(JSON.stringify({ id, method, params }));
    });

  // The frontend's modules load from the browser; wait until the trace
  // model imports.
  const expression = `(async () => {
    const Trace = await import('/devtools/models/trace/trace.js');
    const model = Trace.TraceModel.Model.createWithAllHandlers();
    await model.parse(${JSON.stringify(golden.traceEvents)});
    const data = model.parsedTrace().data;
    const groups = data.ExtensionTraceData.extensionTrackData;
    return {
      frame: data.Meta.mainFrameId,
      groups: groups.map((g) => g.name),
      tracks: Object.entries(groups[0]?.entriesByTrack ?? {}).map(([name, list]) => [name, list.length]),
    };
  })()`;
  let got;
  for (let i = 0; got === undefined; i++) {
    try {
      got = (
        await send('Runtime.evaluate', {
          awaitPromise: true,
          returnByValue: true,
          expression,
        })
      ).result.value;
    } catch (error) {
      if (i === 30) throw error;
      await new Promise((r) => setTimeout(r, 500));
    }
  }
  socket.close();

  const counts = writtenCounts(golden.traceEvents);
  if (got.frame !== 'F1')
    failures.push(`mainFrameId is ${JSON.stringify(got.frame)}, expected "F1"`);
  if (JSON.stringify(got.groups) !== JSON.stringify(['NexusDI']))
    failures.push(
      `groups are ${JSON.stringify(got.groups)}, expected ["NexusDI"]`,
    );
  const names = got.tracks.map(([name]) => name);
  if (JSON.stringify(names) !== JSON.stringify(TRACKS))
    failures.push(`tracks are ${JSON.stringify(names)}`);
  for (const [name, length] of got.tracks)
    if (counts[name] !== length)
      failures.push(
        `${name} has ${length} entries, the file writes ${counts[name] ?? 0}`,
      );
} catch (error) {
  failures = [
    error === spawnError
      ? `Chrome did not start: ${error.message}`
      : `the frontend did not run the check (the frontend module path may have moved): ${error.message}`,
  ];
} finally {
  // A Chrome that already exited, or never started, sends no exit event.
  if (
    spawnError === null &&
    browser.exitCode === null &&
    browser.signalCode === null
  ) {
    const exited = new Promise((resolve) => browser.once('exit', resolve));
    browser.kill();
    await exited;
  }
  rmSync(profileDir, { recursive: true, force: true });
}
console.log(
  `${build}: ${failures.length === 0 ? 'the NexusDI layout parses' : failures.join('; ')}`,
);
process.exit(failures.length === 0 ? 0 : 1);
