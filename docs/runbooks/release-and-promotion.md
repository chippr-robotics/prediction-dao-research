# Runbook: release and promotion

Operating the release train. Spec 076. For the *why*, see
`docs/developer-guide/versioning-and-releases.md`.

---

## One-time setup

These are the operational steps that cannot be made by a pull request. Until each is done, the
corresponding automation is inert — and inert automation looks like working automation, so check
them off explicitly.

### 1. Create and protect `staging` (FR-016, FR-017)

```bash
git fetch origin main
git checkout -B staging origin/main
git push -u origin staging
```

Then protect it to the same standard as `main`: required status checks, no force-push, no deletion.

Until this exists, `branch-policy.yml`'s drift job logs a warning and does nothing — deliberately,
since the alternative is a daily failing job about a branch that does not exist yet.

### 2. Register the required status checks (FR-010, T031)

In branch protection for **both** `main` and `staging`, mark as required:

- `Change classification` (from `version-gate.yml`)
- `Mini-app version pairing` (from `version-gate.yml`)
- `PRs into main come from staging or a hotfix` (from `branch-policy.yml`, `main` only)
- `staging must mirror production` (from `branch-policy.yml`, `main` only)

**A gate that is not required is not a gate.** The workflow files exist and will run and fail
correctly, but GitHub will happily let a red check merge until it is marked required.

### 3. Allow the release workflow to push to `main`

`release.yml` pushes a tag and a `chore(release): …` commit. Grant the GitHub Actions identity
push access to `main` in branch protection ("Allow specified actors to bypass required pull
requests"), or the release will tag successfully and then fail on the CHANGELOG commit.

### 4. Provision the two staging services (FR-023, FR-026c, T035)

Both are Cloud Run services in the same project as production. See
`specs/076-monorepo-semantic-versioning/contracts/environments.md` for the full matrix.

| Service | Cohort | Host |
| --- | --- | --- |
| `prediction-dao-research-staging` | mainnet (137) | `staging.fairwins.app` |
| `prediction-dao-research-staging-testnet` | testnet (80002) | `staging-testnet.fairwins.app` |

**Each needs its own** — not production's:

- relayer gas wallet, separately funded and sized for testing
- paymaster EntryPoint deposit
- origin-lock secret
- RPC keys and API credentials

**Neither gets an admin or deployer key.**

This matters because the mainnet staging service reaches the live Polygon estate. Sharing a funded
account with production means a staging defect can drain or rate-limit something members depend on.
FR-026c is not advice.

Also set both to `noindex`, and grant the Actions identity `roles/cloudbuild.builds.editor` so
`staging-deploy.yml` can submit `cloudbuild.staging.yaml`.

---

## Daily operation

### Merging work

Feature branch → `staging`, squash-merged, PR titled `type(scope): subject`.

Every merge into `staging` tags a candidate (`vX.Y.Z-rc.N`) and deploys both staging services.

### Promoting to production

1. Open a pull request `staging` → `main`.
2. Confirm the checks pass — including **staging must mirror production**, which fails if the two
   configurations differ anywhere unenumerated.
3. **Merge with a merge commit. Not a squash.** The workflow prints this as a notice on every
   promotion PR. Squashing collapses every PR title into one subject, and the release version is
   computed from those subjects — a release containing a `feat` would ship as a patch.
4. `release.yml` tags, publishes the record, updates `CHANGELOG.md`, and syncs manifest versions.

### Hotfixes

```bash
git checkout -b hotfix/<what> origin/main
# fix, PR into main, merge
```

Then **back-merge**, or the next promotion reverts it:

```bash
git checkout staging && git merge origin/main && git push
```

`branch-policy.yml` opens an issue labelled `release-drift` when `main` holds commits `staging`
lacks, and closes it when the drift clears. Do not close it by hand — closing it without merging
just removes the reminder.

---

## When something goes wrong

### Reproducing a release problem locally — check your clone depth FIRST

```bash
git rev-parse --is-shallow-repository   # must print false
git rev-list --count HEAD               # compare against the count CI reports
```

**A shallow clone will make release bugs invisible and, worse, produce wrong output that looks
right.** This has already cost real time twice:

- The v1.0.0 investigation. The pipeline was reading a ~5.6 MB commit log in CI and blowing Node's
  1 MiB `execFileSync` default. Locally the same command produced 430 KB and worked perfectly,
  because the clone held 193 of 2508 commits. The measurement was right and the conclusion was
  wrong.
- Anything that generates a changelog. `changelog.js` walks the whole range, so running it against
  a shallow clone silently emits an entry missing most of the release.

`actions/checkout` in `release.yml` uses `fetch-depth: 0` for exactly this reason. Match it locally
before drawing conclusions:

```bash
git fetch --unshallow    # or: git clone (without --depth) into a scratch directory
```

### The release published nothing

Expected in two cases: an empty commit range, or no commit in the range carried a classification.

```bash
node scripts/release/version.js --explain
```

prints every commit, how it classified, and which one set the bump. Commits shown as
`[unclassified]` did not vote — merge commits and anything predating the convention.

### The tag already exists

`release.yml` fails hard and does not force-update. This means a release already claimed that
version. **Investigate before doing anything** — do not delete or move the tag. Published tags are
the only durable record of what shipped (FR-004). The usual cause is a re-run of a completed
release; if so, nothing is wrong and no action is needed.

### The release tagged and published, but the CHANGELOG commit failed

The tag and the GitHub Release are already correct and immutable — do not re-run the release to
"fix" the changelog. Re-running hits the tag-immutability guard (FR-004) and fails, which is the
intended behavior.

What is missing is only the in-repo `CHANGELOG.md` entry and the manifest version sync. Backfill it
by hand, **from a full clone** (see the clone-depth warning above — a shallow one writes an entry
missing most of the release):

```bash
git fetch --unshallow
node scripts/release/changelog.js --version v1.0.0 --previous ""
node scripts/release/sync-manifest-versions.js --version v1.0.0
```

Then open an ordinary pull request with the result. This is the one case where a generated file is
committed outside the release job, and it is still generated — never hand-written (FR-037).

**Known outstanding:** v1.0.0's entry was never written, because the release job failed at this step
on a stale hardcoded manifest list. It needs the backfill above.

### A promotion is blocked by config drift

The check names the offending build arg. Two possibilities:

- **The difference is a mistake** — fix the config so staging matches production.
- **The difference is intended** — add it to the enumerated list in `contracts/environments.md`
  *and* to `ENUMERATED` in `scripts/release/check-promotion-config.js`, in a reviewed PR. Widening
  the list is a decision about how faithful staging is; it should not be made while unblocking a
  release.

### A promotion is blocked because `networks.js` changed

Staging reaches both cohorts by being two services, never by changing how a build resolves its
cohort (FR-026b). If the change is genuinely unrelated, split it into its own pull request where it
gets reviewed as what it is: a change to the testnet/mainnet boundary, which is a constitution III
concern.

### An environment reports `unreleased+<sha>`

Accurate, not broken. That build was not made from a published release — a manual trigger, a rebuild
of an untagged commit, or an out-of-band deploy. Two of this estate's services are deliberately
deployed out of band (the multi-container relay gateway and the alto bundler), so they will often
read this way.

If **production** reads it after a normal release, the Cloud Build trigger fired before the release
workflow tagged. The next release fixes it; nothing is broken.

### Staging is down but production is fine

Staging failing does not block production — but a promotion should not proceed on a candidate nobody
exercised. Fix staging first. Bypassing it is the thing this feature exists to stop.

---

## Emergencies

**Production is broken and staging cannot be used.** Use a `hotfix/*` branch. That is what it is for,
CI allows it, and the release record will say `Promoted from: none (hotfix)` so the shortcut is on
the record rather than hidden. Back-merge afterwards.

**The version gate is blocking an urgent fix.** Retitle the PR. It takes seconds and the check
re-runs on `edited`. Do not disable the gate — constitution IV forbids making it advisory, and an
urgent fix is exactly when a mis-classified release is most expensive.
