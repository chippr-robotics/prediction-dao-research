# Earn — Lending & Rewards

The **Earn** section (Finance → Earn) lets you put money you are not using to work. You lend it
out through **Morpho**, an established on-chain lending protocol, and it earns a return over
time. You stay in control the whole time: deposits go straight from your own wallet, FairWins
never holds your money, and you can withdraw whenever you like.

!!! note "Where Earn works"
    Lending is available on **Ethereum** and **Polygon**, and the Earn section shows vaults
    from both together — each row carries a small network badge, just like your portfolio.
    You never manage networks yourself: when you confirm a deposit, withdrawal, or claim,
    the app moves to the right network automatically (a browser wallet may ask you to
    approve the network change in the wallet itself).

## What lending is (in plain terms)

When you deposit into a **vault**, your money is pooled with other people's and lent to
borrowers who put up collateral worth more than they borrow. Borrowers pay interest, and your
share of the pool grows. A professional team — the vault's **curator** — decides where the vault
lends and how it manages risk. FairWins does not manage vaults and charges **no fee** on Earn.

Every unfamiliar term in the app has a small ⓘ info bubble next to it — tap it for a
plain-language explanation.

## Lending step by step

1. Open the menu and choose **Earn** in the Finance group, then open **Lend**.
2. Browse the vault list — vaults from every supported network appear together, each with
   its network badge. For each vault you can see:
    - the asset it accepts (for example USDC),
    - the estimated **yearly rate (APY)** — an estimate, not a promise; rates change constantly,
    - how much everyone has deposited in total,
    - who manages the vault.
3. Pick a vault and enter an amount (or tap **Max**). The app checks your amount before your
   wallet is ever involved and explains any problem in plain language.
4. Confirm the deposit. **With a browser wallet, a first deposit takes two quick
   confirmations**: the first gives the vault permission to take exactly the amount you typed,
   the second makes the deposit — you never approve more than you typed. **With a passkey
   account, one passkey confirmation covers both steps.**
5. Your position appears under **Your positions** with its current value, which includes the
   return earned so far.

## Withdrawing

Open your position and choose **Withdraw**. Vaults lend money out, so occasionally not all of it
can be taken out at the same instant — the sheet always shows what is **available to withdraw
right now**. If that is temporarily less than your full balance, withdraw what is available and
come back shortly for the rest. Withdrawing returns your money **plus the return it has earned**
to your wallet.

## Rewards

Some vaults pay **bonus tokens** on top of the lending return, funded by reward programs run
through Merkl (the rewards system Morpho uses). Open **Earn → Rewards** to see them:

- **Ready to claim** — tokens you can move to your wallet now with one **Claim** action.
- **Building up** — rewards that have been earned but are not claimable yet.

Reward figures are recalculated every few hours, so they update on that schedule rather than
every second. Claiming is safe to repeat — you can never claim the same reward twice. If you
lent through Morpho before mid-2025, older rewards live on
[Morpho's legacy rewards page](https://rewards-legacy.morpho.org/).

## Your activity record

Every deposit, withdrawal, and reward claim is recorded in your activity feed (the bell icon)
with a link to the transaction on the block explorer, so you always have an audit trail.

## Getting there from your portfolio

Viewing an asset in **Portfolio**? Tap **Earn** in the asset's action row and you land directly
on the vaults that accept that asset. If the asset can't be lent (for example on a network
without lending), the button says why instead of doing nothing.

## Risks and fees — the honest version

- **Returns are variable.** APY is an estimate based on current conditions and is not guaranteed
  by FairWins, Morpho, or the vault curator.
- **Smart contracts carry risk.** Vaults are third-party audited contracts, but no on-chain
  system is risk-free. Only deposit what you can afford to have at risk.
- **FairWins charges no fee on Earn** and never takes custody of your deposit. Network gas fees
  and the vault's own performance fee (already reflected in the displayed APY) still apply.
- The vault list shows only vaults curated and listed by the Morpho protocol itself.

## FAQ

**Can I lose money?** Vault curators manage risk conservatively and loans are over-collateralized,
but smart-contract failures or extreme market events can cause losses. The APY shown is net of
vault fees but is never a guarantee.

**Why is my withdrawal limited right now?** The vault's funds are lent out and the currently idle
portion is what can leave instantly. Liquidity replenishes continuously.

**Why don't I see rewards immediately after depositing?** Rewards accrue over time and the
figures refresh every few hours. Not every vault runs a reward program — the vault list shows a
reward badge in the rate breakdown where one applies.
