#!/usr/bin/env bash
# Usage: bootstrap.sh <pkg> <otp>
#
# Publishes the code-free placeholder @nexusdi/<pkg>@0.0.0-bootstrap.0 under
# the dist-tag `bootstrap`, so npm lets the owner configure a trusted publisher
# for the new package. Owner-only: it needs `npm login` with 2FA.
# RELEASING.md, "Bootstrapping a new package", is the source of this recipe.
set -euo pipefail

pkg="${1:?usage: bootstrap.sh <pkg> <otp>}"
otp="${2:?usage: bootstrap.sh <pkg> <otp>}"

# The package must be a published library of this repository.
root="$(git -C "$(dirname "$0")" rev-parse --show-toplevel)"
manifest="$root/libs/$pkg/package.json"
if [ ! -f "$manifest" ]; then
  echo "no libs/$pkg/package.json in $root" >&2
  exit 1
fi
if [ "$(node -p "require('$manifest').name")" != "@nexusdi/$pkg" ]; then
  echo "libs/$pkg/package.json is not named @nexusdi/$pkg" >&2
  exit 1
fi
if npm view "@nexusdi/$pkg" name >/dev/null 2>&1; then
  echo "@nexusdi/$pkg already exists on npm; it needs no bootstrap" >&2
  exit 1
fi

tmp="$(mktemp -d)"
trap 'rm -rf "$tmp"' EXIT
cd "$tmp"
npm init -y --scope=@nexusdi >/dev/null
npm pkg set name="@nexusdi/$pkg" version=0.0.0-bootstrap.0 license=MIT \
  description="Placeholder. Install a released version." \
  repository.type=git repository.url=git+https://github.com/NexusDI/core.git
npm pkg delete main scripts keywords author
# --no-provenance: provenance fails outside CI. --otp: npm's browser auth
# flow redacts its URL when stdout is not a TTY.
npm publish --access public --no-provenance --tag bootstrap --otp="$otp"

echo "published @nexusdi/$pkg@0.0.0-bootstrap.0"
echo "npm view can 404 for a few minutes. Then: npm view @nexusdi/$pkg dist-tags"
echo "Next: add the trusted publisher on npmjs.com, then run deprecate.sh."
