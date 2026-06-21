# Creating a Wager

This guide walks you through creating a 1-v-1 wager on FairWins, including
optional end-to-end encryption of the terms.

## Prerequisites

- A browser wallet (MetaMask) or mobile wallet via WalletConnect, on
  **Polygon mainnet** (chain 137) — or Polygon Amoy (80002) in testnet mode
- POL for gas fees
- USDC for your stake
- An active **membership tier** (see [Getting Started](getting-started.md#4-get-a-membership))

## Step-by-step

### 1. Connect your wallet

Open [fairwins.app](https://fairwins.app), launch the app, and connect. If
you're on the wrong network the app offers a one-click switch.

### 2. Pick a wager style from the Dashboard

| Quick action | What it creates |
|--------------|-----------------|
| **Friends Decide (1v1)** | Even-money wager you and your opponent settle yourselves |
| **Oracle Settles (1v1)** | Wager pegged to an external source (Polymarket, Chainlink, UMA) |
| **Make an Offer** | Asymmetric stakes at odds you set — whoever settles puts up the majority stake (e.g. your 30 USDC vs. their 10) |
| **Open Challenge** | A wager with **no named opponent**, gated by a four-word code anyone you share it with can take. Requires a **Silver** membership or above. See [Open Challenges](open-challenges.md) |

### 3. Fill in the wager details

- **Description** — what you're betting on, stated clearly enough that both
  sides (and an arbitrator, if any) can judge the outcome
- **Stake amount** — default 10 USDC; for an **Offer** you set the odds
  multiplier and the app derives the two stakes
- **End time** — when the bet is decided (default 1 day; minimum 1 hour,
  maximum 21 days)
- **Acceptance deadline** — how long your opponent has to accept before you
  can reclaim your stake (default 6 hours)
- **Who settles it** — every wager names a single settler; in an **Offer**
  that settler also puts up the majority (insurer) stake:
    - *Me* — you settle the outcome (default); in an Offer you stake the majority
    - *Them* — your opponent settles; in an Offer they stake the majority
    - *A Friend* — a neutral arbitrator you name settles it (enter their address)
    - *An Oracle* — link an external source (next step)

### 4. (Oracle wagers) link the source

- **Polymarket** — an in-app browser searches live Polymarket markets; pick
  one and choose which side you're taking
- **Chainlink Data Feed** — select a registered price condition (e.g. "ETH
  above $5,000 at the deadline")
- **Chainlink Functions / UMA** — select a registered custom condition

Once the underlying source resolves, the wager can be auto-settled on-chain by
anyone — no trust in either party required.

### 5. (Optional) encrypt the terms

Enable the **private wager** option to end-to-end encrypt the description:

- Both you and your opponent must have an encryption key registered (Account
  Center → Security; one-time wallet signature). If your opponent hasn't
  registered, the app blocks creation with a warning.
- The encrypted envelope is stored on IPFS; only a hash and CID go on-chain.
- If you named an arbitrator, the terms are encrypted for them too.

What stays public regardless: wallet addresses, stake amounts, token,
deadlines, and status. See [Private Wager Encryption](private-market-encryption.md).

### 6. Confirm the transaction(s)

Click **Create Wager**. You'll be prompted for up to two transactions:

1. **Approve** — allow the `WagerRegistry` contract to take your USDC stake
2. **Create** — the actual `createWager` call; your stake moves into escrow

If the page reloads mid-flow, the app resumes the pending transaction.

### 7. Share it

After confirmation the app shows a **QR code** and a copyable **deep link**.
Send either to your opponent — the link contains only the wager ID; no secrets
are embedded. They follow the [Accept Wager](accept-wager.md) flow.

## Defaults reference

| Parameter | Default | Bounds |
|-----------|---------|--------|
| Stake | 10 USDC | max 1,000 |
| End time | 1 day | 1 hour – 21 days |
| Acceptance deadline | 6 hours | up to 30 days |
| Resolution window after end time | 48 hours | up to 180 days |
| Odds multiplier (even money) | 200 (2×) | — |
| Settler (resolution type) | Me (Creator) | — |

## Troubleshooting

**"Membership required"** — you need an active tier. Buy one in Account
Center → Membership (priced in USDC).

**"Concurrent wager limit reached"** — your tier caps how many open wagers you
can run at once. The app offers to clean up your expired offers
(`batchExpireOpen`), or upgrade your tier.

**Creation blocked with a sanctions message** — wager creation screens
addresses against the Chainalysis sanctions oracle; flagged addresses cannot
participate.

**"Opponent has no encryption key"** — for private wagers your opponent must
register a key first (their Account Center → Security tab).

**Insufficient balance** — you need the stake in USDC plus a little POL for gas.

## What happens next

Your opponent accepts before the deadline and the wager goes **Active**. If
nobody accepts in time, reclaim your stake from *My Wagers* — see
[Resolving a Wager](resolve-wager.md#refunds) for every way money comes back.
