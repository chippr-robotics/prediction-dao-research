# Segregation of Duties, Enforced by Code: Multisig as Institutional Custody Control

*How maker-checker, four-eyes authorization, and M-of-N approval map onto a Safe-based on-chain treasury — and where the control model is genuinely stronger, weaker, or simply different*

---

| | |
|---|---|
| **Series** | Finance Professional Series |
| **Track** | Custody & Settlement |
| **Level** | Intermediate |
| **Audience** | Treasury operations, custody and controls leads, internal audit, compliance officers |
| **Tags** | `custody`, `segregation-of-duties`, `maker-checker`, `treasury-governance`, `multisig` |
| **Reading time** | ~8 minutes |

---

## The control question, restated

Every treasury or operations lead has answered some version of the same audit question: *who can move the money, and what stops any one of them from moving it alone?* In a traditional shop the answer is a stack of controls you know cold — dual authorization on wire releases, a maker who initiates and a checker who approves, approval matrices that scale with amount, an authorized-signatory list at the bank, and a segregation of duties that keeps the person who initiates a payment away from the person who releases it. None of this is exotic. It is the ordinary machinery of not losing money to error or fraud.

The interesting thing about moving a treasury on-chain is not that these controls disappear. It is that they change *substrate* — from bank procedure and internal policy enforced by people, to authorization logic enforced by the settlement rail itself. That shift is worth understanding precisely, because it improves some failure modes, worsens others, and leaves a few exactly where they were.

## The traditional model

In a conventional corporate treasury, control over cash rests on layered, mostly procedural defenses. The bank holds an authorized-signatory list and a set of mandates: below one threshold a single signer suffices, above it two are required, above another the transaction routes to a named officer. Inside the company, a payments workflow enforces maker-checker — one clerk keys the payment, a second reviews and releases it — and segregation of duties keeps vendor-master maintenance, payment initiation, and reconciliation in separate hands so no single person controls a transaction end to end.

Two things are worth naming about this model. First, the controls are real but *soft*: they are policy and workflow, and a determined insider who compromises the workflow — or a bank that fails to enforce the mandate — can bypass them. Second, the ultimate custodian is the bank. You are trusting an institution's balance sheet, its operational controls, and its willingness to reverse an error. That trust is usually well-placed, and it comes with genuine benefits (fraud reversal, regulatory recourse) that on-chain custody does not replicate.

## What changes on-chain

An on-chain multisig — the most widely used is Safe, an audited smart-contract wallet deployed across Ethereum, Polygon, and their relatives — turns the authorization rule into a property of the account itself. A multisig is configured as **M-of-N**: N owners hold keys, and any transaction requires M of them to authorize before it will execute. Two-of-three, three-of-five: the same approval-matrix logic a bank mandate expresses, except the *account will not move funds* unless the threshold is met. There is no workflow to bypass and no operator to socially engineer into releasing early. The threshold is not a policy about the account; it *is* the account.

The proposal-and-approval flow maps cleanly to maker-checker. One owner constructs the exact transaction — recipient, asset, amount — and submits it. The other owners each review those details and register approval. Only when M approvals exist can anyone execute. The maker cannot also be the sole checker, because one signature is below threshold by construction. Four-eyes is not a procedure layered on top; it is the minimum the account enforces.

A well-designed integration adds one discipline the raw mechanism lacks: making sure each approver actually knows what they are approving. When an owner is asked to sign, the underlying data can look like an opaque code. A serious setup shows each approver the full, human-readable transaction and re-derives the fingerprint locally, so an owner never blind-signs and a tampered proposal fails verification inside the approver's own device rather than at the bank's discretion. That is the on-chain analogue of a checker actually reading the payment, not rubber-stamping it.

## Where it genuinely differs

**Stronger.** The authorization rule is cryptographically binding and continuously enforced, not periodically audited. There is no privileged operator who can release a sub-threshold payment "just this once," and no central workflow whose compromise defeats every control at once. The ledger of who approved what is public and immutable — a built-in, tamper-evident audit trail that a traditional approval log has to be trusted to preserve. Key material is distributed by design, so a single stolen laptop or phished credential does not equal a lost treasury.

**Weaker or different.** There is no bank to reverse a mistaken or fraudulent transfer; settlement is final, the way a cash handover is final. Segregation of duties protects against a *minority* of compromised signers, but M colluding or simultaneously-phished owners can move funds exactly as the account permits — the same residual risk a bank mandate carries, made explicit. Key management becomes your operational burden: lost keys, unavailable signers, and succession planning are now custody risks you own rather than the bank's. And a threshold set too high against too few reachable signers can strand the treasury — an availability risk with no customer-service line behind it.

## Risk and controls

A professional risk read on a multisig treasury covers several distinct exposures:

- **Signer key risk.** Each owner key is a credential to protect. Hardware wallets, separated custody of keys, and geographic and organizational distribution of signers reduce single-point compromise. The control objective is that no single failure — and ideally no single insider — reaches threshold.
- **Threshold and availability risk.** M and N are a governance trade-off: higher M resists collusion but raises the chance that enough signers are unavailable when a legitimate, time-sensitive payment must move. Document the rationale, keep backup signers, and rehearse the signing process the way you would test a disaster-recovery plan.
- **Operational and key-lifecycle risk.** Onboarding and offboarding signers, rotating keys after a departure, and maintaining current recovery documentation are recurring controls, not one-time setup. Review the owner set on a schedule the way you review an authorized-signatory list.
- **Smart-contract risk.** You are trusting the wallet's code. Using a long-audited, widely-deployed implementation rather than a bespoke build is the risk-management choice here; verifying that the expected contracts are actually deployed at the expected addresses on each network is a control worth performing rather than assuming.
- **Settlement finality risk.** No reversal, no chargeback. The compensating controls are all *pre-execution*: verified recipients, human-readable review, and — as the companion piece explores — programmable policy that can block an in-policy-violating transaction even after it clears the signature threshold.

## How FairWins approaches this

FairWins treats a shared vault as a standard Safe multisig, not a proprietary custody product — so it interoperates with the wider Safe ecosystem and an existing organizational Safe can be used as-is. The design deliberately avoids a company-run coordination server: approvals are registered on-chain, which means the account's own state is the single source of truth and no participant can be locked out of their own funds if any FairWins infrastructure were to disappear. Every approver's software re-verifies the full transaction against its fingerprint locally, so four-eyes review is real review rather than blind approval. Recorded backups store addresses and labels, never key material. And a vault can be governed by more than threshold alone — a policy layer, covered in the companion briefing, constrains what an already-approved transaction is permitted to do.

The result maps recognizably onto the controls you already run — segregation of duties, dual authorization, an approval matrix, a tamper-evident audit trail — with the authorization rule moved from procedure the bank enforces into logic the settlement rail enforces, and with the honest trade-off that finality and key custody become your responsibility rather than an institution's.

*This is educational information for finance professionals, not investment, legal, tax, or regulatory advice. On-chain custody and its treatment vary by jurisdiction and are evolving; evaluate any custody arrangement against your own control framework and obligations.*

## Related deep-dive

For the engineering details, see [Shared Vaults Where No One Person Can Move the Money](../../posts/07-safe-multisig-custody/blog.md).

## Further reading

- [Safe — the smart-account multisig referenced here](https://safe.global)
- [BIS Principles for Financial Market Infrastructures (PFMI)](https://www.bis.org/cpmi/publ/d101.htm) — settlement, custody, and operational-risk principles
- [COSO Internal Control — Integrated Framework](https://www.coso.org/guidance-on-ic) — segregation of duties and control-activity concepts
- [Investopedia — Maker-Checker (dual control)](https://www.investopedia.com/terms/t/two-man-rule.asp)
- [SOC 2 / Trust Services Criteria (AICPA)](https://www.aicpa-cima.com/topic/audit-assurance/audit-and-assurance-greater-than-soc-2) — control-assurance context for custody operations
