# One Action, One Role: Access Control That the Admin Console Actually Reflects

*How FairWins maps every privileged action to exactly one permission — and makes the operator dashboard prove it*

| | |
|---|---|
| **Series** | Identity & Access (part 1) |
| **Part** | 1 of 34 |
| **Audience** | Product managers, technical founders, junior engineers, the crypto-curious |
| **Tags** | `access-control`, `permissions`, `admin-tools`, `security` |
| **Reading time** | ~6 minutes |

## The compliance officer who couldn't reach her own tool

Picture a compliance officer at a wagering platform. Her job is narrow and serious: when an address needs to be blocked from the protocol, she adds it to a block-list, and the reason is recorded permanently on the blockchain. The system was built for exactly this. She holds one specific permission — the one that lets her edit the block-list — and nothing more. She cannot pause the platform, cannot touch the treasury, cannot freeze anyone's account.

Then she opens the admin panel, and the block-list tab isn't there.

This was a real gap FairWins found while auditing its own controls. The permission existed on the blockchain, and her account held it. But the admin dashboard had never been taught that this permission existed, so it hid the block-list behind the top-level "full administrator" permission instead. The underlying security was correct — and completely useless in practice. To do her narrow job, she would have needed to be handed the keys to everything, which is precisely the over-reach the narrow permission was designed to prevent.

The lesson generalizes. Access control isn't only a smart-contract problem. A permission that exists on-chain but not in the operator's screen creates quiet pressure to over-grant, and over-granting is how "least privilege" — the principle that every account should hold the minimum power it needs — dies in real life. This post walks through both halves of FairWins' answer: the on-chain discipline of "one action, one role," and the admin console built to mirror it, screen by screen.

## The permission inventory: one paid role, six operator roles

FairWins is a peer-to-peer wager platform. Smart contracts hold each side's stake in escrow and settle the bet against a trusted outside source of truth. Its permission model is deliberately small: **one permission that members buy, and six that operators hold.** All of them use a plain, well-audited access-control library from OpenZeppelin, an industry-standard toolkit for smart contracts — nothing exotic, nothing homegrown.

The paid one lets a member create and accept wagers; members buy it as a time-limited membership tier, and it's the subject of part 2 in this series. The other six are the operator permissions, and each maps to a single, clearly bounded job:

- **Full administrator** — protocol wiring, tier pricing, treasury withdrawals, and handing out or revoking the other permissions.
- **Guardian** — can pause and un-pause the whole platform in an emergency. Nothing else.
- **Account moderator** — can freeze and unfreeze an individual account. Cannot pause the platform.
- **Membership manager** — can grant or revoke memberships directly. Cannot touch admin permissions.
- **Sanctions admin** — can edit the compliance block-list. This is the compliance officer's role.
- **Upgrader** — can ship new versions of the upgradeable contracts. Cannot grant itself anything.

A handful of narrower, single-purpose permissions exist for individual subsystems — issuing tokens, setting fees, curating the naming registry — but they follow the exact same pattern, each scoped to one job.

## One action, one role

The discipline that holds the whole model together is simple to state: **every privileged action is guarded by exactly one permission.** Not "admin or guardian." Not a points system where enough small permissions add up to a big one. One gate per door.

Pausing the platform requires the guardian permission, full stop. Freezing an account requires the account-moderator permission, full stop. Changing pricing or protocol wiring requires the full-administrator permission. There's one instructive exception that actually proves the rule: swapping out a piece of the wager engine's code is treated as an upgrade — because it changes what code runs — so it requires the *upgrader* permission rather than the administrator one. The gate matches the true weight of the action.

The upgrader permission is kept separate from the top administrator permission on purpose. It can later be reassigned to a time-locked multi-signature wallet without changing any code, and the ability to perform future upgrades is wired in permanently, so an upgrade can never accidentally strip away the platform's own ability to be upgraded again.

### The negative space matters as much

FairWins keeps a table of what each role explicitly **cannot** do, and that table earns its keep. A guardian can stop the whole platform but cannot seize an account. A moderator can freeze an account but cannot pause the platform or move money. A membership manager can hand out memberships but cannot revoke anyone's admin powers. The compliance officer can block an address and do nothing else. Even the full administrator has hard limits baked into the code: it cannot create wagers on someone's behalf, cannot decide who wins, and cannot move staked funds — there is simply no button for any of those, because no such function was ever written.

When you design a permission, write its "cannot" list first. It tells you whether the role is genuinely narrow or just labeled that way.

## The control plane: permissions flow from the contract to the screen

The operator side is a single admin console, reorganized after that audit into clear groups: a control room, incident response, compliance, membership and revenue, protocol config, identity, access control, and infrastructure.

The core rule of the interface mirrors the core rule of the contracts: **each screen is shown only to operators who hold the on-chain permission its actions require, and a group of screens appears only if the operator can actually use at least one screen inside it.** The dashboard calculates permissions the exact same way the contracts do and checks them against the live blockchain, so what an operator sees is a faithful picture of what they can actually do.

A guardian signing in sees the control room, incident response, and infrastructure — nothing else. The compliance officer from the opening now sees the control room and compliance. Crucially, the dashboard isn't *enforcing* security — the contracts do that, and they can't be fooled by a hidden or shown button. The dashboard's job is to make the permission set *legible*, so nobody is ever tempted to over-grant a big role just to make a screen appear.

One subtlety the console gets right: different permissions live on different contracts, so when an operator grants a permission, the request has to be routed to the specific contract that defines it — not blanket-sent to one place and hoped for the best.

## Design decisions

**Why a plain, boring access-control library?** Standard, audited permission checks are understood by every reviewer and every tool in the ecosystem. The "one action, one role" discipline delivers most of what elaborate custom permission systems promise, without introducing a new thing that can break or be attacked. The cost is granularity: withdrawing fees currently requires the full administrator permission, and splitting out a dedicated "treasurer" would take a contract upgrade — a noted future option, not a quick setting.

**Why gate the UI on permissions at all, if the contracts already enforce them?** Because the failure mode of a permission-blind dashboard isn't a break-in — it's privilege creep. The gap that started this story showed that when the interface doesn't know about a permission, operators get handed a bigger one to compensate. Modeling every permission in the console is what keeps the on-chain least-privilege design honest in day-to-day operations.

**What deliberately stays off the console.** Two things are excluded by policy, not by accident. Anything touching the most sensitive keys — the ones that authorize upgrades — stays on offline, air-gapped, scripted paths that never touch a web form. And the optional relay service that can sponsor gasless transactions has no remote admin controls at all, on purpose: an internet-facing kill switch would be a brand-new attack surface, and the relay's worst case is designed to be "refuses to help," never "loses funds." The console shows the state of both, read-only, and links to the written procedures.

**Not everything needs a permission.** Routine housekeeping — sweeping up expired wagers, settling ones whose outcome is already known — is open to anyone by design, so those screens are open to any operator. And some contracts have no admin controls whatsoever: no permission can drain or redirect their funds because no function to do so exists. The strongest access control is the door you never build.

## Further reading

- OpenZeppelin Access Control — the standard permission library described here: https://docs.openzeppelin.com/contracts/5.x/access-control
- OpenZeppelin Proxies and upgradeable contracts: https://docs.openzeppelin.com/contracts/5.x/api/proxy
- The principle of least privilege (background concept): https://en.wikipedia.org/wiki/Principle_of_least_privilege
