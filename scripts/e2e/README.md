# `scripts/e2e/` — end-to-end suite tooling (spec 094)

| Script | What it does | Who reads it |
|---|---|---|
| `generate-coverage-matrix.js` | Renders `docs/developer-guide/e2e-coverage-matrix.md` from `frontend/cypress/coverage/matrix.json`. `--check` diffs instead of writing. | `npm run e2e:matrix`, `npm run check:e2e-matrix`, and `frontend/src/test/e2e-policy/coverageMatrix.test.js` |
| `lib/tier-split.js` | The shared longest-first packing, the unmeasured-spec warning, and the argument parsing both splitters use. Not run directly. | `split-full-tier.js`, `split-fast-tier.js` |
| `split-full-tier.js` | Splits the ON-CHAIN tier's specs across 4 shard legs, longest-first, from `full-tier-weights.json`. | The `cypress-full-e2e` matrix in `.github/workflows/test.yml` |
| `split-fast-tier.js` | Splits the NO-CHAIN tier across 6 legs **per viewport profile** (`--profile desktop\|phone`, which decides whether the passkey specs are in the set) from `fast-tier-weights.json`. | The `cypress-fast-e2e` matrix in `.github/workflows/test.yml` |
| `check-lighthouse-coverage.js` | Fails when any budgeted route × profile produced no Lighthouse report. | The Lighthouse job in `.github/workflows/frontend-testing.yml` |

The generated document is committed. A hand-edit of it is drift, and
`check:e2e-matrix` says so rather than accepting it — same rule as `infra/grafana/`.
