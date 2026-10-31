#!/usr/bin/env node
/**
 * Lands one reviewed pull request into a release branch without an agent in
 * the loop: waits for the required checks, reruns the failed jobs of a run
 * once (CI has known flakes, #285), rebases the head when the base moved, and
 * rebase-merges when every required check passes. Merging into main is
 * refused; that stays with the owner.
 *
 * Run it in the background from the main session and wait for it to exit:
 *
 *   node tools/pr-land.mjs <pr-number>
 *
 * Exit 0: merged. Exit 1: the script stopped without merging, and its last
 * line says why.
 */
import { execFileSync } from 'node:child_process';
import { setTimeout as sleep } from 'node:timers/promises';

const POLL_MS = 60_000;
/** How long a green PR may read BLOCKED or UNKNOWN before the script gives up. */
const SETTLE_MS = 10 * 60_000;
/** The longest the script waits for one PR, rebases and reruns included. */
const DEADLINE_MS = 8 * 60 * 60_000;
const TRANSIENT =
  /HTTP 5\d\d|rate limit|timeout|timed out|ECONNRESET|ENOTFOUND|EAI_AGAIN|connection reset|TLS handshake/i;
const NO_CHECKS = /no (required )?checks reported/;

const pr = process.argv[2];
if (!/^\d+$/.test(pr ?? '')) {
  console.error('usage: node tools/pr-land.mjs <pr-number>');
  process.exit(1);
}

function stop(reason) {
  console.error(`#${pr} not merged: ${reason}`);
  process.exit(1);
}

/** Runs gh and returns stdout. Retries transient API and network errors with backoff. */
async function gh(...args) {
  for (let attempt = 1; ; attempt++) {
    try {
      return execFileSync('gh', args, {
        encoding: 'utf8',
        stdio: ['ignore', 'pipe', 'pipe'],
      });
    } catch (error) {
      const message = String(error.stderr || error.message).trim();
      if (attempt < 6 && TRANSIENT.test(message)) {
        await sleep(attempt * 15_000);
        continue;
      }
      throw new Error(`gh ${args.join(' ')}: ${message}`);
    }
  }
}

async function view() {
  return JSON.parse(
    await gh('pr', 'view', pr, '--json', 'state,mergeStateStatus,baseRefName'),
  );
}

/**
 * The required checks, or every check when the base requires none. An empty
 * list means GitHub has not reported any yet, for example right after a rebase.
 */
async function checks() {
  const fields = ['--json', 'name,bucket,link'];
  for (const scope of [['--required'], []]) {
    try {
      return JSON.parse(
        (await gh('pr', 'checks', pr, ...scope, ...fields)) || '[]',
      );
    } catch (error) {
      if (!NO_CHECKS.test(error.message)) throw error;
    }
  }
  return [];
}

/** GitHub refuses to rerun the failed jobs of a run that is still in progress. */
async function rerunWhenComplete(id) {
  for (;;) {
    const { status } = JSON.parse(
      await gh('run', 'view', id, '--json', 'status'),
    );
    if (status === 'completed') break;
    await sleep(POLL_MS);
  }
  console.log(`rerunning the failed jobs of run ${id}`);
  await gh('run', 'rerun', id, '--failed');
}

async function land() {
  const started = Date.now();
  const rerun = new Set();
  let settling = null;

  for (;;) {
    if (Date.now() - started > DEADLINE_MS) stop('the deadline passed');
    let state = await view();
    if (state.state === 'MERGED') {
      console.log(`#${pr} merged`);
      return;
    }
    if (state.state !== 'OPEN') stop(`it is ${state.state}`);
    if (state.baseRefName === 'main')
      stop('its base is main, which the owner merges');
    if (state.mergeStateStatus === 'BEHIND') {
      console.log(`#${pr} is behind ${state.baseRefName}; rebasing`);
      await gh('pr', 'update-branch', pr, '--rebase');
      await sleep(POLL_MS);
      continue;
    }

    const list = await checks();
    // A settle window starts fresh each time the checks go back to running.
    if (
      list.length === 0 ||
      list.some((c) => c.bucket !== 'pass' && c.bucket !== 'skipping')
    )
      settling = null;
    if (list.length === 0 || list.some((c) => c.bucket === 'pending')) {
      await sleep(POLL_MS);
      continue;
    }

    const cancelled = list.filter((c) => c.bucket === 'cancel');
    if (cancelled.length > 0)
      stop(`cancelled: ${cancelled.map((c) => c.name).join(', ')}`);
    const failed = list.filter((c) => c.bucket === 'fail');
    if (failed.length > 0) {
      const runOf = (c) => c.link?.match(/\/actions\/runs\/(\d+)/)?.[1];
      const repeat = failed.filter((c) => !runOf(c) || rerun.has(runOf(c)));
      if (repeat.length > 0) {
        stop(repeat.map((c) => `failed: ${c.name} ${c.link}`).join('\n'));
      }
      for (const id of new Set(failed.map(runOf))) {
        await rerunWhenComplete(id);
        rerun.add(id);
      }
      await sleep(POLL_MS);
      continue;
    }

    // The merge state lags the checks by a few seconds, so read it again.
    state = await view();
    // The top of the loop rebases a PR whose base moved meanwhile.
    if (state.mergeStateStatus === 'BEHIND') continue;
    if (
      state.mergeStateStatus === 'CLEAN' ||
      state.mergeStateStatus === 'UNSTABLE'
    ) {
      try {
        await gh('pr', 'merge', pr, '--rebase');
      } catch (error) {
        // A retried call after a lost response finds the PR already merged.
        if ((await view()).state !== 'MERGED') throw error;
      }
      await sleep(10_000);
      continue;
    }
    if (
      state.mergeStateStatus === 'BLOCKED' ||
      state.mergeStateStatus === 'UNKNOWN'
    ) {
      settling ??= Date.now();
      if (Date.now() - settling > SETTLE_MS) {
        stop(
          `checks pass but the merge state stayed ${state.mergeStateStatus}`,
        );
      }
      await sleep(POLL_MS);
      continue;
    }
    stop(`checks pass but the merge state is ${state.mergeStateStatus}`);
  }
}

land().catch((error) => stop(error.message));
