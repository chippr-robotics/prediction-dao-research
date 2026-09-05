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
| Title, body, open/closed, labels, assignees, milestone | Issue | Yes — `issue_write` |
| **Type** (Task / Bug / Feature) | Issue | Yes — `issue_write` `type` |
| **Priority** (Urgent / High / Medium / Low) | Org-level issue field | Yes — `issue_write` `issue_fields` |
| **Effort** (High / Medium / Low) | Org-level issue field | Yes — `issue_write` `issue_fields` |
| Start date, Target date | Org-level issue field | Yes — `issue_write` `issue_fields` |
| Parent / sub-issue links | Issue hierarchy | Yes — `sub_issue_write`, or `parent_issue_number` on create |
| **Status** (Todo / In progress / …) | **Project item** | **No.** There is no Projects v2 write tool. |

Run `list_issue_fields` before writing a field for the first time — the option names are validated
against the live field, and a wrong one fails the call rather than silently doing nothing.

### The board is a human task, and there is deliberately no mirror

An agent cannot write the project's Status field, and **this repository does not paper over that
with a status label.** It could: a `status:*` label is writable, and a workflow could copy it onto
the board. That was built for this feature and then deliberately removed, because it is a *second
copy of state the repository already holds*, and a second copy drifts. An agent that sets
`status:in-progress` and then stops — context exhausted, session ended, task abandoned — leaves an
issue that reads as actively worked forever, and nothing in the system can notice. The board would
faithfully mirror the wrong answer.

So **status is derived from state GitHub already tracks exactly once**:

| Question | Answered by | Why it cannot drift |
|---|---|---|
| Is anyone working this? | The **assignee** | One field, set by the agent that claimed it |
| Has work started? | A **linked PR** (`Closes #N`) | GitHub links it; the PR exists or it does not |
| Is it done? | The issue is **closed** | Closed by the merge, not by a separate write |
| What is it part of? | Its **parent / sub-issues** | Real hierarchy, not a naming convention |
| Is it stuck? | The `blocked` label **plus a comment** | The one state nothing else records — see below |

`blocked` is the single exception, and it is not a mirror: an issue can be open, assigned and stuck,
and GitHub has no other representation of that. It is only meaningful next to a comment naming the
blocker, so **never apply it without one** — and remove it when the blocker clears.

Moving cards on the board is a **human task for now**. Do not report a status you did not put into
one of the rows above.

---

## The lifecycle

### 1. Claim the issue before doing anything else

Claiming is what stops two agents starting the same work, and **the assignee is the claim** — one
field, no second copy. In one `issue_write` update:

- **assign yourself** (or the human operator, if you have no bot identity),
- set **Type** if it is unset (`Feature`, `Bug` or `Task`),
- set **Priority** and **Effort** if unset (see the sizing table below),
- add `agent-coordinated`.

Then comment once, saying what you are about to do and on which branch. That comment is how a human
— or the next agent, after your context is gone — reconstructs where the work went.

**If the issue already has an assignee who is not you, stop.** Say so and pick something else.
Overlapping work is more expensive than idle capacity.

**And release the claim if you abandon it**: unassign yourself and say why in a comment. An
assignee is only a useful signal while it is true, and an agent that walks away silently is exactly
the drift that a status label would have made permanent.

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
- an **Effort** and its `size:*` label,
- **no assignee** — unassigned *is* "available".

Then, for each one:

| Moment | What you do |
|---|---|
| You hand the task to a subagent | **Assign it** (to yourself if the subagent has no identity) |
| The subagent reports back | Nothing yet — **you have not reviewed it** |
| You reviewed and accepted it | Open the PR with `Closes #<sub-issue>` in its body |
| The PR merges | The issue closes **itself**; confirm it did |
| The subagent is stuck outside the task | `blocked` **+ a comment naming the blocker** |
| You abandon the task | **Unassign**, remove `blocked`, say why |

Every row is either a field with one copy or a link GitHub maintains. There is nothing here to
update "at the end", because there is nothing here that can be stale while the underlying fact has
moved on — which is precisely why a `status:*` label is not in this table.

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

**The PR body is what closes the issue, so get it right.** This is the whole closure mechanism now
that there is no status mirror.

- Open the PR into `staging` as **ready for review**, not draft (draft PRs run no CI here).
- Put **`Closes #<issue>`** in the body — one line per issue the PR finishes, including every
  sub-issue it completes. GitHub then links them, shows them on the PR, and closes them **on merge**.
  A PR that says "fixes the thing in #123" without a closing keyword links nothing and closes
  nothing.
- If a PR only *advances* an issue, reference it (`Part of #123`) and do **not** use a closing
  keyword — a closing keyword on partial work closes an issue that is not done.
- After the merge, **verify the issues actually closed**. A closing keyword in a comment rather than
  the PR body does nothing, and a sub-issue nobody named stays open forever. This is a read, not a
  write: if they are open, the PR body was wrong, so close them by hand and say so.
- If part of the scope was left out, say so in the closing comment and open a follow-up issue for
  it. Scaling the work down is the operator's call, not yours — but silently scaling it down is
  nobody's.
- Moving the board card is a **human task**. Do not claim you moved it.

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

## Reading an issue's state

There is no status field to read, so read the four facts that are actually recorded:

| You want to know | Look at |
|---|---|
| Is someone on it? | **Assignee.** Empty means available. |
| Has work started? | **Linked PRs**, shown on the issue by GitHub itself. |
| Is it finished? | **Open or closed.** Closed by a merged PR means done and merged. |
| Is it stuck? | The **`blocked`** label, and the comment beside it saying why. |

Each of those has exactly one copy, and three of the four are maintained by GitHub rather than by an
agent remembering to. That is the entire point: a state an agent has to *remember to update* is a
state that is wrong as soon as the agent stops.

Where an issue sits on the project board is a **human task** and is not authoritative here. If it
disagrees with the issue, the issue is right.

---

## Rules that hold regardless

- **One agent per issue.** The assignee is the claim. Respect it, and release it if you walk away.
- **One number per spec, claimed by a merge.** Not by a branch, not by a draft PR.
- **Branch from `staging`.** Only promotions and declared hotfixes touch `main`.
- **`Closes #N` in the PR body is how an issue closes.** Verify it actually did after the merge.
- **Never introduce a second copy of a state GitHub already keeps.** It will drift, and a drifted
  record is worse than no record — it is read with the same confidence as a true one.
- **A subagent's report is a claim.** Review the diff and run the gates before accepting.
- **Never close a sub-issue for work you have not seen merged.**
- **Say what you did not do.** A closed issue with unfinished scope and no follow-up is the one
  outcome that costs more than not starting.

---

## Setup

Only one thing, and it is optional:

**Labels** — merge `.github/labels.json` to `main` or `staging`, or run the *Sync Coordination
Labels* workflow manually. `GITHUB_TOKEN` is sufficient; no PAT, no secret, no variable. Applying a
label that does not exist yet works anyway — GitHub creates it, grey and undescribed — so an agent
is never blocked on this; the sync is what gives each label its colour and its description.

**There is nothing else to configure**, and that is deliberate. An earlier draft of this feature
also shipped a `status:*` label set and a workflow that mirrored it onto the project board's Status
field, which needed a repo variable and a fine-grained PAT. It was removed: a mirror is a second
copy of state the repository already holds, it drifts the moment an agent stops mid-task, and the
board would then show the wrong answer with full confidence. Board columns are moved by a human.

---

## See also

- [`.specify/memory/constitution.md`](../../.specify/memory/constitution.md) — the standards every plan checks against
- [Contributing](contributing.md) — branch model, PR process
- [Release and promotion](../runbooks/release-and-promotion.md) — `staging` → `main`
- [E2E testing policy](e2e-testing-policy.md) — why a new spec needs a coverage-matrix row
- `monorepo-verify` skill — which gate proves what, before you accept a subagent's work
