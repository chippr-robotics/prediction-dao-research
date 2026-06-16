# Accepting a Wager

This guide walks you through accepting a wager someone created for you on
FairWins.

## Prerequisites

- A browser wallet (MetaMask) or mobile wallet via WalletConnect
- POL for gas and enough USDC to match the required stake
- An active **membership tier** (see [Getting Started](getting-started.md#4-get-a-membership))
- The wager QR code or link from the creator

## Step-by-step

### 1. Open the wager

Scan the creator's **QR code** (the app has a built-in scanner, and your
phone's camera works too) or open the **deep link** they sent you. Either
lands on the acceptance page (`/friend-market/accept?marketId=…`).

You can preview the offer — stake required, deadline, creator address — before
connecting a wallet.

### 2. Connect your wallet

Connect with the address the creator invited. If the wager was created for a
specific opponent address, a different address cannot accept it. If you're on
the wrong network, the app offers a one-click switch.

### 3. Review the terms

- **Terms** — the wager description. If it's encrypted you'll see "Encrypted
  Wager" until you decrypt it (one wallet signature derives your key; you must
  have an encryption key registered — Account Center → Security)
- **Your stake** — the amount you must lock, fixed by the creator. For an
  **Offer**, note the odds multiplier — if you're the settler you put up the
  majority stake
- **Time remaining** — the acceptance deadline countdown
- **Who settles it** — the creator (**Me**), you the opponent (**Them**), a
  neutral **Friend** (arbitrator), or an **Oracle** (Polymarket / Chainlink / UMA)

### 4. Accept (or decline)

Click **Accept**. You'll be prompted for up to two transactions:

1. **Approve** — allow `WagerRegistry` to take your USDC stake
2. **Accept** — the `acceptWager` call; your stake joins the creator's in escrow

Acceptance also screens both addresses against the sanctions oracle and checks
your membership tier.

Not interested? **Decline** rejects the offer and releases the creator's stake
back to them immediately.

### 5. Confirmation

Once the transaction confirms, the wager is **Active**: both stakes are locked
until it resolves, draws, or passes its resolve deadline. It appears in *My
Wagers → Participating*.

## After acceptance

When the event happens, the wager resolves according to its resolution type —
see [Resolving a Wager](resolve-wager.md). If it's never resolved, both stakes
become refundable after the resolve deadline; your money can't get stuck.

## Troubleshooting

**Accept button disabled** — check, in order: wallet connected, correct
network, deadline not passed, active membership, sufficient USDC + POL.

**"Deadline passed"** — the acceptance window expired; ask the creator to
make a new wager.

**Wrong-address error** — the creator invited a specific address; switch to it.

**Can't read the terms** — encrypted wagers require your registered encryption
key. Sign the decryption prompt, and make sure you're connected with the
invited address (only invited addresses hold a key to the envelope).

**Blocked with a sanctions message** — acceptance screens both parties against
the Chainalysis sanctions oracle.

**QR scanner shows no camera** — grant camera permission to fairwins.app in
your browser settings.
