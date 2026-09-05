# Multi-Agent Development Flow

**Issue #1460.** Several agents work this repository at the same time, and the Spec Kit flow was
written for one. Two things broke as a result, and this document is the fix for both:

- **Spec numbers get claimed twice.** `017`, `041`, `050`, `102` and `104` each name two unrelated
  features. Not carelessness: `create-new-feature.sh` answers "what is the next number?" with
  `max(existing) + 1`, which is correct exactly once per merge. Two agents who ask before either
  has merged get the same answer, and *both of them checked*.

  `104` is the one to look at. Both halves of it — `104-passkey-account-recovery` and
  `104-guttertoken-assistant-rail` — were written, implemented and merged to `staging` on
  2026-09-04 and 2026-09-05, i.e. **while the gate below was being written**, and were caught by
  its first CI run. Neither agent did anything wrong. That is the rate at which this happens, and
  it is why the rule is a gate rather than a paragraph.
- **Nobody can see what is being worked.** An issue's state lived in whichever agent's context
  window was working it. A second agent picking up the "next" issue had no way to know the first
  one had started ten minutes earlier.

The protocol below is written for an agent to follow verbatim. Where a rule is enforced by a gate,
the gate is named — the rules that are only prose are the ones that decay, so the load-bearing ones
are not prose.

---

## What an agent can actually write

This is the first thing to get straight, because half the flow is shaped by it.

| Field | Where it lives | Writable by an agent? |
|---|---|---|
| Title, body, state, labels, assignees, milestone | Issue | Yes — `issue_write` |
| **Type** (Task / Bug / Feature) | Issue | Yes — `issue_write` `type` |
| **Priority** (Urgent / High / Medium / Low) | Org-level issue field | Yes — `issue_write` `issue_fields` |
| **Effort** (High / Medium / Low) | Org-level issue field | Yes — `issue_write` `issue_fields` |
| Start date, Target date | Org-level issue field | Yes — `issue_write` `issue_fields` |
| Parent / sub-issue links | Issue hierarchy | Yes — `sub_issue_write`, or `parent_issue_number` on create |
| **Status** (Todo / In progress / …) | **Project item** | **No.** There is no Projects v2 write tool. |

That last row is the whole reason the `status:*` labels exist. **The label is the record of state.**
`.github/workflows/project-status-sync.yml` mirrors it onto the board when `PROJECT_URL` and
`PROJECTS_TOKEN` are configured; when they are not, it warns and the label still says what is true.
Never wait on the board, and never report a status you only set on the board.

Run `list_issue_fields` before writing a field for the first time — the option names are validated
against the live field, and a wrong one fails the call rather than silently doing nothing.

---

## The lifecycle

### 1. Claim the issue before doing anything else

Claiming is what stops two agents starting the same work. In one `issue_write` update:

- assign yourself (or the human operator, if you have no bot identity),
- set `status:in-progress` and remove any other `status:*` label,
- set **Type** if it is unset (`Feature`, `Bug` or `Task`),
- set **Priority** and **Effort** if unset (see the sizing table below),
- add `agent-coordinated`.

Then comment once, saying what you are about to do and on which branch. That comment is how a human
— or the next agent, after your context is gone — reconstructs where the work went.

**If the issue already carries `status:in-progress` and an assignee that is not you, stop.** Say so
and pick something else. Overlapping work is more expensive than idle capacity.

### 2. Triage before planning

Read the issue and decide, in this order:

1. **Is it already covered by an existing spec?** `ls specs/` and grep. Re-specifying something that
   exists is the most common wasted day here.
2. **Is it one issue?** Anything `size:xl` is not. Split it into sub-issues *now* (step 6), before a
   number is reserved, because the split usually changes the shape of the spec.
3. **Does it need a spec at all?** Per the constitution: a change touching funds, access control or
   oracle resolution **always** does. A typo fix does not. `size:xs`/`size:s` with no contract,
   money-path or new-surface involvement usually does not.
4. **Is the acceptance criterion testable?** If you cannot say what would prove it done, run
   `/speckit-clarify` or ask in a comment — do not guess and build.

Record the outcome as a comment. Triage that lives only in your context did not happen.

### 3. Branch from `staging`, never from `main`

`main` is the production branch (spec 076); everything on it is deployed. Feature work branches from
`staging` and merges back into it, and only a promotion or a declared hotfix reaches `main` —
`branch-policy.yml` enforces the second half of that.

```bash
git fetch origin staging
git checkout -b <NNN>-<short-slug> origin/staging
```

Name the branch after the reserved spec number when there is one. It is what makes a stray branch
attributable months later, and `create-new-feature.sh` reads the prefix.

### 4. Reserve the number — as its own PR, merged first

**This is the step that fixes duplicate numbering, and it only works if it is done first.**

A spec number is *not* claimed by computing it, by writing it on a branch, or by opening a draft PR.
It is claimed by **merging a reservation PR into `staging`**. Until that merge, another agent asking
the same question will get the same answer and be equally entitled to it.

```bash
# The proposal. Numbers against origin/staging and origin/main, not just your (possibly stale)
# checkout — each agent's container was cloned at a different moment.
.specify/scripts/bash/create-new-feature.sh --dry-run --short-name 'funding pools' 'Funding pools'
```

Then open a PR into `staging` containing the reservation and **nothing else**:

```
specs/<NNN>-<slug>/spec.md                       # skeleton: problem statement and scope
frontend/cypress/coverage/matrix.json            # + a row for <NNN>-<slug>
docs/developer-guide/e2e-coverage-matrix.md      # regenerated: npm run e2e:matrix
```

The last two are not optional extras — `check:e2e-matrix` fails a spec directory with no row, and
the doc is generated and diff-gated. A spec with no member-facing flow carries a **reason** instead
of flows; see the [E2E testing policy](e2e-testing-policy.md). At reservation time the row is
usually a single `planned` flow, or the reason.

Label the PR `spec-reservation`, title it `spec(<NNN>): reserve — <slug>`, and merge it as soon as
CI is green. No implementation, no plan, no tasks. Small on purpose: the collision window is
however long that PR sits open.

Only then do the design work — `/speckit-plan`, `/speckit-tasks` — in the normal feature PR.

**The gate.** `npm run check:specs` (`scripts/specs/check-spec-registry.js`, CI job *Spec Registry*)
fails when two directories claim one number. It also enforces `NNN-kebab-case` naming and that a
reserved number has a `spec.md` — a reservation with no spec is indistinguishable from an abandoned
one. The five pre-gate collisions are frozen in `LEGACY_COLLISIONS` with their own rule (S-04) that
fails if an entry outlives the collision it excuses — so the list shrinks when someone renumbers a
pair, and cannot silently rot. Renumbering is owned by whoever owns those specs, not by this gate.

Adding to that list is not a way to get CI green. Once the gate is on `staging`, S-01 fails before a
second claimant can merge, so a new entry could only describe a collision the gate was never able to
see — which, from that point, is none.

**And the gate has to be able to see the PR.** `specs/**` is now its own change-detection filter in
`ci-manager.yml`. It had none, so a PR touching only `specs/` matched no filter and ran zero jobs —
and with required checks in force, `skipped` *satisfies* them. The one PR type whose entire purpose
is claiming a number was the one type the number gate could never run on.

### 5. Implement through the Spec Kit flow

`/speckit-specify` → `/speckit-clarify` (optional) → `/speckit-plan` → `/speckit-tasks` →
`/speckit-analyze` (optional) → `/speckit-implement`. Every `plan.md` opens with the constitution
check; read `.specify/memory/constitution.md` before planning, not after.

### 6. Sub-issues are how work is delegated and tracked

A task worked by a subagent gets a sub-issue. Not a checkbox in a comment — a sub-issue, because
that is the only representation the project board, the parent issue and the next agent can all see.

Create them with `issue_write` and `parent_issue_number` (one call, created and linked), or link an
existing issue with `sub_issue_write`. Each sub-issue gets, at creation:

- a **Type** (almost always `Task`),
- a **Priority** — inherit the parent's unless the sub-task is genuinely on a different critical path,
- an **Effort** / `size:*` label,
- `status:triage` until a subagent picks it up.

Then, for each one:

| Moment | What you set |
|---|---|
| You hand the task to a subagent | `status:in-progress` |
| The subagent reports back | leave it — **you have not reviewed it yet** |
| You have reviewed and accepted the work | `status:in-review` once the PR is open |
| The PR merges | `status:done`, and close with `state_reason: completed` |
| The subagent is stuck on something outside the task | `status:blocked` + a comment naming the blocker |

Update the sub-issue at the moment the state changes, not in a batch at the end. A batch update is a
status field that was wrong for the entire time anyone might have read it.

### 7. Review subagent work before accepting it

A subagent's report is a claim, not a result. Before you mark anything accepted:

- **Read the diff**, not the summary. The summary is what the subagent believes it did.
- **Run the gates it touched.** See the `monorepo-verify` skill for which gate proves what. At
  minimum: the test suite for the surface, plus `check:specs`, `check:storage-layout` (any
  upgradeable contract), `check:deps` (anything touching dependencies).
- **Check for the failure this repo keeps having**: an assertion that cannot fail. A test behind a
  precondition guard that ends in `expect(true).to.be.true` reports as coverage and proves nothing
  (`frontend/src/test/e2e-policy/assertionDepth.test.js`).
- **Verify it did not widen the scope.** A subagent asked to fix a CI failure that also refactored a
  module has done two things, one of which nobody reviewed.

If the work is not right, say what is wrong on the sub-issue and hand it back. Do not silently fix
it yourself — the next identical task will be delegated with the same instructions.

### 8. Close the loop

- Open the PR into `staging` as **ready for review**, not draft (draft PRs run no CI here).
- Set the parent issue to `status:in-review`.
- When it merges: `status:done` on the parent and every sub-issue, close each with
  `state_reason: completed`, and drop `status:in-progress` everywhere.
- If part of the scope was left out, say so in the closing comment and open a follow-up issue for
  it. Scaling the work down is the operator's call, not yours — but silently scaling it down is
  nobody's.

---

## Sizing and priority

Set both at creation. An unsized backlog cannot be planned, and an agent that skips sizing has moved
the work of estimating onto whoever reads the issue next.

| `size:*` | Meaning | **Effort** field |
|---|---|---|
| `size:xs` | Under an hour. A typo, a constant, a doc line. | Low |
| `size:s` | A few hours, one surface, no spec needed. | Low |
| `size:m` | A day or two, or more than one surface. | Medium |
| `size:l` | Multi-day. Needs a spec and a reserved number. | High |
| `size:xl` | Too big to deliver as one issue — **split it**. | High |

| `Priority` | Meaning |
|---|---|
| `Urgent` | Production is broken, or this blocks other work now. |
| `High` | On the critical path for the current milestone. |
| `Medium` | Planned, not blocking. |
| `Low` | Wanted, unscheduled. |

The issue templates collect both, but a template answer is text in the body — an agent triaging the
issue still has to write them onto the **fields**, which is what the board reads.

---

## Status vocabulary

Declared in `.github/labels.json`, applied by `labels-sync.yml`. **Exactly one at a time.**

| Label | Means | Board |
|---|---|---|
| `status:triage` | Accepted, unclaimed. Free to pick up. | Todo |
| `status:in-progress` | Claimed by its assignee, actively worked. **Do not pick up.** | In progress |
| `status:blocked` | Stopped on something outside this issue, named in a comment. | Blocked |
| `status:in-review` | Pushed, PR open, waiting on review — not on more code. | In review |
| `status:done` | Merged and verified. Set *alongside* closing, never instead of it. | Done |

A closed issue with no `status:*` label mirrors to **Done**: closing is itself a statement. An
**open** issue with no status label mirrors to nothing — "no opinion" moves no card, which is what
keeps the first run of the mirror from stampeding the whole backlog into one column.

---

## Rules that hold regardless

- **One agent per issue.** The assignee plus `status:in-progress` is the claim. Respect it.
- **One number per spec, claimed by a merge.** Not by a branch, not by a draft PR.
- **Branch from `staging`.** Only promotions and declared hotfixes touch `main`.
- **The label is the state; the board is a mirror.** Never block on the board.
- **A subagent's report is a claim.** Review the diff and run the gates before accepting.
- **Never mark a sub-issue done for work you have not seen merged.**
- **Say what you did not do.** A closed issue with unfinished scope and no follow-up is the one
  outcome that costs more than not starting.

---

## One-time setup

Done once per repository, by a human — an agent has neither the token nor the permission.

1. **Labels** — merge `.github/labels.json` to `main` or `staging`, or run the *Sync Coordination
   Labels* workflow manually. `GITHUB_TOKEN` is sufficient. Applying a label that does not exist
   yet still works — GitHub creates it, grey and undescribed — so an agent is never blocked on this
   step; the sync is what gives the label its colour and its meaning.
2. **`PROJECT_URL`** — a repo or org **variable** holding the project URL, e.g.
   `https://github.com/orgs/chippr-robotics/projects/7`.
3. **`PROJECTS_TOKEN`** — a **secret** holding a fine-grained PAT with the `project` scope.
   `GITHUB_TOKEN` cannot write Projects v2; this is not a permissions setting you can adjust.
4. **Board columns** — the Status field needs options matching the table above. The mirror matches
   case- and separator-insensitively (`In Progress` = `in-progress`) but will not invent a column:
   a missing one is reported, and those cards stay where they are.

Until 2 and 3 exist, everything above still works. The board is just stale, and the workflow says so
on every run instead of pretending otherwise.

---

## See also

- [`.specify/memory/constitution.md`](../../.specify/memory/constitution.md) — the standards every plan checks against
- [Contributing](contributing.md) — branch model, PR process
- [Release and promotion](../runbooks/release-and-promotion.md) — `staging` → `main`
- [E2E testing policy](e2e-testing-policy.md) — why a new spec needs a coverage-matrix row
- `monorepo-verify` skill — which gate proves what, before you accept a subagent's work
