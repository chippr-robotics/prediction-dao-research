#!/usr/bin/env bash
# infra/vm/common/gate.sh — role dispatcher for pre-start safety gates.
# The bundler has a hard gate (exactly one alto against the executor key). The gateway has none:
# multiple gateways would be a policy-multiplication problem, not a fund-loss one, and it is pinned
# to one host anyway.
set -euo pipefail
ROLE="${1:?role required}"
case "$ROLE" in
  bundler) exec /opt/fairwins/bundler/single-alto-gate.sh ;;
  gateway) exit 0 ;;
  *) printf '[gate] unknown role %s\n' "$ROLE" >&2; exit 1 ;;
esac
