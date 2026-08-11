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

### 3. Nothing to do — the release record arrives as a pull request

> The promotion rule admits `release/*-changelog` alongside `staging` and `hotfix/*` for exactly
> this reason. Without that arm, turning the rule on makes the release record unmergeable and the
> in-repo record drifts behind the tags — which is how `CHANGELOG.md` ended up ten versions behind
> and `v1.2.4`'s entry was lost. The contradiction is invisible until `staging` exists, because the
> job is inert before then.

`release.yml` pushes the TAG directly (tags are not covered by the branch ruleset) and then opens a
**pull request** for the generated `CHANGELOG.md` and manifest version bumps.

It used to push that commit straight to `main`, and once branch protection arrived that failed on
every release:

```
remote: error: GH013: Repository rule violations found for refs/heads/main.
- Changes must be made through a pull request.
- 2 of 2 required status checks are expected.
```

A ruleset bypass for the bot was the alternative. Opening a PR was chosen instead, so the protection
on the branch that deploys to members stays intact with no exception. **The cost is a small
`chore(release): vX.Y.Z` PR after each release — review and merge it; there is nothing to edit.**

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

Also set both to `noindex`.

**Each service builds itself from the `staging` branch.** CI does not push images: the
`Staging Candidate` workflow tags `vX.Y.Z-rc.N` and stops there. It used to submit
`cloudbuild.staging.yaml`, which never worked in a single run — the grant it assumed was never
made — and left every staging merge marked red by a step that had never functioned. A permanently
red check reports nothing, and a genuinely stale staging service hid behind it for a day.

So when a staging host is serving the wrong thing, the workflow run is the wrong place to look.
See "Staging is serving an old build" below.

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
4. `release.yml` tags, publishes the GitHub Release, then opens a `chore(release): vX.Y.Z` pull
   request carrying the generated `CHANGELOG.md` entry and manifest version bumps. Merge it.

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

Expected in three cases: an empty commit range, a range holding nothing but the generated release
record, or no commit in the range carrying a classification.

```bash
node scripts/release/version.js --explain
```

prints every commit, how it classified, and which one set the bump. Two kinds of commit do not vote:

- `[unclassified]` — merge commits and anything predating the convention.
- `[skipped]` — carries `[skip release]`, i.e. the release process's own paperwork.

The three silences are reported as distinct reasons (`empty-range`, `only-skipped-commits`,
`no-classified-commits`) because they mean different things. `only-skipped-commits` is the system
working. `no-classified-commits` means nobody has established what the range contains.

### The version keeps incrementing but nothing new ships

Look at what the tags are actually sitting on:

```bash
git tag --list 'v*' | sort -V | tail -5 | while read t; do
  echo "$t  $(git log -1 --format='%s' "$t^{commit}")"
done
```

If a tag's commit is a merge of a `release/vX.Y.Z-changelog` branch, the release train is releasing
its own paperwork rather than any product change, and the fix is in
`scripts/release/classify.js#carriesSkipMarker` — see contracts/version-scheme.md §2. This happened
for `v1.5.6` and `v1.5.7`.

The second thing to check is whether the version is the *only* thing that moved:

```bash
git log --oneline origin/main..origin/staging | wc -l   # work merged but never promoted
```

`branch-policy.yml` opens a `release-drift` issue when `main` holds commits `staging` lacks. It does
**not** watch the other direction, so work sitting unpromoted on `staging` raises nothing on its own.
A non-zero count here with no open promotion PR means production is running without it. Promote it —
see "Promoting to production" above.

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
git fetch --unshallow                      # MANDATORY — see the clone-depth warning above
node scripts/release/changelog.js --version vX.Y.Z --previous vX.Y.W
node scripts/release/sync-manifest-versions.js --version vX.Y.Z
```

For several missed releases, run `changelog.js` once per tag **oldest first** (each call prepends,
so the newest ends on top), then sync the manifests once to the newest tag.

Then open a pull request with the result. Use a **`release/*` branch** if you can — the version gate
exempts that branch outright. On any other branch the gate still passes provided the PR also updates
`CHANGELOG.md` and every manifest version equals the newest tag, which is exactly what a release
record looks like; an arbitrary version number still fails.

This is the one case where a generated file is committed outside the release job, and it is still
generated — never hand-written (FR-037).

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

### Staging is serving an old build

A staging host that is *up* and serving a tree from days ago looks exactly like a working staging
service until someone goes looking for a change that should be there. Settle it from the bytes it is
actually serving rather than from a workflow run:

```bash
BASE=https://<staging-host>
ENTRY=$(curl -s "$BASE/" | grep -oE '/assets/index-[A-Za-z0-9_-]+\.js' | head -1)
curl -s "$BASE$ENTRY" > /tmp/deployed.js

# A string the change ADDED, and one it REMOVED. Both answers matter:
grep -c "New statement"    /tmp/deployed.js   # expect 1 once deployed
grep -c "Reporting period" /tmp/deployed.js   # expect 0 once deployed
```

A string the repository no longer contains anywhere, still present in the deployed bundle, is proof
the service has not rebuilt — not a routing or caching question, and nothing a hard refresh fixes.

Two further reads, both cheap:

- **The drawer footer.** `vX.Y.Z-rc.N` means the build carried a candidate identity;
  `unreleased+<sha>` names the exact commit; a bare `unreleased` means the build got no
  `VITE_APP_VERSION`/`VITE_GIT_SHA` at all, which tells you the builder is not passing them.
- **Compare chunk hashes with production.** Identical `vendor-*.js` and `index-*.css` with a
  different `contracts-*.js` says "same source tree, different build-time config" — i.e. staging is
  configured correctly and is simply stale, rather than pointed at the wrong branch.

Then go to the service's own build configuration. CI does not deploy staging (see §4).

---

## Emergencies

**Production is broken and staging cannot be used.** Use a `hotfix/*` branch. That is what it is for,
CI allows it, and the release record will say `Promoted from: none (hotfix)` so the shortcut is on
the record rather than hidden. Back-merge afterwards.

**The version gate is blocking an urgent fix.** Retitle the PR. It takes seconds and the check
re-runs on `edited`. Do not disable the gate — constitution IV forbids making it advisory, and an
urgent fix is exactly when a mis-classified release is most expensive.
