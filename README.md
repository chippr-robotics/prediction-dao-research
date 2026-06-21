# FairWins — P2P Wager Management Layer

> Smart-contract escrow for peer-to-peer wagers, resolved by the participants
> or by external oracles. Live on Polygon mainnet at [fairwins.app](https://fairwins.app).

FairWins is **not** a prediction market. It's a wager management layer that
enables friends to create private 1-v-1 wagers whose stakes are locked in
escrow and whose outcomes are settled by whoever the parties agreed to trust:
themselves, a neutral arbitrator, or trusted external sources like Polymarket,
Chainlink, and UMA's optimistic oracle.

📖 **Full documentation:** [docs/](docs/index.md) (MkDocs site — user guide,
architecture, contract reference)

## Key Insight

Rather than compete with established prediction markets, FairWins
**leverages** them. When you and a friend want to bet on whether Bitcoin will
hit $100k, FairWins handles the stake escrow and payout — while the actual
outcome is determined by battle-tested oracles.

## Features

### Eight resolution types

| Type | Settled by |
|------|-----------|
| `Either` / `Creator` / `Opponent` | The participants themselves |
| `ThirdParty` | A neutral arbitrator named at creation |
| `Polymarket` | A linked Polymarket CTF condition |
| `ChainlinkDataFeed` | A price feed threshold (GT/GTE/LT/LTE/EQ) |
| `ChainlinkFunctions` | A custom off-chain computation via the DON |
| `UMA` | An Optimistic Oracle V3 assertion |

### Wager mechanics

- **1v1 even-money or Make an Offer odds** — equal stakes, or asymmetric stakes
  at a creator-set multiplier where the settler puts up the majority stake
- **Open challenges** — post a wager with no named opponent, gated by a
  four-word claim code; whoever you share the code with can take the other side
  (Silver+ to create, any active tier to take)
- **QR / deep-link sharing** — the opponent scans a code and accepts in-app
- **Mutual draws** — both parties (or the arbitrator) can settle a push; each
  side gets its own stake back
- **End-to-end encrypted terms** — envelope encryption (X-Wing post-quantum
  hybrid KEM) with keys published in an on-chain `KeyRegistry`; ciphertext on
  IPFS, only a hash on-chain

### Safety mechanisms

- **Stake escrow** — both stakes locked in `WagerRegistry` until resolution
- **Refund paths everywhere** — expired offers, declined wagers, and wagers
  whose resolve deadline passes unresolved all return stakes to their owners;
  funds can never get stuck
- **Pull-based payouts** — the winner claims the pot; claims can't be redirected
- **Sanctions screening** — `SanctionsGuard` checks the Chainalysis oracle on
  every create and accept

### Roles, tiers, and operator powers

Wager participation requires a paid **Wager Participant** membership on
`MembershipManager` (the default tier is **None** — no participation). The
four-tier ladder is anchored at **$2 Bronze** in USDC:

| Tier | Price | Wagers / month | Open wagers at once |
|------|-------|----------------|---------------------|
| None     | —    | 0         | 0         |
| Bronze   | $2   | 15        | 5         |
| Silver   | $8   | 30        | 10        |
| Gold     | $25  | 100       | 30        |
| Platinum | $100 | Unlimited | Unlimited |

A membership can be **bought directly** (soulbound) or acquired by **redeeming
a `MembershipVoucher`** — a transferable ERC-721 bought with USDC at a tier's
price that can be gifted or resold, then redeemed (burned) for the soulbound
membership.

The operator team retains a narrow set of on-chain powers, each bound to a
distinct OpenZeppelin AccessControl role:

- `GUARDIAN_ROLE` — emergency pause of WagerRegistry (security incidents).
- `ACCOUNT_MODERATOR_ROLE` — per-account freeze / unfreeze. A frozen account
  cannot create, accept, settle, claim, or refund on the registry. See the
  [Account Moderation Policy](docs/system-overview/account-moderation.md)
  for full disclosure.
- `ROLE_MANAGER_ROLE` — grant / revoke memberships outside the purchase
  flow (support, gifts, dispute resolution).
- `UPGRADER_ROLE` — authorize UUPS implementation upgrades on the proxies
  (logic swaps at stable addresses; no other privilege).
- `DEFAULT_ADMIN_ROLE` — tier config, treasury, and authority to grant the
  roles above.

See [Roles and Tiers](docs/system-overview/roles-and-tiers.md) for the full
privilege matrix. No role can move escrowed stakes.

## Architecture

```
┌──────────────────────────────────────────────────────────────┐
│                        WagerRegistry                         │
│   create · accept · declareWinner · draw · claim · refund    │
└───────┬──────────────┬───────────────────────┬───────────────┘
        │              │                       │
        ▼              ▼                       ▼
┌───────────────┐ ┌──────────────┐  ┌─────────────────────────┐
│ Membership    │ │ Sanctions    │  │     Oracle adapters     │
│ Manager       │ │ Guard        │  │ (IOracleAdapter)        │
│ tiers, limits │ │ Chainalysis  │  │ Polymarket · Chainlink  │
└───────────────┘ └──────────────┘  │ DataFeed · Functions ·  │
                                    │ UMA OOv3                │
┌───────────────┐  ┌──────────────┐ └─────────────────────────┘
│ KeyRegistry   │  │ Membership   │  public keys (privacy) +
│ (privacy)     │  │ Voucher      │  transferable ERC-721 voucher
└───────────────┘  └──────────────┘  redeemed via MembershipManager
```

`WagerRegistry` and `MembershipManager` are UUPS-upgradeable behind stable
proxy addresses — logic is swappable in place while escrowed state is
preserved (see [ADR 004](docs/adr/004-upgradeable-registry-uups.md)). The
`MembershipVoucher` ERC-721 is the deliberate exception: a tradable bearer
asset is kept immutable.

Frontend: React + Vite SPA (no backend) served by nginx on Cloud Run behind
Cloudflare. Deployed addresses are recorded in [`deployments/`](deployments/).
The testnets — Polygon Amoy (80002) and Mordor/ETC (63) — run the
feature-complete upgradeable set; Polygon mainnet (137) is still the pre-UUPS
set pending migration. Full picture:
[Architecture guide](docs/developer-guide/architecture.md).

## Quick Start

### Installation

```bash
npm install
npm run compile
```

### Run Tests

```bash
npm test                # contract suite
npm run test:fork       # fork tests
npm run test:coverage   # coverage
npm run test:frontend   # frontend (Vitest)
```

### Run the app locally

```bash
npm run frontend
```

### Wager lifecycle (contract level)

```solidity
// Creator escrows their stake and defines the wager
uint256 id = registry.createWager(
    opponent, arbitrator, usdc,
    creatorStake, opponentStake,
    acceptDeadline, resolveDeadline,
    ResolutionType.Polymarket,
    polymarketConditionId, /* creatorIsYes */ true,
    metadataHash, "ipfs://<cid>"
);

// Opponent escrows their stake
registry.acceptWager(id);

// After the linked Polymarket market settles, anyone can trigger resolution
registry.autoResolveFromPolymarket(id);

// Winner pulls the full pot
registry.claimPayout(id);

// — or, if it never resolved by the deadline, either party gets made whole
registry.claimRefund(id);
```

### Adding a new oracle adapter

1. Implement the `IOracleAdapter` interface
2. Wire it into `WagerRegistry`'s adapter slot for its resolution type
3. Write tests (unit + fork) and update the docs

```solidity
contract MyOracleAdapter is IOracleAdapter {
    function isConditionResolved(bytes32 conditionId) external view returns (bool);
    function getOutcome(bytes32 conditionId) external view returns (
        bool outcome, uint256 confidence, uint256 resolvedAt
    );
    function getConditionMetadata(bytes32 conditionId) external view returns (
        string memory description, uint256 expectedResolutionTime
    );
}
```

## Contracts

| Contract | Location | Description |
|----------|----------|-------------|
| `WagerRegistry` | `contracts/wagers/` | Wager lifecycle + stake escrow, incl. open challenges (UUPS proxy) |
| `MembershipManager` | `contracts/access/` | Tiered memberships, rate limits, voucher redemption (UUPS proxy) |
| `MembershipVoucher` | `contracts/access/` | Transferable ERC-721 voucher → soulbound membership (immutable) |
| `SanctionsGuard` | `contracts/access/` | Chainalysis screening + deny list |
| `KeyRegistry` | `contracts/privacy/` | Encryption public keys |
| `PolymarketOracleAdapter` | `contracts/oracles/` | Polymarket CTF outcomes |
| `ChainlinkDataFeedOracleAdapter` | `contracts/oracles/` | Price-threshold conditions |
| `ChainlinkFunctionsOracleAdapter` | `contracts/oracles/` | Custom DON computations |
| `UMAOptimisticOracleV3Adapter` | `contracts/oracles/` | Optimistic assertions |

`contracts-archive/` holds superseded research (governance, conditional-token
markets, friend-group factories) — reference only, never deploy.

Details: [Smart Contracts guide](docs/developer-guide/smart-contracts.md).

## Why Not Build a Prediction Market?

Prediction markets are hard:

1. **Liquidity** — Need market makers and deep order books
2. **Oracles** — Need reliable resolution for every market
3. **Regulation** — Complex legal landscape
4. **Competition** — Polymarket, Kalshi, etc. already exist

FairWins sidesteps these by:

1. **No liquidity needed** — Fixed stakes, no AMM required
2. **Leverage existing oracles** — Polymarket, Chainlink, UMA do the hard work
3. **P2P focus** — Friends betting with friends
4. **Complementary** — Use alongside prediction markets, not instead of

## Development

This repo uses [Spec Kit](https://github.com/github/spec-kit) for spec-driven
feature development — see [CLAUDE.md](CLAUDE.md) and the binding standards in
`.specify/memory/constitution.md`. Contract changes must follow
checks-effects-interactions and pass Slither/Medusa in CI.

## License

Apache License 2.0

## Contributing

1. Fork the repository
2. Create a feature branch
3. Add tests for new functionality
4. Submit a pull request

## Security

For security concerns, please email security@fairwins.app
