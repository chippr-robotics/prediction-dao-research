# `scripts/release/` — the single authority for version computation

Spec 076. **Nothing else in this repository may compute a release version.**

That is not a style preference. FR-015 requires the release-notes configuration and the merge gate to
agree on what each change classification means, and the only way two systems cannot disagree is for
there to be one of them. `.github/release-drafter.yml` deliberately has **no `version-resolver:`
block** for this reason — Release Drafter writes notes; these scripts decide the number, and
`release.yml` hands it over explicitly.

If you find yourself adding a second place that derives a version, you are reintroducing the defect.

## Modules

| File | Responsibility |
| --- | --- |
| `classify.js` | Parse one subject line into `{type, scope, breaking, bump}`; apply the byte-gate escalation rule |
| `version.js` | Read tags, aggregate classifications over a commit range, emit the next version or release candidate |
| `artifacts.js` | Build the release record's artifact table by READING deployments and the on-chain registry |

All three are dependency-free CommonJS, runnable with plain `node`. They are invoked by workflows
directly and are deliberately **not** a workspace package: `scripts/` is not a workspace member, and
making it one to hold three files would mean new config and a new dev dependency for no consumer.

## Tests

```bash
npm run test:release       # node --test (built into Node 22, no new dependency)
```

## Normative reference

`specs/076-monorepo-semantic-versioning/contracts/version-scheme.md` is the specification these
implement — the classification grammar, the type→bump map, and what "breaking" means in **this**
repository (EIP-712 struct or domain changes, contract storage layout or external interface changes,
mini-app host-object changes, and removed member-facing capabilities). Change that document and these
scripts together, never one alone.
