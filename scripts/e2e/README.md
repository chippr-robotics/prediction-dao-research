# `scripts/e2e/` — end-to-end suite tooling (spec 094)

| Script | What it does | Who reads it |
|---|---|---|
| `generate-coverage-matrix.js` | Renders `docs/developer-guide/e2e-coverage-matrix.md` from `frontend/cypress/coverage/matrix.json`. `--check` diffs instead of writing. | `npm run e2e:matrix`, `npm run check:e2e-matrix`, and `frontend/src/test/e2e-policy/coverageMatrix.test.js` |
| `split-full-tier.js` | Splits the on-chain tier's specs across shard legs, longest-first, from the measured weights. | The `cypress-full-e2e` matrix in `.github/workflows/test.yml` |
| `check-lighthouse-coverage.js` | Fails when any budgeted route × profile produced no Lighthouse report. | The Lighthouse job in `.github/workflows/frontend-testing.yml` |

The generated document is committed. A hand-edit of it is drift, and
`check:e2e-matrix` says so rather than accepting it — same rule as `infra/grafana/`.
