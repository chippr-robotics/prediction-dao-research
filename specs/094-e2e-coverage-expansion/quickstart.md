# Quickstart: End-to-End Coverage Expansion

**Feature**: 094-e2e-coverage-expansion

How to run and validate each piece of the foundation. Run everything from the repository root unless
stated otherwise.

## Prerequisites

```bash
npm ci                 # root install; NEVER `npm install` (spec 075 — it drops the rolldown binary)
npx cypress install    # belt and braces if the binary cache is cold
```

The on-chain tier additionally needs a local chain:

```bash
npx hardhat compile
HARDHAT_LOCAL_CHAIN_ID=80002 npx hardhat node    # Amoy-shaped, per spec 071's membership pinning
npm run deploy:local && npm run sync:frontend-contracts
```

## 1. The coverage matrix

```bash
npm run e2e:matrix          # regenerate docs/developer-guide/e2e-coverage-matrix.md
npm run check:e2e-matrix    # schema + set-equality with specs/ + generated doc is current
```

**Expected**: the check passes. To prove it can fail, add a directory under `specs/` with no matrix
entry and re-run — it must name that directory.

## 2. The policy gates

```bash
npm run test:frontend -- --run src/test/e2e-policy
```

**Expected**:
- `assertionDepth.test.js` reports the count of unconditional-truth assertions and fails on any that
  lacks an `// EITHER-WAY:` comment.
- `coverageMatrix.test.js` passes.
- `harnessBoundary.test.js` passes — `axe-core` is not imported anywhere under `frontend/src`.

To prove the first can fail, add `expect(true).to.be.true` to any spec under `cypress/e2e/` with no
preceding comment.

## 3. Accessibility scanning

```bash
cd frontend
npx start-server-and-test dev http://localhost:5173 \
  'cypress run --spec "cypress/e2e/fast/22-accessibility.cy.js"'
```

**Expected**: the ruleset runs against each surface; serious and critical violations fail with the
rule id, impact and selectors. Suppressions appear in the log with their issue reference.

To prove it can fail, remove an `aria-label` from a header control and re-run.

## 4. Both viewports

```bash
cd frontend
CYPRESS_VIEWPORT_PROFILE=phone   npx start-server-and-test dev http://localhost:5173 'cypress run --spec "cypress/e2e/fast/**/*.cy.js"'
CYPRESS_VIEWPORT_PROFILE=desktop npx start-server-and-test dev http://localhost:5173 'cypress run --spec "cypress/e2e/fast/**/*.cy.js"'
```

**Expected**: both legs pass and each logs its active profile. The desktop leg must match the
pre-change result exactly — it is the same 1280×720 the suite already used, so any difference there
is a real regression rather than a re-baselining.

## 5. Lighthouse, both profiles

```bash
cd frontend
npm run build
npx lhci autorun --config=lighthouserc.desktop.json
npx lhci autorun --config=lighthouserc.mobile.json
cd .. && node scripts/e2e/check-lighthouse-coverage.js
```

**Expected**: a report per route per profile; the coverage check passes. To prove it can fail, add a
route to `frontend/lighthouse-routes.json` that the app does not serve and re-run the check — it
must fail naming the unmeasured route, not pass with fewer reports.

## 6. The sharded on-chain tier

```bash
node scripts/e2e/split-full-tier.js --shards 4 --index 0    # prints leg 0's spec list
node scripts/e2e/split-full-tier.js --shards 4 --print-all  # all legs, with predicted seconds
```

**Expected**: every spec on disk appears in exactly one leg; predicted leg times are within roughly
20% of each other; any spec estimated rather than measured is reported by name.

Run one leg locally against a chain:

```bash
cd frontend
npx cypress run --spec "$(node ../scripts/e2e/split-full-tier.js --shards 4 --index 0 --csv)"
```

## 7. Validating the whole change

```bash
npm run check:e2e-matrix
npm run test:frontend -- --run src/test/e2e-policy
npx hardhat test test/config/CiGates.test.js     # workflow-shape guards still hold
npm run check:deps                                # the lockfile did not lose a platform binary
```

The `monorepo-verify` skill documents what each repo-wide gate proves and which failures are known.

## What "done" looks like

- Every spec directory has a matrix row; the generated document is current.
- The unconditional-truth count is reported, and every remaining instance names its reason.
- The fast tier runs green at both viewport profiles.
- Every budgeted route has a measurement on both profiles.
- The four on-chain shard legs together pass the same set the serial tier passed, in under 15 minutes
  each.
