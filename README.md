# FairWins — Multi-Chain Financial Platform

> A self-custody **financial control plane**: payments, peer-to-peer wagers,
> prediction markets, collectibles, earning, swaps, bridging, Bitcoin, and
> multisig custody — one app, many chains, and the member holds the keys the
> whole time. Live at [fairwins.app](https://fairwins.app).

FairWins began as a peer-to-peer wager management layer. It has grown into a
multi-chain platform where the wager escrow sits beside a full financial
surface — while keeping the property it started with: **the platform never
takes custody of member funds.** Every value-bearing action is signed by the
member's own wallet (passkey smart account, browser/mobile wallet, or Safe
multisig vault) against audited, deterministic-deployed contracts.

📖 **Full documentation:** [docs/](docs/index.md) (MkDocs site — user guide,
architecture, contract reference, runbooks)

## The platform

| Surface | What it does | Where |
|---------|--------------|-------|
| **Transfer** | Pay/request USDC like a payments app — QR codes, address book, gasless sends (EIP-3009 + relayer, spec 035/036) | All EVM networks |
| **Wagers** | 1v1 wagers, open challenges, and group pools with smart-contract escrow and oracle/participant resolution | Polygon, Mordor/ETC |
| **Predict** | Trade real Polymarket prediction markets, member wallet signs every order (spec 057) | Polygon |
| **Collect** | NFT portfolio with live floors; list/sell via OpenSea (specs 055/056) | EVM mainnets |
| **Earn** | Third-party lending vaults, liquid staking, supplied liquidity (specs 050/065/067) | Per-network |
| **Swap** | DEX trading through the right venue per chain — Uniswap / ETCswap (spec 033) | Per-network |
| **Bridge** | Cross-chain transfers via Across; unfilled deposits refund to the member (spec 067) | EVM mainnets |
| **Bitcoin** | Native BTC wallet beside the EVM accounts — client-side keys, rotating addresses (spec 061) | Bitcoin |
| **Protect** | Safe multisig custody vaults with an on-chain policy engine (specs 043/049/068) | Multi-chain |
| **Recovery** | Encrypted backup/sync, legacy key recovery, asset sweeps (specs 032/062) | Client-side |
| **ClearPath / Token Mint** | External DAO connections and token issuance (specs 028/030) | Per-network |

An **operations console** (spec 071) gives operators estate-wide reads across
every chain — membership, fees, treasury, pauses — with honest
`read / not-deployed / unreadable` states and single-chain writes.

## White-label multi-tenant (spec 072)

FairWins is one tenant of its own platform. A **tenant manifest**
(`tenants/<id>/manifest.json`) defines an instance's identity (brand, theme,
domains), settings (features, chains, tiers, fees), and contract set:

- **Branding-only tenants** front the shared contract estate under their own
  domain and brand.
- **Dedicated tenants** get an isolated on-chain estate: tenant-salted CREATE2
  deployments of the same audited contracts, recorded under
  `deployments/tenants/<id>/`, with their own membership base, fee router,
  treasury, and admin keys. Isolation is enforced by separate contract
  instances — never by a frontend filter.

See `docs/developer-guide/white-label-tenants.md` and
`docs/runbooks/tenant-operations.md`.

## The wager layer

The original core, still central: private 1-v-1 wagers whose stakes are locked
in escrow and settled by whoever the parties agreed to trust — themselves, a
neutral arbitrator, or external oracles (Polymarket, Chainlink, UMA).

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
- **Group pools** — multi-party wager pools resolved by a member-approved
  payout matrix (spec 034)
- **QR / deep-link sharing** — the opponent scans a code and accepts in-app
- **Mutual draws** — both parties (or the arbitrator) can settle a push
- **End-to-end encrypted terms** — envelope encryption (X-Wing post-quantum
  hybrid KEM) with keys published in an on-chain `KeyRegistry`

### Safety mechanisms

- **Stake escrow** — both stakes locked in `WagerRegistry` until resolution
- **Refund paths everywhere** — expired offers, declined wagers, and wagers
  whose resolve deadline passes unresolved all return stakes; funds can never
  get stuck
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
a `MembershipVoucher`** — a transferable ERC-721 that is burned for the
soulbound membership. Membership lives on one reference chain per environment
(spec 071) and follows the member across networks.

The operator team retains a narrow set of on-chain powers, each bound to a
distinct OpenZeppelin AccessControl role (`GUARDIAN_ROLE`,
`ACCOUNT_MODERATOR_ROLE`, `ROLE_MANAGER_ROLE`, `UPGRADER_ROLE`,
`DEFAULT_ADMIN_ROLE`). See
[Roles and Tiers](docs/system-overview/roles-and-tiers.md) for the full
privilege matrix. **No role can move escrowed stakes.**

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

Around that core sit the platform contracts: `WagerPoolFactory` (group pools),
`FeeRouter` (the single fee source of truth, spec 060), `CallsignRegistry`
(optional naming, spec 054), `TokenFactory`, `StakingRouter`, `BridgeRouter` +
`LiquidityRouter` (no-custody routers, spec 067), Safe policy guards
(specs 049/068), and the ERC-4337 account stack (spec 041/050).

`WagerRegistry` and `MembershipManager` are UUPS-upgradeable behind stable
proxy addresses — logic is swappable in place while escrowed state is
preserved (see [ADR 004](docs/adr/004-upgradeable-registry-uups.md)).

Frontend: React + Vite SPA (no backend) served by nginx on Cloud Run behind
Cloudflare, one build per tenant instance. Optional services: the
relay-gateway (gasless intents + paymaster, per-tenant scoped) and subgraph.
Deployed addresses are recorded in [`deployments/`](deployments/) (shared
estate) and `deployments/tenants/<id>/` (dedicated tenant estates). Full
picture: [Architecture guide](docs/developer-guide/architecture.md).

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
npm run tenants:validate # tenant manifest validation
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

## Contracts

| Contract | Location | Description |
|----------|----------|-------------|
| `WagerRegistry` | `contracts/wagers/` | Wager lifecycle + stake escrow, incl. open challenges (UUPS proxy) |
| `WagerPoolFactory` / `WagerPool` | `contracts/pools/` | Group wager pools (factory + immutable clones) |
| `MembershipManager` | `contracts/access/` | Tiered memberships, rate limits, voucher redemption (UUPS proxy) |
| `MembershipVoucher` | `contracts/access/` | Transferable ERC-721 voucher → soulbound membership (immutable) |
| `SanctionsGuard` | `contracts/access/` | Chainalysis screening + deny list |
| `FeeRouter` | `contracts/fees/` | Single source of truth for platform fees (UUPS proxy) |
| `KeyRegistry` | `contracts/privacy/` | Encryption public keys |
| `CallsignRegistry` | `contracts/identity/` | Optional %callsign naming (UUPS proxy) |
| `BridgeRouter` / `LiquidityRouter` | `contracts/bridge/`, `contracts/liquidity/` | No-custody bridge + liquidity routers |
| `SafePolicyGuard(V2)` | `contracts/custody/` | Multisig vault policy engines (non-upgradeable by design) |
| Oracle adapters | `contracts/oracles/` | Polymarket · Chainlink DataFeed/Functions · UMA OOv3 |

`contracts-archive/` holds superseded research — reference only, never deploy.

Details: [Smart Contracts guide](docs/developer-guide/smart-contracts.md).

## Design principles

1. **Self-custody, always** — no contract or operator role can move member
   funds; escrow is pull-based and refund paths cover every timeout.
2. **Leverage, don't rebuild** — Polymarket, Chainlink, UMA, Uniswap, Across,
   OpenSea, and Safe do what they're best at; FairWins is the control plane
   that composes them under one honest UI.
3. **Honest state** — fees disclosed before signature, absence shown as
   absence, no mocked data in shipped paths (constitution III).
4. **Deterministic operations** — salted CREATE2 deployments, repo-recorded
   addresses, spec-driven development ([Spec Kit](https://github.com/github/spec-kit),
   see [CLAUDE.md](CLAUDE.md) and `.specify/memory/constitution.md`).

## License

Apache License 2.0

## Contributing

1. Fork the repository
2. Create a feature branch
3. Add tests for new functionality
4. Submit a pull request

## Security

For security concerns, please email security@fairwins.app
