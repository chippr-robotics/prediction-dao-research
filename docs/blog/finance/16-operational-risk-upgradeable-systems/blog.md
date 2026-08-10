# Who Can Change the Rules: Operational Risk in Upgradeable Systems

*Change-management, key governance, and the trade-off between immutability and the ability to fix — read as operational and governance risk*

| | |
|---|---|
| **Series** | Finance Professional Series |
| **Track** | Compliance, Disclosure & Governance |
| **Level** | Advanced |
| **Audience** | Risk managers, operations and compliance leads, allocators conducting operational due diligence |
| **Tags** | `operational-risk`, `governance`, `change-management`, `key-management`, `upgradeability` |
| **Reading time** | ~9 minutes |

---

You are running operational due diligence on a platform that holds client value in a set of smart contracts. The investment thesis is fine. Your job is the boring, decisive part: **who can change the rules after you have committed capital, by what process, and what stops them from doing it badly?** In a traditional operational-risk review this is familiar terrain — you would ask about the change-advisory board, segregation of duties, the four-eyes principle on production releases, privileged-access management, and the vendor's SOC 2 report. On-chain, the same questions have sharper, more literal answers, because "change the rules" can mean "replace the exact code that holds the escrow." This briefing maps that terrain in the vocabulary you already use.

## The traditional model

In a conventional financial system, the ledger and the software that runs it are two different things, and both are mutable. Balances are database rows an administrator with sufficient privilege can edit. The code is deployed and re-deployed on a release cadence. Control does not come from the technology being unchangeable — it comes from **layered process**: a change-advisory board that approves releases, separation between the person who writes a change and the person who deploys it, immutable audit logs, privileged-access management with break-glass procedures, and an external auditor who tests that those controls actually operated over a period (the substance of a SOC 2 Type II report). The risk you are underwriting is process risk: that a privileged insider, or someone who compromised a privileged credential, pushes a harmful change and the controls fail to catch it.

## What changes on-chain

Two things invert. First, the ledger becomes genuinely immutable — no administrator can edit a balance or reverse a settled transaction. That removes a whole category of insider risk at the record-keeping layer. Second, the *code* was historically immutable too, which sounds like a control paradise until you need to fix a bug. A contract you cannot change is a contract you cannot patch: a discovered flaw is permanent, and the only "fix" is to deploy a brand-new contract at a new address and somehow migrate everyone — abandoning the old one, which is still sitting there holding real money.

So most serious platforms adopt **upgradeability**: a permanent public address (a "proxy") that never changes, sitting in front of swappable logic behind it. The address your users, your app, and the block explorer all reference stays fixed; the code executing behind it can be replaced. This is the single most important governance fact about any such system, and it is where your due-diligence attention belongs. Immutability at the record layer is a genuine improvement over an editable database. Mutability at the *code* layer reintroduces exactly the insider/change-management risk you know from TradFi — now concentrated into a specific, auditable question: **who holds the upgrade key, and what governs its use?**

## Where it genuinely differs

Three differences are worth stating honestly — some better, some worse, some just different.

**Better: the powers are enumerable and the record is public.** In a bank you infer the control environment from an auditor's attestation. On-chain, the privileged roles are declared in the code and every use of them emits a public, timestamped event anyone can inspect forever. You are not taking the operator's word that a pause happened or that the treasury address changed — the chain is the log, and it cannot be quietly rewritten. That is a stronger evidentiary position than most operational-risk reviewers ever get.

**Worse (or at least starker): key compromise is more consequential and less reversible.** If the credential controlling upgrades is stolen, an attacker can replace the logic that holds the escrow, and there is no clearing house, no chargeback, no regulator to unwind the trade. The blast radius of a single compromised privileged key is larger and the recovery options are thinner than in a system with settlement finality you can litigate. This is the central operational risk of any upgradeable on-chain system, and no amount of clever architecture eliminates it — it can only be *bounded* and *governed*.

**Different: "immutable" and "upgradeable" are opposite promises, chosen deliberately per component.** A well-run platform does not treat this as one global switch. Some components are intentionally left un-upgradeable because permanence is the feature; others are made upgradeable because the ability to ship a security fix outweighs the promise of frozen code. Expect the operator to tell you, component by component, which choice they made and why.

## Risk & controls: what a professional should check

Read an upgradeable system the way you would read a privileged-access and change-management review. The controls that matter:

**Segregation of duties across roles.** The mature pattern splits privileged power into several narrow roles so no single key carries blanket authority. In FairWins' case, for example, the ability to *pause* new activity in an incident, the ability to *freeze* an individual account under a moderation policy, the ability to *grant memberships*, the ability to *configure parameters* (prices, allowed tokens, the treasury address), and the ability to *replace contract logic* are five different roles held by different custodians. A guardian can halt the protocol but cannot seize an account; a moderator can freeze an account but cannot move funds or ship code; the upgrade key can ship code but holds no other privilege. This is the on-chain form of the four-eyes principle and least-privilege access — and critically, **no role can move escrowed stakes or redirect a payout.** That last constraint is the one to verify hardest: privileged power over *policy* is very different from privileged power over *client money*.

**Key custody and signing discipline.** Ask where each key lives. The strong answer separates day-to-day configuration keys from the upgrade key, and holds the upgrade key on air-gapped, offline storage with multi-signature approval — the equivalent of requiring multiple officers and a hardware security module for a production release, not a single admin with a password. A single-signer hot key controlling upgrades is a red flag.

**Change-safety gating.** The most dangerous upgrade error is not malice — it is a botched release that silently corrupts stored records (imagine a code change that shifts where balances are read from). The control is an automated compatibility check that runs before any upgrade can be merged *and* again at the moment of deployment, rejecting any change that would rearrange existing storage. This is your automated change-advisory gate; confirm it exists, that it is mandatory rather than advisory, and that it fails the build loudly rather than being waved through.

**Non-brickability and roll-forward.** A subtle but important property: the upgrade mechanism should be unable to configure itself into a state that permanently locks out *future* upgrades. There is no "undo" for a bad release on-chain — the fix is to upgrade *again* to a corrected version — so the ability to keep fixing must be preserved. The flip side is the honest trade-off: lose the upgrade key and the contract runs forever but can never be patched again.

**The decentralization trajectory.** Finally, ask where governance is *going*. The credible direction is to move admin and upgrade authority behind a **timelock** (a mandatory public delay between an upgrade being announced and taking effect) and/or a broader multisig, so changes carry a public notice window in which users can react or exit. A timelock is the on-chain analogue of a published change freeze and advance notice — it converts "the operator can change the code" into "the operator can change the code, but you will see it coming and can act first." Whether this is live today or a stated roadmap materially changes your risk read; get it in writing.

## How FairWins approaches this

FairWins is a peer-to-peer wager protocol with **no token, no DAO, and no on-chain voting** — its "governance" is precisely the bounded set of operator roles above. Its two core value-bearing contracts sit behind permanent addresses with swappable logic; upgrade authority is a dedicated, air-gapped, offline-signed key held separately from ordinary configuration; storage-compatibility is checked automatically and gates the build; and the upgrade path is non-brickable and roll-forward-only. Powers are split so that a pause halts new activity without freezing settlement — already-active wagers still resolve and remain refundable while a fix ships — and no role, including the upgrade role, can move escrowed stakes or forge a result. The stated trajectory is to place admin and upgrade authority behind a timelock and/or broader multisig before scaling. That is the shape of a defensible answer to "who can change the rules, and how" — and the shape of the answer you should demand from any upgradeable system holding value.

---

*This briefing is educational and informational only. It is not investment, legal, tax, or regulatory advice, and it does not assert that any FairWins mechanism is a regulated product or carries any particular legal status. Regulatory treatment of on-chain systems varies by jurisdiction and is evolving.*

## Related deep-dive

For the engineering details, see [Renovating a Contract Without Changing Its Address](../../posts/11-uups-upgrades-storage-safety/blog.md).

## Further reading

- [BIS/CPMI–IOSCO Principles for Financial Market Infrastructures](https://www.bis.org/cpmi/publ/d101.htm) — governance, operational risk, and access controls for systems that hold value
- [ISACA / COBIT change-management and privileged-access control guidance](https://www.isaca.org/) — the traditional change-advisory and segregation-of-duties baseline
- [AICPA SOC 2 overview](https://www.aicpa-cima.com/topic/audit-assurance/audit-and-assurance-greater-than-soc-2) — what a third-party controls attestation does and does not cover
- [OpenZeppelin: upgradeable smart contracts and proxy patterns](https://docs.openzeppelin.com/upgrades-plugins/) — the public tooling behind fixed-address, swappable-logic designs
- [Timelock controllers, explained](https://docs.openzeppelin.com/contracts/5.x/api/governance#TimelockController) — the delay-and-notice mechanism for privileged changes
