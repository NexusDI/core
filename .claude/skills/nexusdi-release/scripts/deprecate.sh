#!/usr/bin/env bash
# Usage: deprecate.sh <otp> <pkg> [<pkg> ...]
#
# Deprecates the bootstrap placeholder @nexusdi/<pkg>@0.0.0-bootstrap.0 for
# each package. Owner-only: it needs `npm login` with 2FA. A package npm still
# reports as missing right after its bootstrap is listed at the end, with the
# command to retry it.
set -uo pipefail

otp="${1:?usage: deprecate.sh <otp> <pkg> [<pkg> ...]}"
shift
if [ $# -eq 0 ]; then
  echo "usage: deprecate.sh <otp> <pkg> [<pkg> ...]" >&2
  exit 1
fi

failed=()
for p in "$@"; do
  if npm deprecate "@nexusdi/$p@0.0.0-bootstrap.0" \
    "Bootstrap placeholder. Install a released version." --otp="$otp"; then
    echo "deprecated @nexusdi/$p@0.0.0-bootstrap.0"
  else
    failed+=("$p")
  fi
done

if [ ${#failed[@]} -gt 0 ]; then
  echo "FAILED: ${failed[*]}" >&2
  echo "retry with a new code: deprecate.sh <otp> ${failed[*]}" >&2
  exit 1
fi
