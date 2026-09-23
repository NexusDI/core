import { pathToFileURL } from 'node:url';

/**
 * The post-deploy smoke check of docs spec §17.3, run through the Cloudflare
 * proxy. Any status other than 200 fails, and so does served HTML carrying
 * /cdn-cgi/, which means Cloudflare injected a script into the page.
 */
export function smokeTargets(mode, origin) {
  const targets = ['/', '/blog/rss.xml'];
  if (mode !== 'snapshot-only')
    targets.push('/next/', '/next/getting-started.md');
  if (mode === 'final' || mode === 'retired')
    targets.push('/getting-started.md');
  if (mode === 'final') targets.push('/v0.3/');
  return targets.map((path) => `${origin}${path}`);
}

/**
 * Targets that must answer 404, not 200. In snapshot-only mode the artifact
 * has no `next/` directory (check-artifact.mjs enforces this before deploy),
 * so `/next/` must fall through to the 0.3 site's 404 page. This is the
 * served side of that check; smokeTargets covers only pages that must exist.
 */
export function smokeNotFoundTargets(mode, origin) {
  return mode === 'snapshot-only' ? [`${origin}/next/`] : [];
}

export function checkResponse(url, status, body) {
  const findings = [];
  if (status !== 200) findings.push(`${url} answered ${status}.`);
  if (body.includes('/cdn-cgi/')) {
    findings.push(
      `${url} carries /cdn-cgi/, so Cloudflare rewrote the HTML. Turn off Rocket Loader and every HTML-rewriting feature for the zone.`,
    );
  }
  return findings;
}

export function checkNotFound(url, status) {
  return status === 404 ? [] : [`${url} answered ${status}, not 404.`];
}

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

export async function runSmoke(
  targets,
  fetchImpl,
  { attempts, delayMs },
  checker = checkResponse,
) {
  const findings = [];
  for (const url of targets) {
    let last = [];
    for (let attempt = 1; attempt <= attempts; attempt += 1) {
      const busted = `${url}${url.includes('?') ? '&' : '?'}smoke=${Date.now()}`;
      try {
        const response = await fetchImpl(busted, { redirect: 'manual' });
        last = checker(url, response.status, await response.text());
      } catch (error) {
        last = [`${url} did not answer: ${error.message}.`];
      }
      if (last.length === 0) break;
      if (attempt < attempts) await wait(delayMs);
    }
    findings.push(...last);
  }
  return findings;
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  const [origin = 'https://nexus.js.org', mode] = process.argv.slice(2);
  const targets = smokeTargets(mode, origin);
  const notFoundTargets = smokeNotFoundTargets(mode, origin);
  const attempts = { attempts: 5, delayMs: 30_000 };
  const findings = [
    ...(await runSmoke(targets, fetch, attempts)),
    ...(await runSmoke(notFoundTargets, fetch, attempts, checkNotFound)),
  ];
  for (const url of [...targets, ...notFoundTargets])
    console.log(`checked ${url}`);
  if (findings.length > 0) {
    console.error(findings.map((finding) => `- ${finding}`).join('\n'));
    process.exit(1);
  }
}
