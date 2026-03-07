# Accepting an Encrypted P2P Wager

This guide walks you through accepting a wager that someone has created for you on FairWins.

## Prerequisites

- A browser wallet (MetaMask or compatible) connected to the Mordor testnet (chain ID 63)
- ETC for gas fees
- Enough stake tokens (ETC or USC) to match the required wager amount
- The wager link or ID from the creator

## Step-by-Step Walkthrough

### 1. Open the Wager Link

The wager creator sends you a link. Click it to open the FairWins app directly to that wager's details page.

If you received just a wager ID instead of a link, navigate to the FairWins app and enter the ID in the search bar or navigate to the wager directly from your dashboard (if you have been invited, the wager appears automatically).

### 2. Connect Your Wallet

Click **Connect Wallet** and select the wallet address that the creator invited. You must connect with the exact address that was specified during wager creation -- a different address will not work.

Make sure you are on the Mordor testnet (chain ID 63). If not, the app prompts you to switch networks.

### 3. Register Your Encryption Key (One-Time)

If this is your first time interacting with an encrypted wager, the app prompts you to sign a message: this derives your personal encryption key.

- A wallet signature popup appears automatically
- Sign the message to derive your encryption key
- This is a one-time action per browser session (cached until you close the tab)
- If the ZKKeyManager contract is deployed, your public key is also registered on-chain

This step ensures you can decrypt wager details that are encrypted for your address.

### 4. Wager Details Auto-Decrypt

Once your encryption key is available, the wager details decrypt automatically:

- The app looks up the encrypted envelope from IPFS (referenced on-chain as `encrypted:ipfs://<CID>`)
- It finds your key entry in the envelope using your wallet address
- It derives the decryption key from your wallet signature
- The wager description and terms are decrypted and displayed

If decryption fails, verify that you are connected with the correct wallet address. Only the addresses specified during creation can decrypt the wager.

**What you see before decryption:** "Encrypted Market" with no readable details.
**What you see after decryption:** The full wager description, terms, and conditions.

### 5. Review the Wager Terms

Before accepting, review all terms carefully:

- **Description** -- What the wager is about and how the outcome is determined
- **Stake Amount** -- How much you need to put up (the required amount is fixed by the creator)
- **Stake Token** -- Which token is used (ETC or USC stablecoin)
- **Odds** -- For bookmaker wagers, the payout multiplier (e.g., 2x means you win double your stake)
- **Wager End Date** -- When the trading period expires and resolution begins
- **Acceptance Deadline** -- How long you have to accept before the wager expires
- **Resolution Type** -- How the outcome will be determined:
  - *Either Party* -- either side can propose the outcome
  - *Creator Only* -- only the creator proposes
  - *Opponent Only* -- only you propose
  - *Third Party* -- a designated arbitrator decides
  - *Auto-Pegged* -- resolved by an external oracle
- **Arbitrator** -- If set, the address of the designated dispute resolver
- **Other Participants** -- For group wagers, who else is invited and their acceptance status

### 6. Click "Accept" to Stake

When you are satisfied with the terms, click the **Accept Wager** button. This triggers a blockchain transaction that:

1. Transfers your stake amount from your wallet to the factory contract (held in escrow)
2. Records your acceptance on-chain
3. Emits a `MarketAccepted` event

For **ERC-20 tokens** (like USC), you may see two transaction prompts:
1. **Approve** -- Allow the factory contract to spend your tokens
2. **Accept** -- The actual acceptance transaction

For **native ETC** stakes, only one transaction is needed.

### 7. Transaction Confirmation

Wait for the transaction to confirm on Mordor testnet. Once confirmed:

- The wager status updates. For 1v1 wagers, it transitions immediately to **Active**. For group wagers, it transitions to Active once the minimum acceptance threshold is met.
- Your stake is locked in the contract for the duration of the wager.
- The wager appears in your dashboard under "Active Wagers."

## After Acceptance

Once the wager is active:

- The **trading period** begins counting down to the wager end date
- Neither party can withdraw their stake during the active period (unless using the ragequit mechanism)
- When the trading period ends, the wager enters **Pending Resolution** and either party can propose an outcome

See [Resolving a Wager](resolve-wager.md) for the next steps.

## Troubleshooting

**"NotInvited" error** -- You are not using the wallet address that was invited. Switch to the correct address.

**"DeadlinePassed" error** -- The acceptance deadline has expired. The creator needs to create a new wager.

**"AlreadyAccepted" error** -- You have already accepted this wager.

**"AddressNullified" error** -- Your address has been flagged. Contact support.

**Cannot see wager details** -- Make sure you signed the encryption message when prompted. Try refreshing the page. Ensure you are on Mordor testnet.

**"Insufficient balance" error** -- You need enough of the required stake token plus ETC for gas. Check your balance matches or exceeds the displayed stake amount.

**Wager shows "Encrypted Market"** -- Your encryption key has not been derived yet. Ensure you signed the encryption message. If the ZKKeyManager is not deployed, the system may use a legacy shared-signature flow instead.
