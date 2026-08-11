# Contract: Version Scheme

**Feature**: `specs/076-monorepo-semantic-versioning` | Satisfies FR-003, FR-009, FR-013, FR-014

This is the normative definition. `scripts/release/version.js` implements it and is the only thing
that computes a version (R2).

---

## 1. Classification grammar

A pull request title MUST match:

```
<type>[(<scope>)][!]: <subject>
```

`type` is one of the values in §2. `!` declares a breaking change. A `BREAKING CHANGE:` footer in
the PR body is equivalent to `!`.

## 2. Type → bump

| Type | Meaning | Bump |
| --- | --- | --- |
| `feat` | New member-facing or operator-facing capability | **minor** |
| `fix` | Corrects wrong behavior | **patch** |
| `perf` | Faster or cheaper, same behavior | **patch** |
| `refactor` | Internal restructuring, no behavior change | **patch** |
| `docs` | Documentation only | **patch** |
| `spec` | Spec Kit artifacts only | **patch** |
| `test` | Tests only | **patch** |
| `build` | Build system, Docker, bundler | **patch** |
| `ci` | Workflow and pipeline changes | **patch** |
| `chore` | Housekeeping, dependency bumps | **patch** |
| `style` | Formatting only, no code change | **patch** |
| `revert` | Reverts a previous change | **patch** |
| any type with `!` | Breaking — see §3 | **major** |

**Aggregation (FR-013)**: the release bump is the **most significant** bump among all commits in the
range, not the last one. One `feat` among fifty `chore`s produces a minor release.

No type maps to `none`. Every merged change contributes to a release, because a release that omits a
merged change makes the record untrue.

**The one exception, and why it is not a hole in that rule.** A commit whose subject or body carries
`[skip release]` does not vote. The release process writes that marker on exactly one thing: the
generated `chore(release): vX.Y.Z` record it commits after publishing. That commit is not a merged
*change* — it is the writing-down of a release that already happened, so excluding it keeps the
record true rather than making it incomplete.

Without the exception the train runs on itself: the record reaches `main` inside a pull request, so
the workflow-level guard (which inspects only the head commit of the push) sees a merge subject, the
release runs, `chore(release)` classifies as a patch, and the version it mints has a record of its
own that mints the next one. `v1.5.6` was cut from the merge of the `v1.5.5` record and `v1.5.7`
from the merge of the `v1.5.6` one — three versions carrying no product change.

It is the **marker** that is honoured, never the `chore(release)` scope: a real change to the release
tooling is written with that scope too (`v1.5.2` was one), and it must keep counting.

## 3. What "breaking" means in THIS repository

FR-003 requires this to be written down rather than left to judgment. A change is **breaking** —
`!` is mandatory — if it does any of the following:

1. **Alters an EIP-712 intent struct or domain.** `@fairwins/intent-types` is the single source
   consumed by the SPA, the relay gateway, and verified against the contracts. A changed struct or a
   changed `name`/`version` domain invalidates signatures that were valid a moment earlier. This is
   the most consequential breaking class in the repo and the one that has already caused an incident
   (#1038).
2. **Changes a contract's storage layout or external interface.** Behind a UUPS proxy at a stable
   address, an in-place upgrade with a changed layout corrupts live state. `check:storage-layout`
   gates it; the version must say so too.
3. **Changes the mini-app host object.** `host` is the entire privileged surface handed to untrusted
   third-party packages. Removing or altering a key breaks every published package at an immutable
   CID, which cannot be patched in place.
4. **Removes a member-facing capability**, or removes/renames a persisted storage key, a route, or
   an on-chain deployment key that existing clients resolve.

A change that only *adds* — a new struct, a new appended storage variable behind the `__gap`, a new
host key, a new capability — is `feat`, not breaking.

## 4. Escalation from the byte gates (FR-014)

A pull request that modifies either byte-gate baseline —

- `specs/075-monorepo-workspaces/baseline-bytecode.json`
- `specs/075-monorepo-workspaces/baseline-miniapp-builds.json`

— MUST NOT be classified `chore`, `docs`, or `style`.

**Why**: editing a baseline is the act of accepting that deployed bytecode or published package
bytes changed. That is never housekeeping. This is checked from the **diff**, so it needs no
ordering against the digest jobs (R4), and it is the rule that stops a floated Solidity dependency
from shipping as a patch — the `@chainlink/contracts` 1.3.0 → 1.5.0 case that changed
`ChainlinkFunctionsOracleAdapter`'s bytecode.

## 5. Dependency automation (FR-014)

Dependabot's default title, `chore(deps): Bump X from A to B`, is valid and requires no human edit.
When such a PR also touches a baseline file, §4 applies and the classification must be raised —
which is the intended outcome, because that PR is no longer a routine bump.

## 6. Version identity strings

| Context | Format | Example |
| --- | --- | --- |
| Production release | `v<major>.<minor>.<patch>` | `v1.4.0` |
| Release candidate | `v<major>.<minor>.<patch>-rc.<n>` | `v1.4.0-rc.2` |
| Any build with no matching release | `unreleased+<short-sha>` | `unreleased+b7c48f1` |

The third form is required by FR-031 and is never substituted with the nearest tag.

## 7. Package versions

- **Repository release version** applies to `frontend`, `services/*`, `subgraph`,
  `packages/*`, `tools/miniapp-build`, and the root (FR-007a). These are written by the release
  process, never by a contributor.
- **Mini-app packages** (`frontend/miniapps/*`) carry their own version (FR-007). A contributor bumps
  it in the same PR that changes the package, and CI asserts the pairing: baseline digest changed
  for an app ⟺ that app's `package.json` version changed (FR-007b, R8).
- `contracts/` is not a package. Its release identity is the deployed implementation address plus the
  bytecode digest, recorded in the release record.
