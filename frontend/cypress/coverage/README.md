# `frontend/cypress/coverage/` — the suite's own facts (spec 094)

| File | Role | Gate |
|---|---|---|
| `matrix.json` | **Source of truth** for what end-to-end coverage exists. One entry per directory under `specs/`, including the ones with no member surface. | `frontend/src/test/e2e-policy/coverageMatrix.test.js` |
| `full-tier-weights.json` | Measured seconds per on-chain spec, used to balance the shard legs. | `scripts/e2e/split-full-tier.js` reports any spec it had to estimate |

`matrix.json` is keyed by spec **directory name**, never by number: `017`, `041` and `050` are each
used by two different features, and a numeric key would merge them into one row.

Do not hand-edit `docs/developer-guide/e2e-coverage-matrix.md` — it is generated from `matrix.json`
by `npm run e2e:matrix`.
