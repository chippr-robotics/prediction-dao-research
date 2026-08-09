# Versioning and releases

How this repository decides what version it is, how a change reaches production, and where to look
when something is wrong. Spec 076.

The normative rules live in
`specs/076-monorepo-semantic-versioning/contracts/version-scheme.md`. This page is the working
guide.

---

## The short version

1. Title your pull request `type(scope): subject`. CI blocks the merge without it.
2. Merge into `staging`. That deploys a release candidate.
3. Promote `staging` → `main` with a **merge commit**. That publishes a release.
4. Never edit a version number by hand. The release process writes them.

---

## What version am I looking at?

Every deployed surface names its own build.

| Where | How |
| --- | --- |
| The app | Account modal, bottom line |
| Relay gateway | `GET /status` → `build.version` (public, no auth header needed) |

Three forms, and the third one is the important one:

| Value | Meaning |
| --- | --- |
| `v1.4.0` | A published production release |
| `v1.4.0-rc.2` | A release candidate on staging |
| `unreleased+b7c48f1` | **Not a published release** — a manual build, a rebuild, an out-of-band deploy |

`unreleased+<sha>` is a real answer, not a bug. A surface will never show you the *nearest* release
when it is not running that release: a wrong version number would make every release record
untrustworthy, so the code says "I don't know which release this is" instead.

## Classifying a change

The pull request title is the declaration:

```
<type>[(<scope>)][!]: <subject>
```

`feat` is a minor bump. Everything else is a patch. `!` — or a `BREAKING CHANGE:` footer — is a
major bump, whatever the type.

The release bump is the **most significant** classification in the range, not the last one merged.
One `feat` among fifty `chore`s is a minor release.

### What counts as breaking here

Written down deliberately, because "breaking" is otherwise a judgment call. Use `!` when the change:

1. **Alters an EIP-712 intent struct or domain.** Signatures that were valid a moment ago stop
   verifying. This has already caused an incident here (#1038).
2. **Changes a contract's storage layout or external interface.** Behind a UUPS proxy at a stable
   address, an in-place upgrade with a changed layout corrupts live state.
3. **Changes the mini-app host object.** Published packages sit at immutable CIDs and cannot be
   patched in place — every one of them breaks at once.
4. **Removes a member-facing capability**, a persisted storage key, a route, or a deployment key
   that existing clients resolve.

Adding is not breaking. A new struct, a new appended storage variable behind the `__gap`, a new host
key, a new capability — all `feat`.

### Dependency bumps

Dependabot's default title works unmodified. But if your PR also edits
`specs/075-monorepo-workspaces/baseline-bytecode.json` or `baseline-miniapp-builds.json`, the gate
will refuse `chore`, `docs` and `style`.

That is not pedantry. Editing a baseline is the act of accepting that **deployed bytecode or
published package bytes changed** — a floated `@chainlink/contracts` range did exactly this and
changed `ChainlinkFunctionsOracleAdapter`'s bytecode. That is never housekeeping. Use at least
`fix`, or `!` if an interface moved.

## Branches

```
feature/* ──▶ staging ──▶ main ──▶ production
                 │
                 └──▶ staging (mainnet)  +  staging-testnet
hotfix/*  ──────────────▶ main   (then back-merge to staging)
```

- Pull requests into `main` must come from `staging` or `hotfix/*`. CI enforces it.
- A hotfix must return to `staging`, or the next promotion silently reverts it. CI detects the drift
  and opens an issue.
- **Promotion uses a merge commit, not a squash.** Everywhere else, squash. Squashing a promotion
  would collapse every PR title in the release into one line and destroy the classification history
  the version is computed from.

## Staging

Two services, one commit:

| Service | Cohort | Purpose |
| --- | --- | --- |
| `staging` | mainnet (Polygon 137) | Mirrors the build that will next be promoted |
| `staging-testnet` | testnet (Amoy 80002 / Mordor 63) | Safe rehearsal |

Two services rather than one because the cohort is folded into the bundle at build time — a single
image resolves exactly one cohort, and widening that would put a testnet/mainnet switch into
production code.

**Actions on the mainnet staging service are real on-chain actions.** It has its own funded
accounts, gas wallet, and paymaster deposit, and no admin or deployer key — but the transactions it
sends are not simulations. The app says so; believe it.

## Package versions

- **Everything except mini-apps** tracks the repository release version. You never edit these; the
  release workflow writes them.
- **Mini-apps version themselves.** Bump `frontend/miniapps/<app>/package.json` in the same PR that
  changes the package. CI asserts the pairing in both directions: bytes changed without a version
  bump fails, and a version bump without changed bytes fails too.
- **`contracts/` is not a package.** Its release identity is the deployed implementation address plus
  the bytecode digest, recorded in each release.

## Troubleshooting

**"The gate rejected my title."** It prints the accepted types and the exact edit. Retitle the PR;
the check re-runs on `edited`.

**"It says my chore can't touch a baseline."** See the dependency-bumps section above — that is the
rule working.

**"The app says `unreleased+...`."** The build was not made from a published release. That is
accurate, not broken. Check whether the deploy came from the release pipeline.

**"No release was published after my merge."** Expected when the commit range is empty, or when no
commit in it carried a classification. `node scripts/release/version.js --explain` prints exactly
which commits voted and which were ignored.

**"I need to know what a release actually shipped."** Every release record lists all five artifact
categories, including the ones that did not move. A category whose source could not be read is
marked **unreadable** — which is not the same as unchanged, and means go look.
