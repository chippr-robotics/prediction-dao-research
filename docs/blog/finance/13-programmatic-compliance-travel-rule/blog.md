# Compliance as Code: On-Chain Screening, KYC/AML Programs, and the Travel Rule

*What a contract-level sanctions gate can and cannot do — and where it fits inside a real compliance program*

| | |
|---|---|
| **Series** | Finance Professional Series |
| **Track** | Compliance, Disclosure & Governance |
| **Level** | Advanced |
| **Audience** | Compliance officers, BSA/AML program leads, fintech risk and product managers, general counsel |
| **Tags** | `sanctions`, `KYC-AML`, `travel-rule`, `screening`, `controls` |
| **Reading time** | ~9 minutes |

> **Informational, not advice.** This briefing is educational. It is not legal, regulatory, or compliance advice, and it does not describe a regulated money-services program. Sanctions and AML obligations vary by jurisdiction and are evolving; consult qualified counsel for your own facts.

## The control that lived in the wrong place

Imagine reviewing a peer-to-peer platform's compliance posture. On paper it screens users: when a customer connects, the interface checks their wallet address against the sanctions list and refuses to proceed if there's a hit. The Terms of Service describe this as a control. The screen even renders a tidy "blocked" state. As a compliance reviewer, you ask the question that decides whether this is a control or a decoration: *what happens if a sanctioned party never loads your interface?*

On a public blockchain, the settlement logic is directly reachable. Anyone with a script can call the contracts without ever touching the website. A screen-only check is a suggestion, not an enforcement point. And US sanctions exposure is effectively **strict liability** — intent and interface design don't rescue you if prohibited property was accepted. So the compliance-relevant question is never "does the app screen?" It is "where does enforcement actually bind, and can it be routed around?"

This is the lens for understanding *programmatic compliance*: pushing a specific, narrow control — sanctions and blocklist screening — down to the layer where value actually moves, so it cannot be bypassed. It is powerful and genuinely useful. It is also frequently oversold. The honest version distinguishes carefully between what address screening does and what a full KYC/AML program does, because they are not substitutes.

## The traditional model

In a regulated financial institution, sanctions screening is one component of a broader Bank Secrecy Act / anti-money-laundering (BSA/AML) program. That program rests on several pillars: a written program with board-level ownership; **Customer Identification and Customer Due Diligence** (CIP/CDD) — you verify *who* the customer is; ongoing transaction monitoring; sanctions screening of parties and transactions against lists such as OFAC's Specially Designated Nationals; suspicious-activity reporting; recordkeeping; and independent testing. Screening is the gate; identity verification, monitoring, and reporting are the rest of the house.

Layered on top for value transfers is the **FATF travel rule** (FATF Recommendation 16). It requires that originator and beneficiary information — names, account identifiers, and often address or identifier details — travel *with* a qualifying transfer between the institutions on each end. It exists so that the sending and receiving institutions can each screen the counterparty and reconstruct a payment's parties after the fact. Crucially, the travel rule is an obligation on **regulated intermediaries** (banks, and, in the crypto context, "virtual asset service providers"). It presumes there is an intermediary who takes custody and holds identity data to pass along.

## What changes on-chain

A contract-level screening control collapses the gate into the settlement path itself. Instead of a website consulting a list and *asking* the system to stop, the settlement logic consults a shared screening component on every entry point where money moves in — and simply refuses to complete a transaction from a listed address. Because the check lives with the money, skipping the interface skips nothing.

Three properties are worth a compliance reader's attention.

**Fail-closed by design.** A well-built on-chain gate treats an unavailable or malformed answer from its screening source the same as a hit: it blocks. If the sanctions data source can't give a clean, well-formed "yes" or "no," the safe posture is to deny rather than wave everyone through. This is the on-chain analogue of a control that defaults to "hold" when the screening system is down — the opposite of the fail-open behavior that quietly creates exposure.

**A built-in, immutable audit trail.** The screening source combines a public on-chain sanctions oracle (a service that answers, for any address, whether it appears on the US Treasury list) with a discretionary operator blocklist for addresses tied to illicit finance beyond the official set. Every blocklist change — who made it, which address, in which direction, and a human-readable reason — is written permanently to the chain. There is no separate compliance database to reconcile or lose; the event log *is* the record. For anyone who has assembled evidence for an exam or a lookback, an immutable, timestamped change history is a real operational advantage.

**Gate entry, never exit.** A deliberate and defensible line: entry paths (putting value in, creating or accepting a position) are screened; exit paths (claiming a refund or a payout already owed) are not. If an address is listed *after* its stake is already in escrow, screening the exit would trap those funds — converting a screening control into a *de facto* asset freeze, a heavier and legally distinct act that would make the contract a custodian of blocked property. Refusing new business is not the same as freezing existing property, and conflating the two is a common design error.

## Where it genuinely differs — address screening is not identity KYC

Here is the distinction a compliance professional must hold firmly, because marketing language routinely blurs it.

**Address screening answers "is this address on a list?" It does not answer "who is this person?"** A contract gate checks a wallet against sanctions and blocklists. It performs no identity verification, no beneficial-ownership analysis, no CDD, no sanctions screening of a *name* behind the address, and no ongoing behavioral monitoring. A newly created wallet with no listing history passes trivially — it is clean *as an address* while being completely unknown *as a person*. Address screening is necessary but nowhere near sufficient for a program that must actually know its customer.

This also reframes the **travel rule** honestly. The travel rule is about intermediaries exchanging identity data about the parties to a transfer. A non-custodial, peer-to-peer settlement layer where users hold their own keys and the platform never takes custody sits differently from a custodial VASP in most current frameworks — but "differently" is not "exempt," classification is jurisdiction-specific and unsettled, and regulators are actively extending travel-rule expectations into crypto. The correct posture is not to claim the rule doesn't apply; it is to recognize that a screening gate does not *satisfy* the travel rule, because the gate transmits no originator/beneficiary identity information at all. These are different controls addressing different obligations.

## Risk & controls

- **Oracle/data-source risk.** The on-chain sanctions oracle is a centralized, permissioned feed taken as ground truth. Mitigations are structural, not trustless: the gate only reads from it, the source can be replaced if compromised or retired, and the operator blocklist keeps working even if the oracle is unset. No decentralized sanctions feed exists; pretending otherwise helps no one.
- **List-coverage risk.** Sanctions lists change; on-chain oracles update on their own cadence; addresses are added faster than any list captures. Screening reduces exposure to *known* listed addresses. It does nothing about a sanctioned party operating through a fresh, unlisted wallet — the residual risk that only real identity diligence addresses.
- **Availability vs. exposure.** Fail-closed means a screening-source outage can halt entry across the platform until an operator restores or reconfigures it. That downtime is the accepted cost: a recoverable outage beats a strict-liability violation.
- **Program completeness.** The largest risk is treating the gate as the whole program. Address screening is one layer among many a serious operation still needs — jurisdictional geo-controls, versioned legal terms with recorded consent, and, where the activity and jurisdiction require it, actual identity verification and monitoring. Defense in depth, not defense in one place.

## How FairWins approaches this

FairWins treats sanctions screening as a shared, fail-closed building block enforced inside the contracts rather than in the interface. A single screening component — the public sanctions oracle plus an operator-maintained, fully audit-logged blocklist — is consulted at every entry point where value moves: creating and accepting wagers (both sides are re-screened at acceptance), buying or extending memberships, joining pools, and issuing tokens. The interface still checks first for fast feedback, but the enforcement layer is the one no one can route around. Exit paths are intentionally never gated, so a mid-position listing can't strand funds. FairWins is explicit that this is *address* screening, not identity KYC, and that participants remain fully subject to applicable law — the gate is a genuine control, not a complete compliance program.

> **Informational, not advice.** Nothing here is a determination that any particular activity is or isn't subject to the travel rule, VASP registration, or any AML obligation. Those are facts-and-jurisdiction questions for qualified counsel.

## Related deep-dive

For the engineering details, see [Sanctions Screening as a Shared Building Block](../../posts/03-sanctions-compliance-gating/blog.md).

## Further reading

- FATF Recommendations and the travel rule (Recommendation 16): https://www.fatf-gafi.org/en/publications/Fatfrecommendations/Fatf-recommendations.html
- FATF guidance on virtual assets and VASPs: https://www.fatf-gafi.org/en/publications/Fatfrecommendations/Guidance-rba-virtual-assets-2021.html
- US Treasury OFAC sanctions programs and the SDN List: https://ofac.treasury.gov/sanctions-list-service
- FFIEC BSA/AML Examination Manual (program pillars, CDD, sanctions): https://bsaaml.ffiec.gov/manual
- Investopedia, "Know Your Client (KYC)": https://www.investopedia.com/terms/k/knowyourclient.asp
