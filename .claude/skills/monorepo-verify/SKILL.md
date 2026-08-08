---
name: monorepo-verify
description: Prove a change is safe to merge in this repo — run the byte-neutrality, dependency, storage-layout and test gates, and interpret what each one actually proves. Use before opening or merging a PR, after any dependency or build-config change, when a gate fails and you need to know whether it is real, or when deciding whether a test failure is pre-existing. Also documents which failures are known-and-expected so they are not chased.
---

# Verifying a change in the FairWins monorepo (spec 075)

This repo compiles bytecode for UUPS proxies holding escrow on 7 chains, and publishes packages
whose bytes are keccak-committed on-chain. "The tests passed" is not sufficient evidence. Run the
gates and know what each one proves.

## The sweep

```bash
npm run compile
node scripts/codegen/bytecode-digest.js --compare specs/075-monorepo-workspaces/baseline-bytecode.json
npm run check:deps
npm run check:storage-layout
npm run tenants:validate
npm test                                    # contracts
npm test --workspace fairwins-relay-gateway
npm run codegen --workspace prediction-dao-research-subgraph && npm run build --workspace prediction-dao-research-subgraph
```

Mini-app bytes (**required** for anything touching dependencies, hoisting, or the build preset):
```bash
(cd frontend/miniapps/token-mint && npx vite build)
(cd frontend/miniapps/clearpath  && npx vite build)
node scripts/miniapps/record-build-digests.js --compare specs/075-monorepo-workspaces/baseline-miniapp-builds.json
```

Frontend — **the full suite OOMs with default settings**. This invocation works on a 4-core/15 GB box:
```bash
cd frontend && TZ=UTC NODE_OPTIONS=--max-old-space-size=8192 \
  npx vitest run --reporter=dot --pool=forks --maxWorkers=2
```
`TZ=UTC` is not optional — several suites hard-code UTC datetime strings and pass or fail on the
runner's locale. Scoped runs (`npx vitest run src/test/<dir>`) are fine while iterating, but a
scoped run **cannot** catch a stale or boundary-crossing import, because the module never loads.

## What each gate actually proves

| Gate | Proves | Does NOT prove |
|---|---|---|
| `bytecode-digest --compare` | every contract's compiled bytes are identical to the recorded baseline | anything about behaviour — only that codegen inputs did not move |
| `record-build-digests --compare` | mini-app output bytes unchanged **before vs after on the same tree** | that HEAD reproduces the *published* CID — no in-repo baseline exists for that |
| `check:deps` | no version skew, no phantom imports, platform binaries present in the lockfile | that the versions are *correct*, only that they agree |
| `check:storage-layout` | 26 live implementations diff clean for append-only compatibility | anything if it compares **0** — it now fails rather than reporting success |
| `TypehashParity` | every EIP-712 struct matches the contract that verifies it | that the *action wiring* is right — see `actionCoverage.test.js` |

## Known failures — do not chase these

- **`npm test` reports 2 failing, both in `test/fork/`**
  (`ChainalysisSanctions.fork.test.js`, `usdc-erc1271-authorization.test.js`).
  **Pre-existing and environmental** — they need live archive RPCs. Verified by running them on an
  unmodified tree. A 3rd failure is yours.
- `npm run build` in `frontend/` refuses on `VITE_PINATA_JWT` in `.env`. Deliberate security guard.
  Use `npx vite build --mode development` to check bundling.

## Interpreting a failure

**Bytecode gate fails** → STOP, do not merge. Something changed what compiles. Usual cause is a
floated Solidity-source dependency (`@chainlink/contracts` did exactly this: 1.3.0 → 1.5.0 changed
`ChainlinkFunctionsOracleAdapter`). Compare installed versions against the lockfile the baseline was
taken with, before assuming it is a compiler-settings problem.

**Mini-app byte gate fails** → the on-chain `MiniAppRegistry` commitment for that package is now
wrong. Blocks the merge until explained; if real, the package must be re-published and re-approved
on-chain. The usual cause is changed dependency **resolution**, not changed source:
`hostScopePlugin` imports each resolved shared dep to enumerate its export names and bakes them
into the emitted shim.

**Mini-app gate says "output bytes unchanged" right after a failed build** → it cannot. It refuses
to compare artifacts older than 10 minutes, because it once reported a pass against a stale `dist/`
after both builds had failed. If you see a staleness refusal, the build did not run — fix that first.

**`Cannot find module @rollup/rollup-linux-x64-gnu`** → npm/cli#4828 dropped it. Run
`npm run deps:reinstall`; `npm install` will not fix it. See the `monorepo-workspace` skill.

## Before merging anything that touches dependencies or the build

1. Record a baseline **first**, on the unmodified tree, or the comparison is meaningless.
2. Change one thing.
3. Re-run the gates.
4. If a gate is new, **mutation-test it** — break the thing it guards and confirm it goes red. Two
   gates in this repo were written, passed, and could never have failed: the e2e gate
   (`continue-on-error` plus a grep for a token the reporter never emits) and a first draft of
   `CompilerTargets.test.js` that read the *resolved* Hardhat config, into which Hardhat had already
   substituted the default it was supposed to be checking. A gate you have not seen fail is not
   evidence.
