#!/usr/bin/env bash
# Full, correct workspace reinstall (spec 075).
#
# WHY THIS EXISTS
# npm/cli#4828: an INCREMENTAL `npm install` in this workspace silently drops optional platform
# binaries — notably @rollup/rollup-linux-x64-gnu — from BOTH node_modules and package-lock.json.
# Every Vite build then dies with "Cannot find module @rollup/rollup-linux-x64-gnu", including the
# mini-app release path whose output bytes are keccak-committed on-chain.
#
# It happened four separate times during the spec-075 conversion. Re-running `npm install` does
# NOT fix it — the lockfile is already wrong, so npm reports "up to date" and changes nothing.
# The only reliable recovery is a full re-resolve, which is what this does.
#
# Safe to run any time. Solidity-source dependencies are pinned EXACTLY (see
# test/config/CompilerTargets.test.js), so a re-resolve cannot move compiled bytecode.
set -euo pipefail
cd "$(dirname "$0")/../.."

echo "==> removing node_modules trees and the lockfile"
rm -rf node_modules \
       frontend/node_modules \
       services/relay-gateway/node_modules \
       services/finops-exporter/node_modules \
       services/relayer/node_modules \
       subgraph/node_modules \
       tools/miniapp-build/node_modules \
       packages/*/node_modules \
       frontend/miniapps/*/node_modules \
       package-lock.json

echo "==> npm install (full re-resolve)"
npm install --no-audit --no-fund

echo "==> verifying dependency hygiene"
node scripts/deps/check-dependency-hygiene.js

echo
echo "Done. If check:deps still reports a missing platform binary, npm resolved it away again —"
echo "re-run this script; do NOT 'npm install' on top of it."
