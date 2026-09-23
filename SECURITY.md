# Security Policy

## Reporting a Vulnerability

**Do not open a public issue for a security problem.** A public issue is
visible to everyone, including anyone who would misuse it, before there is a
fix to upgrade to.

Report it privately through GitHub's private vulnerability reporting:

**<https://github.com/NexusDI/core/security/advisories/new>**

That opens a private advisory visible only to you and the maintainer.

Please include:

- Which version is affected.
- What an attacker can do with it — the impact, not just the mechanism.
- The smallest reproduction you can manage.

## What to Expect

- **Acknowledgement within 7 days.** This is a spare-time project, not a
  funded one; that is a realistic commitment rather than an optimistic one.
- An assessment of whether it is exploitable and how severe it is.
- A fix released to npm, and a GitHub Security Advisory published with a CVE
  where the severity warrants one.
- Credit in the advisory, unless you would rather stay anonymous.

Please give the fix a reasonable window before disclosing publicly. If you do
not hear back within 14 days, escalating publicly is fair.

## Supported Versions

Only the **latest published version of `@nexusdi/core`** receives security
fixes. There are no long-term support branches. Fixes land on `main` and go
out in the next release.

## Scope

In scope: anything in the published `@nexusdi/core` package — code injection,
prototype pollution, an unsafe default, a dependency vulnerability that is
actually reachable through this code.

Out of scope: examples/react-ssr and examples/react-ssr-e2e (demo code, never
published), anything in this repository that is not published to npm, and
anything that requires an attacker to already control the machine running the
code.

## How This Repository Is Protected

For anyone auditing the supply chain:

- Releases are published by a manually dispatched workflow, which only users
  with write access can trigger.
- npm publishing uses **trusted publishing (OIDC)**. There is no long-lived
  npm token stored in this repository, and published packages carry
  provenance attestation you can verify with `npm audit signatures`.
- Every GitHub Action is pinned to a full commit SHA.
