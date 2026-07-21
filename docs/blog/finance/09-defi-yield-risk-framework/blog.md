# A Practitioner's Risk Framework for DeFi Yield

*Seven exposures to price before you underwrite an on-chain yield, and a diligence discipline that treats the quoted APY as the last thing you look at, not the first*

| | |
|---|---|
| **Series** | Finance Professional Series |
| **Track** | Money, Yield & Markets |
| **Level** | Advanced |
| **Audience** | Risk officers, allocators, treasury and credit analysts, compliance and operational-risk leads |
| **Tags** | risk framework, smart-contract risk, oracle risk, liquidity risk, de-peg, curator risk, diligence |
| **Reading time** | ~10 minutes |

---

## Start with the risk, not the rate

An allocator is handed two on-chain vaults. One quotes 4%, the other 9%. The instinct — reach for the 9% and ask why later — is exactly backwards. In on-chain yield, the headline APY (annual percentage yield) is not a coupon; it is a variable output of an engine you have not yet inspected, and the spread between the two vaults is usually *risk you cannot see priced by a market that can*. The professional move is to build the risk stack first and read the rate last.

This briefing lays out a seven-part risk taxonomy for DeFi yield in the language of counterparty, liquidity, valuation, and operational risk you already use, then sketches a diligence discipline. It is deliberately protocol-agnostic.

**Informational, not advice.** Educational material only — not investment, legal, tax, or regulatory guidance. On-chain yield is variable, never guaranteed, is not a deposit, is not insured, and can result in total loss of principal. Regulatory treatment varies by jurisdiction and is evolving.

## Why the usual framework needs extending

A money-market or repo risk model concentrates on credit, duration, and liquidity, backstopped by an assumption that the plumbing — custody, settlement, valuation, the legal wrapper — works and is supervised. On-chain, that assumption is the exposure. The plumbing is software and market microstructure with no supervisor, and several risks that TradFi externalizes to custodians, administrators, and central banks are pulled directly onto your book. The seven categories below are the ones that repeatedly explain why an on-chain yield is what it is.

## The seven exposures

**1. Smart-contract risk.** The vault, the lending market, and every contract they touch are code, and code can contain flaws that drain, freeze, or mis-account funds regardless of how sound the underlying credit is. This is technology and operational risk with an unusually sharp tail: failures are often sudden, total, and irreversible. Mitigants are real but partial — independent audits, formal verification, bug-bounty programs, and above all *time-in-market* at scale (a protocol that has held billions through multiple stress events has survived a test a new fork has not). Treat an unaudited or freshly-deployed contract as an unpriced binary risk.

**2. Oracle risk.** On-chain systems price collateral and assets from external data feeds. A feed that is manipulated (via a flash-funded price move), stale (not updated through a fast market), or simply wrong will mistrigger or fail to trigger the liquidations that protect lenders, and will misprice the vault's own NAV. This is your valuation-agent and pricing-source dependency, concentrated into a single technical component. Diligence the feed's sources, update cadence, and manipulation resistance as you would a critical vendor.

**3. Liquidity and redemption risk.** On-chain redeemability is bounded by on-hand liquidity, not by a sponsor's promise. In a lending pool, high utilization shrinks the withdrawable balance until borrowers repay or new deposits arrive; in a vault holding less-liquid strategies, redemptions can be partial. This is the gate/side-pocket risk you know, minus the disclosure documents — and it tends to bind precisely when everyone wants out at once. Part of any elevated yield is compensation for exactly this.

**4. Collateral and liquidation risk.** Over-collateralization protects lenders only if liquidations clear *fast enough and deep enough* during a sharp move. Gap risk, thin market depth, cascading liquidations, and oracle latency can leave a pool under-collateralized — a bad-debt event borne by lenders. This is repo haircut risk with the collateral gapping through the cushion before it can be sold. Read the collateral set, the loan-to-value limits, and the liquidation mechanics, not just the yield.

**5. Stablecoin de-peg risk.** When the yield and the principal are denominated in a stablecoin, the peg is a load-bearing assumption. A de-peg — whether an asset-backed token's reserve is questioned or an algorithmic design unwinds — is a principal-loss event that no amount of lending-side over-collateralization offsets. Understand what backs the specific stablecoin (fully-reserved cash and short government paper is a different object from crypto-collateralized or algorithmic designs), and remember 2022 taught this lesson at scale.

**6. Curator / counterparty risk.** In curated systems a professional manager chooses collateral, sets limits, and may set fees. That discretion is a named counterparty you are underwriting — competence, incentives, and governance keys included. If the curator can change strategy or parameters, you hold *manager risk* without a regulatory wrapper. Diligence them as a sub-advisor: track record, alignment, and the scope and control of their admin powers.

**7. Governance and admin-key risk.** Many protocols retain privileged controls — upgradeable contracts, pausing, parameter changes, treasury keys. Those powers are necessary for maintenance and dangerous if compromised or misused. Ask who holds the keys, whether changes pass through a timelock (a mandatory delay that gives you a window to exit), and how decentralized and accountable the governance actually is. This is the on-chain analogue of key-person and change-control risk.

These do not net. A vault can be flawless on six axes and fail on the seventh, and the loss is often the whole position. Underwrite the maximum, not the average.

## A diligence discipline

Turning the taxonomy into a repeatable process:

- **Read the rate last.** Build the seven-part risk stack first; only then ask whether the yield compensates it. An unexplained spread over a comparable vault is a question, not a gift.
- **Prefer time-tested infrastructure.** Longevity at scale through real stress is the single most informative signal about smart-contract and economic robustness. Favor it over novelty and headline APY.
- **Insist on transparency you can act on.** Look-through into collateral, utilization, oracle sources, and admin controls is a genuine on-chain advantage — use it. If you cannot reconstruct the position and its risks from public data, treat the opacity as a risk in itself.
- **Size for the tail.** Because failure modes are often sudden and total, position sizing — not clever hedging — is the primary control. Only deploy what you can afford to lose, and diversify across independent protocols so a single code or curator failure is survivable.
- **Monitor as a variable, not a fixture.** APY, utilization, and peg status move continuously. Treat an on-chain position as a live exposure requiring ongoing surveillance, not a set-and-forget coupon.
- **Keep the compliance lens.** Classification of tokens and yields, and their treatment for tax and regulatory purposes, is unsettled and jurisdiction-specific. Keep records, and do not assume any regulated-product protections apply.

## How FairWins approaches this

FairWins' posture toward its Earn surface is an applied version of this framework: it does not manufacture yield, take custody, or promise a return. Members deposit directly from their own wallets into **third-party curated vaults** on established, long-lived protocols, and hold the positions themselves. The design leans on the framework's honesty principles — live APY read from the protocol's own data, with the deposit path disabled rather than showing a stale or invented number when that data is unavailable; explicit unavailable states instead of silent assumptions; and only vaults the underlying protocol itself lists surfaced to members. FairWins currently charges **no platform fee** on Earn and discloses that plainly; the vault's own fee is already reflected in the displayed rate, and network gas applies. Every risk in this taxonomy still belongs to the member — smart-contract, oracle, liquidity, collateral, de-peg, curator, and governance risk are all real and named in the product's own risk disclosure. The platform's contribution is transparency and honest failure states, which is exactly what a risk framework asks the infrastructure to provide; it is not a substitute for the member's own diligence.

## Related deep-dive

For the engineering details, see [Earn Without Surprises: Putting Idle Funds to Work](../../posts/23-earn-erc4626-vaults/blog.md).

## Further reading

- [BIS — The financial stability risks of decentralised finance](https://www.bis.org/)
- [IOSCO — Policy Recommendations for Decentralized Finance (DeFi)](https://www.iosco.org/)
- [FSB — Assessment of Risks to Financial Stability from Crypto-assets](https://www.fsb.org/)
- [Investopedia — Stablecoin](https://www.investopedia.com/terms/s/stablecoin.asp)
- [ERC-4626: Tokenized Vault Standard](https://eips.ethereum.org/EIPS/eip-4626)
- [Morpho documentation](https://docs.morpho.org/)
