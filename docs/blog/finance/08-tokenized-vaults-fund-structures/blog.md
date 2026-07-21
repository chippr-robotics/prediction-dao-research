# Tokenized Vaults as Fund Structures

*The ERC-4626 standard read as a share-and-NAV accounting model: deposits as subscriptions, withdrawals as redemptions, and the curator as a risk manager — structurally analogous to a fund, not legally equivalent to one*

| | |
|---|---|
| **Series** | Finance Professional Series |
| **Track** | Money, Yield & Markets |
| **Level** | Advanced |
| **Audience** | Fund operations and administration leads, allocators, product managers, compliance and risk officers |
| **Tags** | ERC-4626, tokenized vaults, NAV, fund accounting, subscriptions, redemptions, curator |
| **Reading time** | ~9 minutes |

---

## A due-diligence lens you already own

An allocator sits down to evaluate a new pooled vehicle. The questions are reflexive: How are shares priced? What is the NAV mechanism? How do subscriptions and redemptions settle, and on what cycle? Who is the manager, what discretion do they hold, and where is the fee? Who administers the book and strikes the price?

Point that same lens at a **tokenized vault** — a pool built to the ERC-4626 standard, the common template for on-chain yield-bearing pools — and something useful happens: most of the questions have clean answers, several of the mechanics are unusually transparent, and a few of your instincts need adjusting. This briefing reads a tokenized vault as a fund operations professional would read a fund, and is deliberate about the one thing it is *not* claiming: legal equivalence.

**Informational, not advice.** This is educational material, not investment, legal, tax, or regulatory guidance, and not a legal opinion on any instrument's classification. On-chain yield is variable, never guaranteed, is not a deposit, and can lose value. Regulatory treatment of tokenized vehicles varies by jurisdiction and is unsettled and evolving.

## The traditional model

A pooled fund is, at its core, a **share-and-NAV accounting machine.** Investors subscribe by delivering cash; the administrator issues units at the prevailing net asset value per share; the manager invests the pool; income and gains accrue; and the NAV per share rises (or falls) to reflect them. Redemptions run the machine in reverse — units are cancelled and the investor receives their proportional slice of NAV, on the dealing cycle the offering documents specify. A transfer agent maintains the register, an administrator strikes the NAV and reconciles, a custodian holds the assets, and an auditor checks the whole apparatus once a year. Fees — management, sometimes performance — are accrued into or deducted from NAV.

Every one of those roles exists to answer a trust question: *can I rely on the share price, and can I get my money back at it?*

## What changes on-chain

ERC-4626 is, in effect, a **standardized fund-accounting interface expressed in code.** A vault issues share units when assets are deposited and burns them on withdrawal, and it exposes a canonical conversion between shares and underlying assets. That conversion *is* a NAV-per-share: total assets held by the vault divided by shares outstanding. Map the roles directly:

- **A deposit is a subscription.** Assets in, shares issued at the current share-to-asset ratio.
- **A withdrawal is a redemption.** Shares burned, assets out at that same ratio, up to available liquidity.
- **The share balance is the register entry.** It lives in the investor's own wallet — the holder is their own transfer-agent record, and ownership is settled, not merely recorded on a manager's books.
- **The conversion function is the NAV strike.** But rather than a once-a-day price struck by an administrator, it is computed continuously and readable by anyone at any moment.
- **Yield accrues into the share price.** As the vault's assets grow, each share converts to more underlying — the on-chain analogue of an accumulating NAV, no distribution event required.

Because the interface is standardized, any application can subscribe to, value, and redeem from any compliant vault the same way — the operational equivalent of every fund in the market speaking one dealing protocol. The **curator** (the vault's risk manager) plays the portfolio-manager role: choosing where the pooled assets are deployed, setting concentration and risk limits, and, where applicable, setting the vault's own fee — which, exactly like a fund, is reflected in the price the investor ultimately receives.

## Where it genuinely differs

**Better, honestly:** the accounting is glass-boxed. There is no dealing lag and no stale-price uncertainty — the share-to-asset ratio is verifiable on demand, so an investor never subscribes or redeems at a NAV they cannot independently reconstruct. Settlement is atomic: units and assets change hands in the same transaction, eliminating the subscription-in-limbo and failed-redemption states that fund operations teams manage around. The register is self-custodied, removing an entire layer of transfer-agent and omnibus-account reconciliation. And *composability* has no fund analogue: a vault share is itself a standard token that other systems can hold, price, or build on.

**Worse or simply different:** the assurance scaffolding is thinner and differently shaped. There is no independent administrator striking and reconciling NAV, no custodian segregating assets under a regulated mandate, and typically no statutory audit of financial statements — the "administrator" is the contract's own arithmetic, which is transparent but unsupervised. Redemption is not a contractual right honored by a sponsor; it is a mechanical function bounded by whatever liquidity the vault holds at that instant. And critically, **structural analogy is not legal status.** A tokenized vault that looks and accounts like a fund is not thereby a regulated fund, does not carry a prospectus or the investor protections that attach to one, and its classification — as a security, a collective investment scheme, or something else — varies by jurisdiction and remains unsettled. Read the resemblance as intuition, never as a claim.

## Risk and controls

The fund-operations checklist translates cleanly, and should be applied:

- **NAV integrity / valuation risk.** The share price is only as sound as the vault's asset valuation. If underlying positions are mispriced — by a bad oracle or an illiquid, hard-to-value holding — the conversion misprices subscriptions and redemptions. This is your fair-value and pricing-source diligence, unchanged in spirit.
- **Liquidity and redemption risk.** Continuous redeemability is bounded by on-hand liquidity. A vault deploying into less-liquid strategies can leave redemptions partially available — the on-chain cousin of a gate or side-pocket. Understand the maturity and liquidity profile of what the curator holds.
- **Curator/manager risk.** The curator holds real discretion over strategy, concentration, and fees. That is a named counterparty whose competence and incentives you are underwriting, without the regulatory wrapper you may be used to. Diligence the curator as you would a sub-advisor.
- **Smart-contract and operational risk.** The accounting machine is code; a defect can impair the share price or freeze redemptions irrespective of portfolio quality. Favor audited, long-established implementations and standard building blocks.
- **Fee transparency.** Vault fees are embedded in the price. Confirm what the quoted yield is net of, and remember that any additional platform layer must be disclosed as its own cost, not buried in the rate.

The overarching control is the same one a good administrator provides: *be able to reconstruct the price and the redemption terms independently.* On-chain, you often can — which is the point.

## How FairWins approaches this

FairWins does not operate a vault, act as administrator, or take custody. Its Earn surface lets a member subscribe to and redeem from **third-party curated tokenized vaults** on established protocols, with the share units held in the member's own wallet throughout — the member is their own register entry, and FairWins never sits in the asset path. The vault's share-to-asset value and live APY are read directly from the protocol's data and shown honestly; when that data is unavailable, deposits are disabled rather than displaying a stale price. The curator — a third party — is the risk manager; FairWins neither selects strategies nor guarantees a return. FairWins currently charges **no platform fee** on Earn and says so plainly; the vault's own fee is already reflected in the displayed rate, and network gas applies. The role is honest disclosure and clean plumbing into someone else's fund-like structure — never a promise about its price.

## Related deep-dive

For the engineering details, see [Earn Without Surprises: Putting Idle Funds to Work](../../posts/23-earn-erc4626-vaults/blog.md).

## Further reading

- [ERC-4626: Tokenized Vault Standard](https://eips.ethereum.org/EIPS/eip-4626)
- [IOSCO — Principles for the Valuation of Collective Investment Schemes](https://www.iosco.org/)
- [Investopedia — Net Asset Value (NAV)](https://www.investopedia.com/terms/n/nav.asp)
- [Investopedia — Open-End Fund](https://www.investopedia.com/terms/o/open-endfund.asp)
- [Morpho documentation](https://docs.morpho.org/)
