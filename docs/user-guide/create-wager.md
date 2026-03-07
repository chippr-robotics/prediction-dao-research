# Creating an Encrypted P2P Wager

This guide walks you through creating an end-to-end encrypted peer-to-peer wager on FairWins.

## Prerequisites

- A browser wallet (MetaMask or compatible) connected to the Mordor testnet (chain ID 63)
- ETC for gas fees
- Stake tokens (ETC or USC stablecoin) for your wager amount
- Your opponent's wallet address

## Step-by-Step Walkthrough

### 1. Connect Your Wallet

Navigate to the FairWins app and click **Connect Wallet**. Select Mordor testnet from the network dropdown. If Mordor is not listed, add it manually:

| Setting | Value |
|---------|-------|
| Network Name | Mordor Testnet |
| RPC URL | `https://rpc.mordor.etccooperative.org` |
| Chain ID | 63 |
| Block Explorer | `https://etc-mordor.blockscout.com` |

### 2. Register Your Encryption Key (One-Time)

The first time you interact with a private wager, the app prompts you to sign a message with your wallet. This signature derives your personal encryption key.

- The signature request appears automatically when needed
- You only sign once per browser session
- Your wallet private key never leaves your wallet
- The derived key is cached in your browser's session storage (cleared when you close the tab)

If the ZKKeyManager contract is deployed, your public encryption key is also registered on-chain so opponents can look it up directly.

### 3. Navigate to the Wager Dashboard

After connecting, you land on the **Dashboard**. Your existing wagers appear here, organized by status (pending, active, resolved).

### 4. Click "New Wager" and Select a Type

Click the **New Wager** button to open the creation form. Choose a wager type:

| Type | Best For |
|------|----------|
| **1v1** | Head-to-head bet between you and one opponent |
| **Small Group** | Multi-participant wager (up to configurable member limit, default 5) |
| **Bookmaker** | Asymmetric odds (e.g., 3:1 payout) between two parties |

### 5. Fill In Wager Details

Complete the creation form:

- **Opponent Address** (1v1/Bookmaker) or **Invited Members** (Small Group) -- the wallet address(es) of who you are wagering with
- **Description** -- what you are betting on, stated clearly so both sides understand the terms
- **Stake Amount** -- how much each participant puts up (default: 10 USC)
- **Stake Token** -- ETC (native) or USC (stablecoin)
- **Wager End Date** -- when the trading period expires and resolution can begin (default: 7 days)
- **Acceptance Deadline** -- how long the opponent has to accept (default: 48 hours)
- **Resolution Type** -- who can propose the outcome:
  - *Either Party* -- either side can propose (default)
  - *Creator Only* -- only you can propose
  - *Opponent Only* -- only the other side proposes
  - *Third Party* -- a designated arbitrator resolves
  - *Auto-Pegged* -- resolved from an external oracle source (Polymarket, Chainlink, UMA)
- **Arbitrator** (optional) -- a trusted third-party address for dispute resolution

For **Bookmaker** wagers, you also set:
- **Opponent Stake Amount** -- the amount your opponent stakes (can differ from yours)
- **Odds Multiplier** -- the payout multiplier (e.g., 200 = 2x)

### 6. Toggle "Private Wager" for Encryption

Enable the **Private Wager** toggle to encrypt your wager details. When enabled:

- Your wager description is end-to-end encrypted
- Only you and the invited participants can read the wager terms
- The encrypted data is stored on IPFS; only a reference (`encrypted:ipfs://<CID>`) goes on-chain
- Anyone else browsing the blockchain sees only that a private wager exists, not what it is about

**What remains public even with encryption:**
- Participant wallet addresses
- Stake amounts and token type
- Wager status and timestamps
- Transaction history

### 7. Encryption Key Check

When you create an encrypted wager, the system looks up the opponent's registered encryption key from the on-chain registry (ZKKeyManager).

- If the opponent has a registered key, the wager is encrypted for both of you automatically
- If the opponent has **not** registered a key, the system blocks creation with a warning -- the opponent must register their encryption key first before you can create a private wager with them
- For the legacy shared-signature flow, the system falls back to a shared secret model if the key registry is unavailable

### 8. Confirm the Creation Transaction

Review the summary and click **Create Wager**. Your wallet prompts you to confirm the transaction, which:

1. Sends your stake amount to the factory contract (held in escrow)
2. Stores the wager details (encrypted reference or plaintext) on-chain
3. Emits a `FriendMarketCreated` event and a `MemberAdded` event for each participant

Wait for the transaction to confirm. The wager now appears in your dashboard with status **Pending Acceptance**.

### 9. Share the Wager Link

After creation, copy the wager link and send it to your opponent through any channel (message, email, etc.).

- The link contains only the wager ID -- no secret or decryption key is embedded in the URL
- The opponent decrypts the wager using their own wallet-derived key
- Anyone without an invited wallet address sees "Encrypted Market" with no readable details

## Defaults Reference

| Parameter | Default Value |
|-----------|--------------|
| Stake Amount | 10 USC |
| Wager Duration | 7 days |
| Acceptance Deadline | 48 hours |
| Min Acceptance Threshold | 2 participants |
| Odds Multiplier | 200 (2x, equal stakes) |
| Resolution Type | Either Party |
| Member Limit (Small Group) | 5 |
| Max Stake | 1,000 tokens |

## Troubleshooting

**"MembershipRequired" error** -- You need an active FRIEND_MARKET_ROLE membership. Purchase one through the membership page using USC stablecoin.

**"AddressNullified" error** -- Either your address or your opponent's address has been flagged. Contact support for review.

**"Insufficient balance" error** -- Ensure you have enough of the selected stake token plus ETC for gas.

**Opponent cannot decrypt** -- The opponent must connect the same wallet address that was invited. If they use a different address, they will not be able to view the wager terms.

## What Happens Next

Your opponent receives the wager link and follows the [Accept Wager](accept-wager.md) flow. Once they accept and stake, the wager becomes **Active** and the trading period begins.
