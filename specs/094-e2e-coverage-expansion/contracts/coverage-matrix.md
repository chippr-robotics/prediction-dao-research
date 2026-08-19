# Contract: Coverage Matrix File and Gate

**Source of truth**: `frontend/cypress/coverage/matrix.json`
**Rendered**: `docs/developer-guide/e2e-coverage-matrix.md` (generated, committed)
**Generator**: `npm run e2e:matrix` → `scripts/e2e/generate-coverage-matrix.js`
**Gate**: `npm run check:e2e-matrix` and `frontend/src/test/e2e-policy/coverageMatrix.test.js`

## Shape

See [data-model.md](../data-model.md) for the full field table. Minimal valid entries:

```json
{
  "version": 1,
  "generatedDoc": "docs/developer-guide/e2e-coverage-matrix.md",
  "specs": [
    {
      "id": "075-monorepo-workspaces",
      "title": "Monorepo workspaces",
      "memberFacing": false,
      "reason": "Build and dependency tooling; no member surface to drive.",
      "flows": []
    },
    {
      "id": "034-zk-wager-pools",
      "title": "Wager pools",
      "memberFacing": true,
      "flows": [
        {
          "id": "pools.settle-payout-matrix",
          "name": "Creator proposes a payout matrix, members approve to threshold, the winner claims",
          "status": "absent",
          "tier": "none",
          "proposedTier": "on-chain",
          "depth": "none",
          "risk": "custody",
          "tests": [],
          "issue": "#TBD"
        }
      ]
    }
  ]
}
```

## Gate behaviour

| Check | Failure message must name |
|---|---|
| Set equality with `specs/` | The directory that has no entry, or the entry with no directory |
| Missing `reason` on `memberFacing: false` | The spec id |
| `partial` with no `missing` | The flow id |
| `absent`/`partial` with no `issue` | The flow id |
| `depth` above `none` with a `tests` path that does not exist | The path |
| Duplicate `flow.id` | Both spec ids |
| Generated doc out of date | The command to regenerate |

The generated-doc check is a regenerate-and-diff, matching `infra/grafana/`: a hand-edit of the
document is drift, and the gate says so rather than accepting it.

## Rendered document

Grouped by risk (custody first), then by spec. Each group leads with its counts — covered / partial /
absent / out-of-scope, and the count of rows whose depth is `smoke` or `none` despite a `covered`
status, because that number is the honest read of the suite.
