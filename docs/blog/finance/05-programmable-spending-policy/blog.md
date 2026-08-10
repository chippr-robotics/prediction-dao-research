# The Transaction That Had Every Signature It Needed: Programmable Spending Policy as a Pre-Settlement Control

*On-chain limits, allowlists, and timelocks that can block an already-authorized transfer — read as a pre-trade compliance engine for treasury*

---

| | |
|---|---|
| **Series** | Finance Professional Series |
| **Track** | Custody & Settlement |
| **Level** | Advanced |
| **Audience** | Compliance officers, risk managers, treasury controls leads, fintech product managers |
| **Tags** | `pre-trade-controls`, `spending-policy`, `investment-mandate`, `treasury-governance`, `compliance` |
| **Reading time** | ~8 minutes |

---

## A transaction with nothing wrong with it, except everything

A three-owner treasury runs two-of-three authorization. A proposal appears: send 180,000 in stablecoin to an address that matches the quarterly market-maker payment, description and all. One owner approves from a phone between meetings. An hour later a second owner approves for the same reason. Threshold met; the transfer executes. The address belonged to whoever phished the first owner and quietly queued the proposal.

Nothing in the authorization model failed. That is the uncomfortable part, and it is the whole subject of this briefing. Multi-party approval answers *who* may move funds. It says nothing about *what* the approved transaction is permitted to do. Once the threshold clears, a bare multisig will send any amount, to any destination, at any time. Everything else — "we vet destinations," "we never approve big transfers on mobile," "anything over a threshold gets a call first" — is procedure living in people's heads, and people approve things between meetings.

The traditional world solved this long ago, in a different layer: the **pre-trade compliance check** and the **spending-policy engine**. This is the on-chain version of that layer, and it is worth understanding as a distinct control from authorization, because it catches a distinct class of failure.

## The traditional model: rules that fire before the money moves

Finance professionals already work with three closely related instances of the same idea.

- **Corporate-card and payment policy engines.** A card that is authenticated and within its credit line will still decline at a prohibited merchant category, above a per-transaction cap, or outside a spending window. The cardholder is legitimate; the *transaction* violates policy, so it never settles.
- **Investment mandates.** A fund's mandate encodes what the portfolio may hold — asset-class limits, issuer concentration caps, prohibited names, counterparty allowlists. A trader with full authority still cannot put on a position the mandate forbids; the order-management system blocks it pre-trade.
- **Pre-trade compliance and DvP controls.** Before an order reaches the market, restricted-list, credit-limit, and best-execution checks run automatically. The check sits between authorization and settlement, and it can veto a fully authorized instruction.

The common shape: an automated rule, evaluated *before* execution, that can block an action the actor was otherwise entitled to take. Authorization and policy are two separate gates. You can be perfectly authorized and still be stopped — and that separation is the point.

## What changes on-chain

The on-chain analogue is a **transaction guard**: a small contract the multisig consults immediately before it executes anything. The account hands the guard the full details of the about-to-run transaction — asset, amount, destination, shape — and if the guard objects, the transaction does not run, no matter how many valid signatures it carries.

This is the crucial architectural fact: the check lives at the *settlement rail*, not in the app and not on a company server. A rule inside a user interface is advisory — anyone can talk to the account directly and bypass it. A rules service on a vendor's server is one more party to trust and one more thing to breach. A guard the account itself is obligated to call is binding in the only place that matters: between "approved" and "settled."

The rules themselves are the classic treasury controls, each independently switchable:

- **Per-transaction limits**, per asset — no single outflow exceeds a ceiling.
- **Rolling daily limits**, per asset — a velocity cap over a time window, the on-chain cousin of a daily payment limit.
- **Recipient allowlists** — funds may leave only to pre-approved destinations, exactly like a counterparty or approved-payee list.
- **Cooldowns / timelocks** — a minimum interval between money-moving transactions, so a rapid drain is impossible and there is time to react.

The phished 180,000 transfer above dies at the guard against a per-transaction limit or an allowlist that never contained the attacker's address — after every signature was collected, before a cent moved.

## Where it genuinely differs

**Stronger.** The policy is enforced by the same rail that settles, so it cannot be bypassed by going around the app, and it applies uniformly to every path into the account. A well-built guard also offers a *preview* that runs the exact same check the real enforcement uses, so what the interface warns you about cannot drift from what actually gets enforced — the perennial gap between a compliance system's simulation and its production behavior, closed by construction. And critically, the policy binds *even a quorum of compromised signers*: authorization and policy being separate gates means clearing one does not clear the other.

**Weaker or different.** On-chain rules are only as expressive as what the guard can interpret. Native transfers and standard token movements are legible; an exotic instruction the guard cannot decode may pass the *value* limits unmeasured (though a hard-lockdown allowlist still constrains where it can reach). The daily window is typically a fixed reset rather than a perfectly continuous rolling window, which in a worst case straddling the reset can permit up to twice the intended limit — a small, bounded, disclosable weakening. And a rule set too tight against reality — a cooldown of a year, an allowlist whose only address is now defunct — could brick the treasury, which is why the ability to *loosen* rules must itself be a governed, always-available action.

## Risk and controls

- **Policy-coverage risk.** Know what your guard measures and what it waves through. Treat uninterpreted-transaction handling explicitly: for high-assurance vaults, an allowlist provides a hard backstop regardless of whether the guard can value the transaction.
- **Lock-out / availability risk.** The escape hatch is a control, not a loophole: changing policy — and managing the account itself — must remain possible under the normal approval threshold, so a too-strict policy can always be relaxed by the same group consent that set it. Verify this carve-out exists before relying on strict rules.
- **Governance-of-the-rules risk.** Who can change the policy is the real control surface. The strongest design gives *no* admin or upgrade key authority to waive enforcement — policy changes clear the vault's own threshold and nothing else — so there is no master backdoor over the controls. Confirm there is no privileged party who can silently disable the guard.
- **Ordering / reentrancy risk.** A guard that evaluates, then records totals, then never calls out to untrusted code avoids the reentrancy failure mode that plagues contracts moving money. This is an assurance question for any guard you adopt.
- **Accounting-direction risk.** Conservative guards count a spend before execution, so a quietly-failed inner action still counts — over-restricting, never over-permitting. Erring toward restriction is the correct direction for a control.

## How FairWins approaches this

FairWins can govern a shared vault with a policy layer that sits above threshold approval: per-transaction and rolling daily limits, recipient allowlists, and cooldowns, each switchable per vault. The guard is deliberately restriction-only — it can block a transaction but can never initiate, approve, or execute one, and it holds no funds. It is intentionally not upgradeable, because an upgrade key over enforcement would be a backdoor over every vault; improvements ship as a new guard each vault chooses to adopt through its own approval. A vault is the sole authority over its own rules, and loosening them is always available under the normal threshold, so no vault can be locked out by its own policy. The interface previews the exact check the chain enforces, and the rules can be wired in from a vault's very first transaction rather than leaving an early unpoliced window. It is, in the reader's terms, a pre-settlement compliance engine that binds even when the signers themselves are compromised.

*This is educational information for finance professionals, not investment, legal, tax, or compliance advice. Programmable controls reduce specific risks; they are not a substitute for a complete compliance program, and their treatment varies by jurisdiction and is evolving.*

## Related deep-dive

For the engineering details, see [Enough Signatures Is Not Enough: Adding Real Rules to a Shared Vault](../../posts/08-multisig-policy-engine/blog.md).

## Further reading

- [IOSCO Principles for Financial Market Infrastructures / market-conduct guidance](https://www.iosco.org/) — pre-trade control and market-integrity context
- [MiFID II pre-trade controls and best-execution obligations (ESMA)](https://www.esma.europa.eu/) — the regulated analogue of pre-execution checks
- [Safe transaction guards — the enforcement mechanism referenced here](https://docs.safe.global/advanced/smart-account-guards)
- [Investopedia — Investment Mandate](https://www.investopedia.com/terms/m/mandate.asp)
- [COSO Enterprise Risk Management framework](https://www.coso.org/guidance-erm) — control-activity design for preventive controls
