# Custody Without a Custodian: Rethinking Safekeeping When Nobody Holds Your Assets

*What self-custody actually changes about segregation, insolvency remoteness, and operational responsibility — and how passkey-based smart accounts turn a scary phrase into a controls story*

| | |
|---|---|
| **Series** | Finance Professional Series |
| **Track** | Custody & Settlement |
| **Level** | Intermediate |
| **Audience** | Treasury and operations leads, custody and fund-ops specialists, compliance and risk officers, allocators |
| **Tags** | `custody`, `self-custody`, `segregation`, `insolvency-remoteness`, `operational-risk`, `smart-accounts` |
| **Reading time** | ~8 minutes |

## The question a custody review is supposed to answer

Every custody due-diligence checklist, whatever its length, is really trying to answer three questions. Are the assets *segregated* from the custodian's own balance sheet? Are they *insolvency-remote* — safe if the custodian fails? And who bears the *operational* burden of keys, reconciliation, and access control? A qualified custodian exists precisely so that a professional can answer "yes, yes, them" and move on.

Self-custody breaks that shorthand. There is no third party holding the asset, no omnibus account, no custodial agreement to paper. For a finance professional, the instinct is unease: if nobody is the custodian, who is accountable? The honest answer is that self-custody does not remove the three questions — it *relocates* them. Segregation becomes structural rather than contractual. Insolvency remoteness becomes near-absolute rather than negotiated. And operational responsibility, which a custodian used to absorb, comes home to the asset owner. Whether that trade is attractive depends entirely on the quality of the controls that replace the custodian. That is the subject worth examining closely.

## The traditional model: a custodian as intermediary and shock absorber

In the traditional world, a qualified custodian is both a safekeeping agent and a legal firewall. Client assets are held in segregated accounts, recorded as belonging to the client rather than the custodian, and — where the structure is sound — placed beyond the reach of the custodian's creditors if it fails. Layered on top are the operational services you are really paying for: reconciliation, access controls, dual authorization, insured vaults, audited processes (often evidenced by a SOC 2 report, an independent attestation of a service organization's controls), and a claims path when something goes wrong.

Those benefits are real, and so are the frictions. Assets sit inside someone else's balance sheet and legal perimeter. Segregation is only as good as the paperwork and the jurisdiction's insolvency law. Access is gated by the custodian's hours, systems, and risk appetite. And the arrangement introduces the very thing custody is meant to reduce elsewhere — a concentrated counterparty whose failure, freeze, or error becomes your problem. History offers enough examples of client assets caught in a failed intermediary to make the point without belaboring it.

## What changes on-chain: the asset never enters a balance sheet

Self-custody on a public blockchain rearranges the picture at the root. A stablecoin such as USDC held in a self-custodial account is recorded on the network as belonging to that account's address. It is not on FairWins' balance sheet, not in an omnibus pool, and not subject to any transfer that the account's own keys do not authorize. Segregation stops being a promise in a custody agreement and becomes a property of where the asset lives: one address, one owner, no commingling by construction.

Insolvency remoteness follows from the same fact. If FairWins — the software provider — were to disappear tomorrow, the assets would not be entangled in its estate, because they were never in its possession. There is no omnibus account to unwind, no creditor claim to litigate, no administrator deciding the order of the queue. The network keeps running; the keys keep working. That is a materially stronger form of insolvency remoteness than most custodial structures can offer, and it is worth stating plainly because it is one of the genuine advantages.

What does *not* vanish is operational responsibility. Someone must hold the keys, control access, and make sure the right people — and only the right people — can move funds. In a custodial model, the custodian's operations team does this. In self-custody, it is you. This is where most of the traditional custody value actually sat, and it is the part self-custody hands back to the owner. The interesting question is therefore not "is self-custody safer?" but "can the key-management and access controls be made institution-grade?"

## Passkey-based smart accounts as a controls story

This is where the account design matters more than the custody label. A FairWins account is not a private key written on paper. It is a small program on the blockchain — a smart account — whose authority to move funds is defined by a list of owners and a set of rules the account itself enforces. The controls a treasurer cares about are expressed in that program rather than in a service-level agreement.

Start with the keys. Each owner can be a passkey — the same hardware-backed, biometric credential (WebAuthn, the standard behind Face ID and fingerprint sign-in) that already protects enterprise logins and payments. The private key is generated inside a tamper-resistant chip, never leaves the device, and will only sign after a biometric check. It cannot be exported, emailed, or pasted into a fake support chat. Compared with a seed phrase on paper — the classic self-custody failure mode — this is a categorical improvement in the operational risk that most worries a controls reviewer: key exfiltration and social engineering.

Now the access model. Ownership of the account is a list, not a single secret. That list can hold more than one credential, and the account refuses to remove its last owner, so it cannot lock itself out. This is the on-chain analogue of controls a treasury team already runs: no single point of failure, redundant signers, and a recovery path that does not depend on one fragile artifact. For higher-value balances, the same building blocks extend to multi-signature arrangements, where several independent approvals are required before funds move — structurally similar to the dual-authorization and quorum controls you would demand of any corporate treasury account, but enforced by code rather than by a bank's back office.

Two further properties are worth a risk officer's attention. First, upgrades to the account's logic can only be authorized by the account's own owners; the software provider holds no override switch over anyone's funds. That is what makes this self-custody without scare quotes — nobody but the owner can move or freeze the owner's assets. Second, because the rules live in an open, auditable program deployed identically across networks, the control environment is inspectable in a way a proprietary custodial black box is not.

## Risk and controls: an honest ledger

Self-custody removes custodian counterparty risk and delivers strong segregation and insolvency remoteness. In exchange, it concentrates a different risk set that a professional must own explicitly.

- **Key and access risk.** There is no custodian help desk and, for on-chain transfers, no reversal. Passkeys and multi-owner accounts sharply reduce the classic loss modes, but device loss, recovery design, and owner-list governance now sit inside *your* control framework, not a vendor's. Recovery must be planned before it is needed, not after.
- **Operational and process risk.** Reconciliation, authorization workflows, and segregation of duties do not disappear; they move in-house. The upside is that on-chain balances are continuously and independently verifiable against the public ledger — a stronger reconciliation primitive than a custodial statement — but someone has to run the process.
- **Smart-contract risk.** The account is code, and code can carry bugs. FairWins' mitigation is to build on a widely deployed, professionally audited smart-account design and adopt it unmodified, so external audits keep applying, rather than forking it into something un-reviewed. Reused audited components are a control; bespoke unaudited ones are a risk.
- **Compliance and classification risk.** Self-custody does not change your KYC/AML, sanctions-screening, or record-keeping obligations, and the regulatory treatment of custody-technology arrangements varies by jurisdiction and is still evolving. Nothing here substitutes for your own legal and regulatory analysis.

The through-line: self-custody is not the absence of controls. It is a different *placement* of controls, and passkey-based smart accounts are what make that placement defensible to an institutional reviewer.

## How FairWins approaches this

FairWins never takes custody of user funds. Assets sit in self-custodial smart accounts controlled by passkeys, with multi-owner and multi-signature options for higher-value balances, upgrade authority that belongs solely to the account owner, and audited, unmodified account logic underneath. Operational responsibilities that a custodian would traditionally absorb are handed back to the owner deliberately — and the account design exists to make carrying them realistic rather than reckless.

*This briefing is educational and informational only. It is not investment, legal, tax, custody, or regulatory advice. Custody arrangements and their regulatory treatment vary by jurisdiction and are evolving; assess your own obligations with qualified advisors before acting.*

## Related deep-dive

For the engineering details, see [Passkey Smart Accounts](../../posts/04-passkey-smart-accounts/blog.md).

## Further reading

- SEC Custody Rule (Investment Advisers Act, Rule 206(4)-2) overview — Investopedia: <https://www.investopedia.com/terms/c/custodian.asp>
- SOC 2 and service-organization controls (AICPA): <https://www.aicpa-cima.com/topic/audit-assurance/audit-and-assurance-greater-than-soc-2>
- WebAuthn / passkeys (W3C standard): <https://www.w3.org/TR/webauthn-2/>
- FIDO Alliance — what passkeys are: <https://fidoalliance.org/passkeys/>
- ERC-4337 account abstraction (smart-contract wallets): <https://eips.ethereum.org/EIPS/eip-4337>
- BIS/CPMI–IOSCO Principles for Financial Market Infrastructures (custody and segregation context): <https://www.bis.org/cpmi/publ/d101a.pdf>
