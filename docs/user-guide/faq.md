# Frequently Asked Questions (FAQ)

## General

### What is FairWins?

FairWins is a peer-to-peer wager app. You and a friend agree on a bet, both
stakes are locked in a smart-contract escrow on Polygon, and the wager is
settled by whoever you both chose to trust up front: yourselves, a neutral
arbitrator, or an external oracle (Polymarket, Chainlink, UMA).

### Is this a prediction market or a casino?

Neither. There is no order book, no liquidity pool, no odds-setting house, and
no trading. Every wager is a private 1-v-1 agreement; FairWins just holds the
stakes and pays the winner. You can't bet "against the market" — only against
a specific person who accepts your wager.

### Who is the counterparty?

Always a specific person — usually someone you shared a QR code or link with.
FairWins never takes the other side of a bet.

### What does it cost?

- A **membership tier** (Bronze → Platinum, priced in USDC) is required to
  create and accept wagers, and sets your monthly/concurrent wager limits.
- **Gas** on Polygon (paid in POL, typically a few cents per action).
- There is no rake on the pot itself — the winner claims both stakes in full.

## Getting set up

### Which wallets are supported?

MetaMask (browser) and anything that speaks WalletConnect (mobile wallets).

### Which networks does it run on?

Polygon mainnet (chain 137) is production. Polygon Amoy (chain 80002) is the
testnet, reachable from the toggle in the wallet menu if you want to practice
with test funds.

### What tokens do I need?

POL for gas and USDC for stakes and membership. The Account Center's **Swap**
tab can convert between them via Uniswap.

## Wagers

### What kinds of wagers can I make?

Anything with a binary outcome between two people: even-money (equal stakes)
or an **Offer** (asymmetric stakes at odds you set, where the side that settles
puts up the majority stake). You pick who settles — you (**Me**), your opponent
(**Them**), a neutral **Friend** (arbitrator), or an **Oracle** (Polymarket /
Chainlink Data Feed / Chainlink Functions / UMA).

### What happens to my stake when I create a wager?

It transfers into the `WagerRegistry` escrow contract immediately. If nobody
accepts before the acceptance deadline, you reclaim it. Once accepted, both
stakes stay in escrow until the wager resolves, draws, or times out.

### Can a wager end in a tie?

Yes. For participant-resolved wagers, both parties can consent to a **draw**
(or the arbitrator can declare one), and each side gets its own stake back.

### What if the other person never resolves the wager?

After the resolve deadline passes, either party can trigger a refund — both
stakes go back to their owners. Money can't get stuck.

### What if I picked an oracle and it never reports?

Same refund path: once the resolve deadline passes unresolved, either party
reclaims their stake.

### Can the loser refuse to pay?

No — that's the point. Both stakes are already in escrow, and the contract
pays the winner directly when the wager resolves.

### Can I cancel a wager?

You can cancel your own wager any time *before* it's accepted (and the invitee
can decline it). After acceptance, there's no unilateral cancel — only
resolution, mutual draw, or the deadline-based refund.

## Privacy

### Who can see my wager?

The on-chain record (addresses, stakes, deadlines, status) is public, like all
blockchain data. The **terms** of the wager can be end-to-end encrypted: the
chain stores only a hash and an IPFS pointer, and only the participants (plus
the arbitrator, if any) hold keys to decrypt the content. See
[Private Wager Encryption](private-market-encryption.md).

### What's the encryption key in the Security tab for?

It's your published public key (registered on-chain in `KeyRegistry`) that
lets friends encrypt wager terms so only you can read them. Registering it is
optional but required to participate in encrypted wagers.

## Trust and safety

### Can FairWins take my money?

No. Operators hold two narrowly-scoped powers — a **Guardian** can pause the
protocol, and an **Account Moderator** can freeze a specific account for cause
— but neither can move escrowed stakes or redirect payouts. See the
[Account Moderation Policy](../system-overview/account-moderation.md) and
[Security Model](../system-overview/security.md).

### Why was my transaction blocked?

Wager creation and acceptance screen both addresses against the Chainalysis
sanctions oracle (plus an operator deny list). Sanctioned addresses cannot
participate.

### Are the contracts audited and tested?

The contract suite runs a security pipeline of unit tests, Slither static
analysis, and Medusa fuzzing on every change — see
[Security Testing](../security/index.md). Deployed addresses are recorded in
the repository's `deployments/` directory so you can verify what you're
interacting with.

### Is wagering legal where I live?

That's on you. The app presents an eligibility notice and the
[Terms](https://fairwins.app/terms) and [Risk Disclosure](https://fairwins.app/risk)
before entry — make sure peer-to-peer wagering is lawful in your jurisdiction
before using it.

## Troubleshooting

### The accept link shows a wager but the Accept button is disabled

Check, in order: your wallet is connected, you're on the right network (the
banner offers a one-click switch), the acceptance deadline hasn't passed, you
have an active membership, and you hold enough USDC for the stake plus a
little POL for gas.

### The QR scanner can't see my camera

Grant camera permission to fairwins.app in your browser. On iOS, the scanner
requires Safari's camera permission for the site.

### My wager disappeared from the dashboard

Check the **History** tab of My Wagers — resolved, declined, expired, and
refunded wagers move there.

### Where can I get more help?

Open an issue on
[GitHub](https://github.com/chippr-robotics/prediction-dao-research/issues).
