# Sixty-Three Features, One Constitution: Spec-Driven Development on a Money Contract

*How FairWins ships complex, security-critical crypto features repeatably — with coding agents in the loop and a binding constitution every plan must pass*

| | |
|---|---|
| **Series** | Security & DevOps (part 4) |
| **Audience** | Engineering leaders, agent/tooling developers |
| **Tags** | `spec-driven-development`, `spec-kit`, `process`, `ai-agents` |
| **Reading time** | ~9 minutes |

---

## The problem with "just prompt the agent"

A coding agent will happily write you a fee-charging smart contract in one shot. It will look plausible. It will compile. It might even pass a couple of tests the agent invents on the way. And then it will custody user funds on a public network where a single missed `nonReentrant` modifier, an inverted rounding direction, or a fee cap checked at write-time-but-not-charge-time is a permanent, on-chain, adversarially-exploitable mistake.

The FairWins repository is a peer-to-peer wager platform: Solidity contracts that escrow stakes and resolve them against external oracles, a React frontend that is the trust surface for non-technical users, a relay gateway for gasless flows, and a subgraph for indexing. At the time of writing it holds **63 feature specifications** under `specs/`, numbered through `061-bitcoin-transactions`. Many of them touch funds, access control, or oracle resolution — exactly the surfaces where an unstructured "describe it and let the agent cook" workflow fails quietly and expensively.

The interesting question isn't *can an agent write this feature?* It's *how do you ship the sixtieth feature to the same standard as the first, when a mix of humans and agents are writing them, and the codebase is already large enough that no one holds all of it in their head?*

FairWins' answer is process, made executable. The repo runs on [GitHub's Spec Kit](https://github.com/github/spec-kit) with a project constitution that no plan is allowed to skip.

## The pipeline: constitution → specify → clarify → plan → tasks → analyze → implement

Spec Kit turns "build a feature" into a sequence of named, reviewable artifacts rather than a single conversation. Each stage is a `/speckit-*` skill the agent invokes, and each produces a file that outlives the chat:

1. **`/speckit-constitution`** — establish or amend the binding standards.
2. **`/speckit-specify`** — capture *what* and *why*, with **no technology choices yet**.
3. **`/speckit-clarify`** — ask up to five targeted questions to kill ambiguity before design (optional).
4. **`/speckit-plan`** — design the implementation against the chosen stack.
5. **`/speckit-tasks`** — break the plan into ordered, actionable tasks.
6. **`/speckit-analyze`** — cross-check spec, plan, and tasks for consistency (optional).
7. **`/speckit-implement`** — execute the tasks.

The separation is the point. Forcing the spec to describe behavior *before* anyone names a contract or a library keeps the "what" honest — you can't hide a design decision inside a requirement. A representative feature directory shows the full paper trail:

```text
specs/060-platform-fee-wrapper/
├── spec.md          # what & why: user stories, acceptance scenarios, FRs
├── plan.md          # how: technical context + constitution check
├── research.md      # decision log for the plan
├── data-model.md    # entities and state
├── quickstart.md    # phase-1 design output
├── contracts/       # interface sketches
├── checklists/      # generated review checklists
└── tasks.md         # ordered, dependency-aware task list
```

That is not documentation written after the fact. It is the input the implementing agent (or engineer) reads to do the work, and the record a reviewer reads to check it.

## The constitution is a gate, not a README

The reason this scales past a handful of features is `.specify/memory/constitution.md` — a versioned document (currently `1.0.0`, ratified 2026-06-05) that opens by declaring itself binding: *"When guidance here conflicts with convenience, this document wins."* It codifies five principles, two of them marked **NON-NEGOTIABLE**:

- **I. Security-First Smart Contracts** — checks-effects-interactions, reentrancy and overflow guards, EthTrust Security Level L2 targets for new value-bearing contracts, and a mandatory review against `.github/agents/smart-contract-security.agent.md` before merge. Static analysis (Slither) and, for stateful logic, fuzzing (Medusa) must pass with no new high/critical findings.
- **II. Test-First and Comprehensive Coverage** — behavior isn't "done" until tests prove it; resolution, claim, refund, and timeout paths must be tested *including their failure cases*.
- **III. Honest State, No Mocks in Shipped Paths** — no stubbed responses or placeholder finality in production; the UI never implies a finality the chain hasn't reached.
- **IV. Fail Loudly in CI** — `continue-on-error: true` is forbidden on lint, type-check, build, and test steps.
- **V. Accessible, Consistent Frontend** — WCAG 2.1 AA, axe/Lighthouse in CI, no hand-copied contract addresses.

What makes this more than a wish list is where it plugs into the pipeline. **Every `plan.md` begins with a Constitution Check that must pass before design proceeds.** In the fee-router feature that check is a table mapping each principle to a status and the concrete reasoning for it — for the security principle:

```text
| I. Security-first contracts | PASS (design gate) | FeeRouter is value-bearing
  (custodies funds transiently within one tx). CEI + `nonReentrant` on
  depositToVaultWithFee; SafeERC20 everywhere; caps enforced in the setter AND
  re-checked at charge time; maxFeeBps protects members from admin front-running;
  role-gated setters; Slither + security-agent review before merge. |
```

The plan template (`.specify/templates/plan-template.md`) also carries a **Complexity Tracking** section that exists solely to catch deviations: if a design violates a principle, it must be listed here with *why it's needed* and *why the simpler alternative was rejected*. An empty Complexity Tracking table is the happy path. A non-empty one is a design smell you have to argue for in writing — before you write code, not in a post-mortem.

## Tasks that encode test-first and parallelism

`/speckit-tasks` turns the approved plan into `tasks.md`: a phased, checkbox-tracked list where the constitution's rules are visible in the structure itself. The fee-router tasks open by declaring the test posture, then order the work so foundations block stories:

```text
**Tests**: Included — the constitution makes test-first non-negotiable (Principle II).

## Phase 2: Foundational (blocking all stories)
- [X] T003 contracts/fees/FeeRouter.sol — UUPS via UUPSManaged; append-only
      storage; atomic depositToVaultWithFee (nonReentrant, CEI, maxFeeBps consent)
- [X] T004 test/feeRouter.test.js — fee math incl. floor-to-zero, cap enforcement,
      maxFeeBps revert, atomic revert, role gating, events
- [X] T006 [P] test/upgradeable/FeeRouter.upgrade.test.js + register in
      scripts/deploy/check-storage-layout.js
```

Two details do a lot of work. `[X]` gives implementers and reviewers a shared, resumable state — an agent picking up the feature mid-stream knows exactly what's left. `[P]` marks tasks that touch disjoint files and can run in parallel, which matters when you fan work out to multiple agents. And the *ordering* is a policy: the contract and its tests land together (Principle II), storage-layout verification is registered in the same phase because these are UUPS proxies where a reordered storage slot corrupts live state.

## Coding agents in the loop — bounded by artifacts

FairWins is built with agents, not just for them, and Spec Kit is what keeps that safe. An agent asked to "implement spec 060" doesn't improvise; it reads `spec.md` for the requirements, `plan.md` for the design and its constitution check, and `tasks.md` for the ordered work — the same artifacts a human implementer would. The agent's freedom is bounded by documents a human already reviewed and approved.

The review gates are literally encoded. The Spec Kit workflow definition (`.specify/workflows/speckit/workflow.yml`) inserts human approval between machine stages:

```yaml
- id: review-plan
  type: gate
  message: "Review the plan before generating tasks."
  options: [approve, reject]
  on_reject: abort
```

There is one such gate after the spec and another after the plan. A rejected gate aborts the run. So the expensive, hard-to-reverse decisions — *what are we building* and *how* — get a human sign-off before any task is generated or a line of Solidity is written.

Agents also participate in review, not just authoring. The constitution requires every `contracts/` change to be reviewed against `.github/agents/smart-contract-security.agent.md` — a dedicated security-review agent — before merge. And the repo keeps its own agent context honest: the `speckit-agent-context-update` extension (`.specify/extensions/agent-context/scripts/bash/update-agent-context.sh`) regenerates the managed Spec Kit section of `CLAUDE.md` so the guidance every agent reads at the start of a session stays in sync with the specs. The humans set the standards; the tooling makes them impossible to quietly ignore.

## Design decisions and trade-offs

**Why a heavyweight process for a fast-moving crypto project?** The cost of the pipeline is real: seven stages, several artifacts, two human gates per feature. The payoff is that the *variance* between the first feature and the sixty-third collapses. When the standard lives in a gate rather than a reviewer's memory, it applies whether the author is a senior engineer or an agent on its third attempt.

**Why make the constitution binding rather than advisory?** Advisory standards degrade under deadline pressure — that's precisely when a fund-custody bug ships. By making the Constitution Check a precondition of the plan and forcing violations into an explicit Complexity Tracking table, the process converts "we should probably..." into "we cannot proceed until...". The friction is deliberate and lands on the highest-risk paths.

**What the process doesn't do.** It doesn't verify correctness — a plan can pass the Constitution Check and still be wrong. That's why the constitution *also* mandates test-first coverage, Slither, Medusa, a security-agent review, and fail-loud CI. Spec Kit is the scaffolding that makes sure those gates get built into every feature; the gates themselves are what catch the bugs. The lightweight stages (`clarify`, `analyze`) are marked optional, and the constitution permits skipping steps for genuinely trivial changes — but *never* skipping the spec for anything touching funds, access control, or oracle resolution.

The result is a codebase where "build with agents" and "handle user money safely" aren't in tension. The process is the thing that reconciles them.

## Sources

- `CLAUDE.md` — Spec Kit workflow section and repository guardrails
- `.specify/memory/constitution.md` — the binding standards (v1.0.0)
- `.specify/templates/plan-template.md`, `.specify/templates/spec-template.md`, `.specify/templates/tasks-template.md` — the artifact templates
- `.specify/workflows/speckit/workflow.yml` — pipeline steps and human review gates
- `.specify/extensions/agent-context/scripts/bash/update-agent-context.sh` — managed agent-context refresh
- `specs/060-platform-fee-wrapper/{spec,plan,tasks}.md` — representative feature artifacts (Constitution Check, phased tasks)
- `.github/agents/smart-contract-security.agent.md` — the security-review agent
- `package.json` — `compile`, `test`, `check:storage-layout`, `test:fork`, `test:coverage` scripts
- GitHub Spec Kit — https://github.com/github/spec-kit
- EthTrust Security Levels — https://entethalliance.org/
