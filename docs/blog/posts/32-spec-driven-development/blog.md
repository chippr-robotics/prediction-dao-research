# Write It Down First: Shipping Money Software Repeatably When AI Agents Do the Building

*How FairWins keeps its fiftieth feature as safe as its first — by making the standards a gate the work has to pass through, not a document people are supposed to remember.*

| | |
|---|---|
| **Series** | Security & DevOps |
| **Audience** | Founders, product leaders, and anyone managing AI coding agents |
| **Tags** | `process`, `ai-agents`, `spec-first`, `quality` |
| **Reading time** | ~7 minutes |

---

## The problem with "just tell the agent what you want"

An AI coding agent will happily write you a smart contract in one shot. It will look plausible. It will compile. It might even pass a couple of tests the agent invents along the way. And then that contract will custody real user funds on a public network, where a single missed safety check is a permanent, exploitable mistake that anyone in the world can find and nobody can quietly patch out.

FairWins is a peer-to-peer wager platform. Under the hood it is smart contracts that hold people's stakes and pay out winners, a web app that non-technical people trust with their money, and supporting services that make transactions cheap and searchable. It has grown to dozens of distinct features, and a lot of them touch funds, permissions, or the way outcomes get resolved — exactly the places where "describe it and let the agent cook" fails quietly and expensively.

The interesting question was never *can an agent build this feature?* It was: *how do you ship the fiftieth feature to the same standard as the first, when humans and agents are both writing them, and the codebase is already too big for any one person to hold in their head?*

The answer is not more heroics from senior reviewers. It is process, made executable — writing down *what* and *why* before anyone builds, holding every plan to a shared set of standards, and letting the AI agents do the work inside those guardrails. FairWins builds this on top of an open-source framework (linked at the end), but the ideas travel to any team.

## The core move: describe before you build

The heart of the method is a sequence of small, named steps that turn "build a feature" into a series of reviewable documents instead of one long chat that vanishes when you close the window.

It works roughly like this:

1. **Write down the standards** — the non-negotiables every feature must meet (more on this below).
2. **Specify the what and why** — user stories and acceptance criteria, deliberately with *no* technology choices yet.
3. **Clarify** — ask a handful of sharp questions to kill ambiguity before any design starts.
4. **Plan** — now, and only now, decide *how* to build it.
5. **Break it into tasks** — an ordered, checkable list of concrete work.
6. **Cross-check** — make sure the spec, the plan, and the tasks actually agree with each other.
7. **Build** — execute the tasks.

The separation is the entire point. Forcing the specification to describe *behavior* before anyone names a tool or a library keeps the "what" honest — you cannot smuggle a design decision inside a requirement. And each step leaves behind a document that outlives the conversation: the same artifact the builder reads to do the work is the record a reviewer reads to check it. That is not documentation written after the fact. It is the input to the work.

## The standards are a gate, not a README

Every team has a document somewhere listing its engineering standards. Almost everywhere, that document is advisory — a wish list people are supposed to remember, which is to say the thing that gets quietly skipped the week a deadline looms. That is precisely the week a fund-custody bug ships.

FairWins does something different. It keeps a short, binding set of standards — think of it as a project constitution — and it wires that constitution directly into the pipeline. It opens by declaring itself binding: when the standards conflict with convenience, the standards win. And it covers the things that actually matter for software holding money:

- **Security first.** Money-handling contracts follow strict ordering rules, guard against known attack classes, and get a dedicated security review before they can merge.
- **Tests prove behavior.** A feature isn't "done" until tests demonstrate it works — *including* the failure cases: what happens when a claim is invalid, a refund is due, a deadline passes.
- **No fakery in shipped code.** No stubbed-out responses standing in for the real thing; the interface never implies a transaction is final before the blockchain says it is.
- **Fail loudly.** Automated checks are never allowed to be configured to pass-on-failure.
- **Accessible and consistent** front-end, held to recognized accessibility standards.

Here is the mechanism that makes it more than a wish list: **every plan has to open by checking itself against those standards, and it cannot proceed to the building stage until that check passes.** For each standard, the plan states how it complies — in concrete terms, not hand-waving. If a design has to *violate* a standard, that deviation must be written down explicitly, alongside why it is necessary and why the simpler alternative was rejected. An empty deviations list is the happy path. A non-empty one is a design smell you have to argue for in writing — *before* you write code, not in a post-mortem afterward.

That is the difference between "we should probably..." and "we cannot proceed until...". The friction is deliberate, and it lands exactly on the highest-risk work.

## AI agents in the loop, bounded by documents

FairWins is built *with* agents, not just *for* them — and the write-it-down-first method is what makes that safe rather than reckless.

An agent asked to build a feature doesn't improvise from a one-line prompt. It reads the specification for the requirements, the plan for the design and its standards-check, and the task list for the ordered work — the very same documents a human builder would read. The agent's freedom is bounded by documents a human already reviewed and approved.

And the human approvals are built into the flow, not bolted on. There is a required human sign-off after the specification is written, and another after the plan is designed. Reject either one and the run stops. So the expensive, hard-to-reverse decisions — *what are we building* and *how* — always get human judgment before a single line of contract code exists. Agents even participate in the *review*: every change to the money-handling code gets checked by a dedicated security-review agent before it can merge. Humans set the standards; the tooling makes them impossible to quietly ignore.

## Why go to all this trouble

**Why such a heavyweight process for a fast-moving crypto project?** The cost is real — several stages, several documents, two human gates per feature. The payoff is that the *variance* between the first feature and the fiftieth collapses. When the standard lives in a gate rather than in a reviewer's memory, it applies the same whether the author is a senior engineer or an agent on its third attempt at 2 a.m.

**Why make the standards binding rather than advisory?** Because advisory standards degrade under deadline pressure, and deadline pressure is exactly when the dangerous bug ships. Turning the standards-check into a precondition converts good intentions into a hard stop.

**What the process deliberately does not do.** It does not, by itself, verify that the code is *correct* — a plan can pass every check and still be wrong. That is why the standards *also* mandate real tests, automated security scanning, a security review, and loud-failing checks. The write-it-down method is the scaffolding that guarantees those safeguards get built into every feature; the safeguards themselves are what catch the bugs. The lightest steps stay optional, and genuinely trivial changes can skip ahead — but nothing touching funds, permissions, or how outcomes resolve is ever allowed to skip the specification.

The result is a codebase where "build with AI agents" and "handle people's money safely" stop being in tension. The process is the thing that reconciles them.

## Further reading

- [Spec Kit](https://github.com/github/spec-kit) — the open-source spec-driven development framework this workflow is built on
- A general primer on the idea of a [software specification](https://en.wikipedia.org/wiki/Software_requirements_specification)
- The [Web Content Accessibility Guidelines (WCAG)](https://www.w3.org/WAI/standards-guidelines/wcag/), the accessibility standard referenced above
- The [EthTrust Security Levels](https://entethalliance.org/) for smart contract assurance
