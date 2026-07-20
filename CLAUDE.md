# FairWins / Prediction DAO — Agent Guide

FairWins is a peer-to-peer wager management layer: smart contracts that escrow
stakes and resolve wagers from external oracles (Polymarket, Chainlink, UMA),
plus a React frontend and a subgraph for indexing.

## Spec-driven development (Spec Kit)

This repo uses [Spec Kit](https://github.com/github/spec-kit) to add features in a
repeatable way. Use the `speckit-*` skills:

1. `/speckit-constitution` — review/update the project standards
2. `/speckit-specify` — capture *what* and *why* (no tech choices yet)
3. `/speckit-clarify` — de-risk ambiguities (optional, before planning)
4. `/speckit-plan` — design the implementation against the chosen stack
5. `/speckit-tasks` — break the plan into ordered, actionable tasks
6. `/speckit-analyze` — cross-check spec/plan/tasks consistency (optional)
7. `/speckit-implement` — execute the tasks

The binding standards live in `.specify/memory/constitution.md`. Every plan must
pass a constitution check; read it before planning or implementing. Per-feature
artifacts live under `specs/<feature>/`.

## Repository map

- `contracts/` — active Solidity (wagers, oracles, access, privacy). `mocks/` is
  test-only. `contracts-archive/` is reference-only; never import or deploy it.
- `test/` — Hardhat tests: unit (`*.test.js`), `integration/`, `fork/`, `oracles/`.
- `frontend/` — React + Vite app, tested with Vitest.
- `subgraph/` — The Graph indexing.
- `scripts/` — deploy, ops, and frontend-contract sync utilities.
- `deployments/` — recorded on-chain addresses (source of truth).

## Common commands

- `npm run compile` / `npm test` — compile and run the contract suite
- `npm run test:fork` / `npm run test:coverage` — fork tests / coverage
- `npm run test:frontend` — frontend tests
- `npm run frontend` — run the frontend dev server
- `npm run sync:frontend-contracts` — regenerate frontend contract artifacts

## Guardrails

- Security-first: contract changes follow checks-effects-interactions, pass
  Slither/Medusa, and get a security review (`.github/agents/`).
- Never commit secrets or private keys; admin keys use the floppy keystore flow.
- CI fails loudly — don't add `continue-on-error` to lint/test/build/security.
- **Upgradeable contracts (UUPS, specs 025 + 027):** both `WagerRegistry` (spec 025)
  and `MembershipManager` (spec 027) are **UUPS proxies at stable addresses** — logic
  is swappable, state is preserved. New upgradeable
  contracts MUST inherit `contracts/upgradeable/UUPSManaged.sol` (do not re-roll
  the proxy/auth wiring), replace the constructor with a one-time `initialize`
  (move any inline state initializers into it), and keep storage **append-only**
  with a trailing `__gap` (never insert/reorder/remove existing state). Run
  `npm run check:storage-layout` (gating in CI) before any upgrade; ship logic
  changes as in-place upgrades (`scripts/deploy/lib/upgradeable.js`), never a
  fresh redeploy. `deployments/` records each proxy (`wagerRegistry`,
  `membershipManager`) and its current implementation (`wagerRegistryImpl`,
  `membershipManagerImpl`). Spec 026's voucher redemption ships as the first
  in-place upgrade of the `membershipManager` proxy. See
  `docs/developer-guide/upgradeable-contracts.md` and
  `docs/runbooks/contract-upgrades.md`.
- **Active wager contract is `wagerRegistry` (v2 `WagerRegistry` ABI/events:
  `WagerCreated`/`WagerAccepted`/`PayoutClaimed`/`WagerRefunded`/`WagerCancelled`/
  `WagerDrawn`).** The v1 `FriendGroupMarketFactory` (events `MarketCreatedPending`/
  `ParticipantAccepted`/`WinningsClaimed`/`StakeRefunded`) is **legacy** — no live
  network configures its address. New/active code MUST resolve the escrow via
  `getContractAddressForChain('wagerRegistry', chainId)` and read `WagerRegistry`
  events; do not depend on `friendGroupMarketFactory` except as an explicit
  legacy fallback.
- **Gasless intents (specs 035 + 036).** The wager registry is TWO facets behind one proxy:
  `WagerRegistry` (main impl) delegatecalls unknown selectors to `WagerRegistryIntents`
  (the `…WithSig`/`…WithAuthorization` twins + relocated `batchExpireOpen`/`autoResolveFrom*`)
  because the main impl sits against the 24 KB code limit. BOTH facets MUST inherit
  `WagerRegistryCore` — the single storage-layout definition; never declare registry state
  anywhere else — and `check:storage-layout` validates the pair. In tests use
  `test/helpers/proxy.js#deployWagerRegistry` (deploys + wires both facets, returns a merged-ABI
  contract). The EIP-712 intent structs exist in THREE places that must stay byte-identical:
  the contract typehashes, `frontend/src/lib/relay/intentTypes.js`, and
  `services/relay-gateway/src/intent/intentTypes.js`. The relayer (spec 036:
  `services/relay-gateway` policy gateway + `services/oz-relayer` engine config) is optional
  infrastructure — every gasless flow keeps a self-submit fallback (never-stranded rule).
  See `docs/developer-guide/gasless-intents.md` + `docs/runbooks/relayer-operations.md`.
- **Two gasless rails.** (1) *Relayed intents* (035 + 036, above) for contract actions + EIP-3009.
  (2) *Sponsored UserOps* (**spec 050**) for passkey account-native ops (native/USDC transfers,
  controller changes, first-use deploy): a self-hosted **verifying paymaster** (EntryPoint v0.6,
  `contracts/account/FairWinsVerifyingPaymaster.sol`) reimburses the alto bundler from a
  FairWins-funded deposit, authorized per-op by a KMS-signed ERC-7677 endpoint on the **same
  relay-gateway** (`POST /v1/paymaster`, reuses screening/quotas/killswitch). This **supersedes spec
  041 FR-015** for the UserOp path (041 shipped user-paid gas). The passkey path still falls back to
  self-funded UserOps when sponsorship is unavailable; the confirm UI must disclose the fee honestly
  (sponsored vs. user-pays). See `specs/050-sponsored-paymaster/` +
  `docs/runbooks/paymaster-operations.md`.
- **Wager Pools (spec 034) are a documented exception to the "route escrow
  through `wagerRegistry`" rule.** Group wager pools are a **parallel system**: the
  `WagerPoolFactory` (UUPS proxy, deployment keys `wagerPoolFactory` /
  `wagerPoolFactoryImpl` / `poolImpl`) clones **immutable** `WagerPool`
  instances (ERC-1167). There is **no Semaphore / anonymity** — membership,
  voting, and claims are by **public wallet address** (the winner's address IS the
  claim code). Pools escrow USDC and resolve by a creator-proposed **payout matrix
  keyed by winner address** that members approve to a fraction-of-joined threshold
  — **not** via `wagerRegistry` or oracle adapters. Timing mirrors `WagerRegistry`
  so pools look/feel identical: two absolute deadlines, `acceptDeadline` +
  `resolveDeadline`, bounded/ordered by the factory (`_checkDeadlines`). They reuse
  the shared `ISanctionsGuard` + `IMembershipManager` (role `POOL_PARTICIPANT_ROLE`)
  on the real wallet (FR-021). Relayer-ready: every actor action has an EIP-712
  `…WithSig` twin (via `contracts/upgradeable/SignerIntentBase.sol`) and join is
  relayable via `joinWithAuthorization` (EIP-3009), baked into the immutable clone
  template. Resolve the factory via
  `getContractAddressForChain('wagerPoolFactory', chainId)`. Two-word nicknames are
  **client-side only, never on-chain**. Launch targets **Mordor (ETC testnet) → Polygon**
  (removing Semaphore unblocks ETC/Mordor; no Amoy in the sequence). See `specs/034-zk-wager-pools/`.
- **Callsigns (spec 054) are an OPTIONAL, Gold-tier-and-above identity primitive.** The
  `CallsignRegistry` (UUPS proxy, deployment keys `callsignRegistry` / `callsignRegistryImpl`)
  is an in-house naming registry: a member may OPTIONALLY register a `%callsign` (e.g. `%chipprbots`)
  gated on `getActiveTier(user, WAGER_PARTICIPANT_ROLE) >= Gold` (`minTier` hard-floored at Gold).
  Nothing on the value path requires a callsign — never gate a wager/pool/transfer on callsign ownership.
  Registration is ENS-style commit→reveal; the registry is **standalone** (not routed through
  `wagerRegistry`), holds no funds, and resolves identity for display/address-entry with the
  priority **address book > callsign > ENS > generated**. Resolve via
  `getContractAddressForChain('callsignRegistry', chainId)`; frontend soft-fails to raw
  addresses/ENS when it is undeployed/unreachable. Every actor action has an EIP-712 `…WithSig`
  twin (three-way struct sync: contract typehashes + `frontend/src/lib/relay/intentTypes.js` +
  `services/relay-gateway/src/intent/intentTypes.js`; domain `"FairWins CallsignRegistry"`/`"1"`).
  See `docs/developer-guide/callsigns.md` + `specs/054-callsign-registry/`.
- **Predict (spec 057) is Polymarket trading, structured exactly like Collect (055/056):** a frontend
  section + relay-gateway proxy (`services/relay-gateway/src/polymarket/`), **no contract changes**, no
  custody — the member's wallet is the only order signer. Revenue is Polymarket's **builder-code**
  program: FairWins' `bytes32` code (`0x6e03…93a3`) attaches to every order for a builder fee (default
  **50 bps taker / 0 maker**, config, capped at 100/50) + weekly rewards. **Polygon-only** (Polymarket
  runs nowhere else; the tab hides off 137). Unlike Collect's no-cost OpenSea referral, the builder fee
  is **additive** (a real taker cost) and MUST be disclosed honestly as its own line in the confirm UI —
  never hidden, never "free". Resolve nothing through `wagerRegistry`. Builder code + fee are public
  config; the CLOB API key + L2 creds are gateway-only secrets. Boot fails loudly if the fee exceeds the
  caps. See `docs/developer-guide/predict-polymarket.md` + `specs/057-predict-polymarket/`.
- **Platform fees (spec 060) have ONE source of truth: the `FeeRouter`** (UUPS proxy, deployment keys
  `feeRouter` / `feeRouterImpl`, `contracts/fees/`). Every configurable fee lives there as a
  `bytes32 serviceId` (keccak of e.g. `earn.lend`, `polymarket.taker`) with a per-service hard cap
  (wrapped services ≤ 250 bps; Polymarket keeps its spec-057 caps) — never hardcode a bps value in
  client or gateway code, and never invent a second fee-config store (the gateway stays stateless
  and only READS the router via `services/relay-gateway/src/fees/onchain.js`, env bps are fallback).
  Wrapped charging is atomic (`depositToVaultWithFee`: fee → treasury + net → ERC-4626 vault in one
  tx) and every member surface MUST disclose the live rate before signature and pass the quoted bps
  as `maxFeeBps` (members can never be charged above what they saw); zero fee ⇒ no fee line and
  byte-identical pre-060 behavior. New integrations (Lido, Polygon LST, Uniswap) REGISTER a service
  (config only) instead of building their own fee path. `FEE_ADMIN_ROLE` edits rates from the
  AdminPanel Fees tab; history = `FeeBpsChanged` events. See
  `docs/developer-guide/platform-fees.md` + `docs/runbooks/fee-operations.md` + `specs/060-platform-fee-wrapper/`.
- **Bitcoin (spec 061) is the FIRST NON-EVM network — portfolio/send/receive ONLY.** Bitcoin
  networks are STRING ids (`'bitcoin'`, `'bitcoin-testnet'` = testnet4) in
  `frontend/src/config/bitcoinNetworks.js`, parallel to (never inside) the numeric `NETWORKS`
  map — never assign Bitcoin a numeric chainId and never pass its ids to
  `getContractAddressForChain`/wagmi/subgraph code (guard boundaries with `isBitcoinNetworkId`).
  Keys derive client-side from the spec-041 passkey master seed per
  `specs/061-bitcoin-transactions/contracts/key-derivation-btc.md` — those constants
  (HKDF info `fairwins-btc-seed-v1`, BIP84/BIP86 paths) are **wallet-breaking** if changed;
  key material/xpubs never leave the client (gateway sees bare addresses + signed raw txs only).
  Receive addresses ROTATE (never reissued; gap-limit-20 discovery rebuilds on recovery; cursor
  never decreases). Stamps handling is FAIL-SAFE: a UTXO is spendable only when positively
  verified stamp-free — degraded recognition ⇒ protected, never spent. Fee quotes expire (60s)
  and the member-confirmed fee is a hard signing ceiling (`FeeOverrunError`); BTC sends are
  NEVER gasless and the confirm UI must say the member pays the network fee. The gateway module
  (`services/relay-gateway/src/bitcoin/`, `BTC_*` env) is optional — unset/disabled ⇒ every
  Bitcoin surface hides/degrades honestly. See `docs/developer-guide/bitcoin.md` +
  `docs/runbooks/bitcoin-operations.md` + `specs/061-bitcoin-transactions/`.

<!-- SPECKIT START -->
For additional context about technologies to be used, project structure,
shell commands, and other important information, read the current plan
at specs/061-bitcoin-transactions/plan.md
<!-- SPECKIT END -->
