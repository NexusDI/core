---
title: NexusDI 0.4 release candidate
authors: [evanion]
tags: [release, release-candidate, migration]
description: NexusDI 0.4 is in release candidate on the next dist-tag, with a codemod and an upgrade guide.
draft: true
---

NexusDI 0.4.0-rc.0 is on npm under the `next` dist-tag. The documentation for 0.4 is at [nexus.js.org/next/](https://nexus.js.org/next/).

<!--truncate-->

## What changed and why

NexusDI 0.4 compiles the whole module graph when the container starts. `Nexus.create` reports every wiring mistake at once, with the fix, before any constructor runs. After startup every `get()` is synchronous.

The 0.3 API is gone. `set()`, `DynamicModule`, symbol tokens and parameter decorators have no 0.4 form. The [upgrade guide](https://nexus.js.org/next/upgrade/) maps each 0.3 API to its replacement.

## The codemod

`npx @nexusdi/codemod@next 0.4` rewrites a 0.3 project. It prints a report of every change it could not make, with a code for each.

## Install the release candidate

```sh
npm install @nexusdi/core@next
```

`npm install @nexusdi/core` keeps installing 0.3.x until 0.4.0 final.

## Feedback

Post feedback in the "0.4 RC feedback" discussion on GitHub, or open an issue with the RC feedback template. A maintainer labels each issue that must be fixed before final.

## The road to 0.4.0 final

0.4.0 final is released once four weeks pass after the last RC with a breaking change, no blocking issue is open, and the codemod has run against at least one external codebase.

## Support for 0.3

`latest` stays on 0.3.x until 0.4.0 final. The 0.3.x line then receives security, crash and data-loss fixes until six months after 0.4.0 final or the release of 0.5.0, whichever is later.
