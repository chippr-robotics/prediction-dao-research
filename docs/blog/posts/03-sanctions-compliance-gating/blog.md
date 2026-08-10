# Sanctions Screening as a Shared Building Block: One Guard, Every Money Path

*Why FairWins moved compliance out of the frontend and into a single, fail-closed on-chain gate — and how the same small piece of code protects wagers, pools, memberships, and token issuance*

---

> **Important note.** This article describes prediction markets based on publicly available information and legitimate forecasting. Nothing here is a mechanism for trading on material non-public information or circumventing securities regulations. All participants remain fully subject to applicable laws, compliance requirements, and fiduciary obligations.

---

| | |
|---|---|
| **Series** | Identity & Access, part 3 |
| **Audience** | Compliance-minded founders, product managers, junior engineers |
| **Tags** | `compliance`, `sanctions`, `fail-closed`, `security` |
| **Reading time** | ~7 minutes |

## The check that wasn't there

Picture the code review. Your team ships wallet screening for a peer-to-peer wager platform: when a user connects, the website checks their address against a sanctions list, and if the address is listed, the interface refuses to proceed. The compliance box is ticked. The demo looks great.

A week later, someone on the security review asks the obvious question: *what happens if a sanctioned address never opens your website?* The contracts live on a public blockchain. Anyone with a script can call them directly, bypassing your site entirely. Your screening layer — the one your Terms of Service describe as a control — turns out to be a polite suggestion.

This is the trap that catches most "compliance-aware" crypto apps. Sanctions exposure under US law is *strict liability*: it doesn't matter that you *intended* to block the address, or that your interface *would have* blocked it. If your contract accepted money from a listed address, the violation happened. A check that lives only in the website is not a control; it's theater with good intentions.

FairWins' answer is to treat sanctions screening the way a careful team treats any core safety check: as a shared building block baked into the contracts themselves. One small, shared piece of code — call it **the sanctions guard** — is consulted by every entry point on the platform where money moves. The website still checks first, for fast feedback and to avoid wasting anyone's gas, but the layer that actually *enforces* is the one nobody can route around.

## The guard itself

The guard is deliberately tiny: about a hundred lines, holds no funds, and can't be upgraded. It combines two lists into a single yes-or-no verdict:

1. **A public sanctions oracle maintained by Chainalysis** — an on-chain service that answers, for any address, whether it appears on the US Treasury's sanctions list.
2. **A discretionary block-list the operator maintains** — a simple list for addresses tied to illicit finance beyond the official set, editable only by the holder of the narrow compliance permission described in part 1 of this series.

Consumers get two ways to ask the guard a question. One returns a plain yes-or-no, for callers that want to branch on it — that's what the website's advisory check uses. The other simply stops the transaction cold if the address is blocked, which is the form the contracts use, because refusing to let a transaction complete is the cheapest and safest way to make sure a forbidden action never happens.

The block-list editing has one nice property worth calling out: every change records who made it, which address was affected, in which direction, and a human-readable reason — all written permanently to the blockchain. So the block-list's entire history is a built-in audit trail. There's no separate off-chain compliance database to subpoena or lose; the on-chain event log *is* the record. And the keys that can edit those lists follow the platform's air-gapped, offline signing process, so no change happens casually.

## Fail-closed, for real

The interesting engineering is in how the guard talks to the outside sanctions oracle. The naive version — just call the oracle and wrap it in a try/catch — has a sharp edge. If the oracle address is misconfigured, pointing at nothing or at the wrong network, that kind of failure isn't reliably caught, and the system can silently start treating everyone as clean.

So the guard makes the query in a careful, low-level way that gives it full control over every possible failure: the oracle reverts, runs out of gas, returns nothing, or returns garbage. Anything short of a clean, well-formed "yes" or "no" is treated as *the oracle gave no usable answer* — and in that case the guard blocks **every** address. The rule is stated plainly in the platform's requirements: if the screening source is unavailable, refuse the action rather than allow it unscreened. This is what "fail-closed" means — when in doubt, deny.

There's exactly one deliberate exception, and it's a *configuration*, not a failure. Setting the oracle to "none" means *block-list-only enforcement* — the intended posture for networks where Chainalysis simply doesn't operate. Test networks get a stand-in; production gets the real oracle address injected at deployment, never hardcoded. The distinction is precise: a **configured but broken** oracle blocks everyone, while an **intentionally unset** oracle blocks only the block-list. Confusing those two states is exactly how fail-closed systems quietly turn fail-open.

## One guard, four subsystems

What makes this a reusable *building block* rather than a one-off feature is that the same guard protects four independent parts of the platform in the same way:

**Wagers.** Every escrow entry point screens first. Creating a wager screens the creator. Accepting one screens *both* sides — the person accepting and the original creator — because acceptance is the moment the second stake enters escrow, and the creator might have been added to a sanctions list since they first posted the wager. Screen at every entry, every time.

**Memberships.** Buying, upgrading, extending, or redeeming a voucher into a membership all screen the person before any USDC moves. Even the admin-only path that grants a membership directly screens the recipient — the guard can't be bypassed *even by operators*, so a permission-holder can't accidentally hand access to a listed address.

**Wager pools.** Group pools screen creators and joiners through the same guard, with one extra safeguard worth stealing: on production networks the pool factory *refuses to run at all* if screening is supposed to be on but no guard is configured. The "unset means off" convenience that's fine on a laptop becomes an impossible, boot-blocking state in production.

**Token issuance and naming.** Issuing a token screens the issuer and passes the same guard into every token it creates. The naming registry checks the guard before letting anyone claim a name.

Each of these holds its own pointer to the guard, so the guard can be swapped out without touching any of them — and a single block-list update propagates instantly to all four. One list, one place to edit it, one event stream, four enforcement points.

## What is deliberately *not* screened

Here's the design decision most teams get backwards: the exit paths — claiming a refund, claiming a payout, sweeping up expired wagers — are **not** screened.

The reasoning matters. If an address is added to the block-list *after* their stake is already sitting in escrow, screening the exit would permanently trap their funds inside your contract. That turns a screening control into an *asset freeze* — a much heavier and legally distinct act than simply refusing new business, and one that effectively makes your escrow contract a custodian of blocked property. FairWins draws the line cleanly: a listed address can take no *new* action that moves value in, but can always recover what's already theirs. **The guard gates entry, never exit.**

## Trade-offs

**A little gas on every entry.** Each screened action pays for an extra cross-contract call, plus a second one into the oracle when it's set. That's real overhead on the busy path. The team judged it worth it, because the alternative — screening only once, at membership time — leaves a gap: an address listed mid-membership could keep wagering until renewal. Re-screening at every entry closes it.

**Trusting an outside oracle.** The Chainalysis oracle is a centralized, permissioned data source, and FairWins takes its answers as ground truth. The safeguards are structural rather than trustless: the guard only ever *reads* from it, it can be swapped out if it's ever compromised or retired, and the discretionary block-list keeps working even with the oracle unset. This is an honest trade — no decentralized sanctions feed exists, and pretending otherwise helps no one.

**Fail-closed can mean downtime.** If the oracle ever broke for everyone, every screened entry point would halt until an operator re-pointed or unset it. That's the accepted cost of failing closed: a brief outage is recoverable; a strict-liability violation is not.

**Defense in depth, not defense in one place.** The on-chain guard is one layer of several: an edge network geo-gate that blocks restricted regions before a request even reaches the app, the website's fast advisory check, versioned legal documents, and on-chain records of user consent. The guard is the layer that holds *when every other layer is skipped* — because on a public blockchain, one of them always can be.

## Further reading

- Chainalysis on-chain sanctions oracle documentation: https://go.chainalysis.com/chainalysis-oracle-docs.html
- The US Treasury OFAC sanctions list: https://ofac.treasury.gov/sanctions-list-service
- OpenZeppelin Access Control, the permission library behind the block-list roles: https://docs.openzeppelin.com/contracts/5.x/access-control
- RFC 7725, the "HTTP 451 Unavailable For Legal Reasons" standard used by the geo-gate: https://www.rfc-editor.org/rfc/rfc7725
