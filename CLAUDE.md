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
- Only run the **full** frontend suite (`vitest run` with no filter) in CI — locally it
  OOMs this environment. Scope local runs to specific files/dirs
  (`npx vitest run src/test/foo.test.js`).

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
  contract). The EIP-712 intent structs have **ONE source since spec 075** —
  `@fairwins/intent-types` — and `frontend/src/lib/relay/intentTypes.js` and
  `services/relay-gateway/src/intent/intentTypes.js` are re-exports, not copies. Never
  reintroduce a local table: `test/intent/TypehashParity.test.js` checks the package against
  typehashes parsed out of the **contracts** (both directions — a struct the Solidity verifies
  but the package lacks fails too), and `services/relay-gateway/test/actionCoverage.test.js`
  checks the gateway's action table against it. The **domains** (`name`/`version`) are the one
  piece still hand-synced across `intentTypes.js` in both trees plus
  `frontend/src/utils/claimCode/deriveFromCode.js`, with nothing tying them to the contract that
  verifies the signature — a correct type table under a wrong domain still produces an invalid
  signature (issue #1038). The relayer (spec 036:
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
- **Perps (spec 082) is a READ-ONLY market-data surface — a view inside Trade, not a nav item.**
  `TradeSection` switches Swap (default, untouched) | Perps (`/wallet?tab=trade&view=perps`). The
  relay-gateway `perps/` module proxies three PUBLIC venue APIs — Gains Network (Arbitrum/Base/
  Polygon), GMX v2 (Arbitrum), Hyperliquid — with per-venue failure isolation: each venue resolves
  `read | degraded` independently; a degraded venue is NAMED and its pairs omitted, never rendered
  as zeros or stale-as-live, and missing metrics stay `null` → "—" (normalizer scale provenance is
  documented in `services/relay-gateway/src/perps/normalize.js`; don't "fix" scales without
  re-verifying against the venue SDK). **Hyperliquid is a non-EVM venue** (spec-061 precedent):
  string id, `chainId: null`, never passed to EVM seams (`isEvmPerpVenue` guards). **No in-app
  execution ships** (FR-018 — no order controls, positions read-only, "Manage on venue ↗"); an
  execution wrapper is a follow-up spec with its own security lifecycle. Revenue: Gains referral +
  GMX ref code are venue-paid shares (GMX even discounts the trader); ONLY the **Hyperliquid
  builder fee** is platform-priced — FeeRouter `ConfigOnly` service `perps.hyperliquid.builder`
  hard-capped at **10 bps (Hyperliquid's own limit, NOT our 250)**, env fallback boot-fails above
  it, zero ⇒ no fee line, unreadable ⇒ "could not be confirmed". Link-outs carry attribution with
  a plain-link fallback (never blocked). Module optional (`PERPS_ENABLED`) — off ⇒ 503
  `perps_unconfigured`, SPA hides the tab; testnet cohort ⇒ honest mainnet-only notice, never
  cross-cohort data. See `docs/developer-guide/perps.md` + `specs/082-perps-trade-view/`.
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
- **Protect (specs 043 + 049 + 068) runs TWO policy guards side by side, on purpose.** Custody vaults
  are Safe v1.4.1 multisigs; their optional on-chain policy is enforced by a guard singleton that is
  deliberately **NOT upgradeable** (an upgrade key over a policy guard is a backdoor across every
  vault). `SafePolicyGuard` (v1, flat rules) keeps enforcing for vaults that have not adopted
  `SafePolicyGuardV2` (spec 068, deployment key `safePolicyGuardV2`) — migration is **vault-consented**
  via a threshold-approved `setGuard`, never a release-time migration, and new rule types ship as a new
  guard version. V2 policy is an **ordered rule array** replaced atomically by `setRules` (so add/edit/
  remove/**reorder** are one proposal) evaluated **first-match-governs**, with exactly one fall-through:
  an unmet approver requirement continues to the next rule of *strictly identical scope* (this is what
  makes "A+B together, or C alone" expressible). **No matching rule ⇒ denial** — once a vault has rules,
  silence is denial. Approver sets are verified against the vault's own on-chain `approvedHashes` at
  `nonce()-1`, and an approver only counts **while still an owner**. Client seam is
  `frontend/src/lib/custody/policyV2.js`; its `matchPreview` is a twin of on-chain matching and MUST be
  changed in lockstep with the contract (the Solidity and Vitest suites share scenarios). Custody is
  **multi-chain**: vault references carry `chainId`, the list spans chains with per-vault read providers
  and failure isolation, and custody code MUST use strict `NETWORKS[chainId]` lookups (never
  `getNetwork()`, which falls back to the default network) plus a wallet-chain check at submit time.
  `safeProposalHub` needs a recorded deploy block per chain or proposal discovery is silently dead. Protect
  lives in the **Tools** nav group (tab id `custody` unchanged). See
  `docs/developer-guide/protect-policies.md` + `docs/runbooks/protect-policy-operations.md` +
  `specs/068-protect-multi-chain-policies/`.
- **Protect ▸ Verify (message signing) is FRONTEND-ONLY and has THREE verdicts, never two.**
  Members sign an arbitrary message to prove control of an account and check other people's proofs
  (`frontend/src/lib/verify/`, surfaced by `components/custody/VerifySection.jsx`). Verification
  returns `valid` / `invalid` / **`unverifiable`**. **`verifyMessage` is OFFLINE and SYNCHRONOUS —
  never give it a chain or a provider and never make it async**: checking a signature against a
  public key is arithmetic, and the type is what enforces it. The network lives in the separate
  `verifyOnChain`, offered to the member as an explicit escalation only where it could settle
  something, and it exists for one reason — a CONTRACT account has no public key, so only the
  account itself can say whether it stands behind the bytes. The ERC-1271 leg is a network read, so
  an RPC timeout is NOT a forged signature and must never render as one; a negative is reported only when
  it is knowable (ECDSA recovered someone else AND the chain says the claimed address holds no
  code, or the account contract itself said no). A mismatching ECDSA recovery is NOT promoted to a
  negative when the on-chain leg could not run — that is exactly what a legitimate smart-account
  signature looks like from outside. The message is signed and carried **verbatim** (no trimming,
  no template, no appended nonce): a member is usually answering somebody else's challenge. The
  document's `scheme` is a HINT, never authority — verification tries both legs and decides for
  itself. Signing is REFUSED while operating as a **vault** (spec 043): a Safe has no key, and
  signing anyway would prove control of the member's own account under a "vault" label. Fixtures
  live once, in `frontend/src/test/fixtures/signedMessages.js` (also imported by the capture
  harness). See `docs/developer-guide/message-signing.md` + `specs/084-message-signing-verify/`.
- **Protect ▸ Off chain (spec 085) is hardware-wallet cold storage — FRONTEND-ONLY, and the store
  holds PUBLIC METADATA ONLY** (`{ address, vendor, path, label, addedAt }` — never key material,
  never an xpub, never a device identifier beyond the vendor name). All vendor code sits behind ONE
  seam, `frontend/src/lib/hardware/adapters.js#connectHardware` — UI code never imports Ledger/Trezor
  SDKs directly (lazy-loaded, failures normalized to `HW_ERROR_CODES`, rendered via
  `describeHardwareError`, never a raw SDK message). Every signature is a physical confirmation on
  the device screen (`HardwareSigner`, which also recover-and-verifies a signed tx before broadcast);
  reconnect (`connectAccount.js`) RE-DERIVES the saved path and must match the saved address, else
  refuse. Operate-as holds the device-backed signer in CustodyContext memory only, behind the
  spec-062 chain guard. Protect's accordion section ids (`custody-onchain`/`custody-verify`/
  `custody-offchain`) double as drawer-search deep-link ids — don't rename. The
  `window.__fwHardwareTestAdapter__` seam is `import.meta.env.DEV`-guarded and dead-code-eliminated
  from production bundles. See `docs/developer-guide/hardware-wallets.md` +
  `docs/runbooks/hardware-wallet-staging-validation.md` + `specs/085-hardware-wallet-protect/`.
- **Legacy account recovery (spec 062) is FRONTEND-ONLY** — the **Recovery** section (renamed from
  "Backup & Security"; tab id `security` + `backup` alias unchanged). Members import an old EOA
  **private key** or **BIP-39 word list**; the secret is encrypted at rest (AES-GCM under a
  PBKDF2-650k passphrase key) and **NEVER** persisted in the clear, transmitted, or logged — only the
  ciphertext blob is stored/backed up. `legacyKeyVault(account)` (in
  `frontend/src/lib/recovery/legacyKeys.js`) is a per-account CRUD facade over
  `legacyRecoveredKeysStore.js` (userStorage key `legacy_recovered_keys`, the single source of truth);
  it rides the spec-032 backup via the non-network-scoped `legacyRecoveredKeys` synced object. Storing
  completes recovery; **moving funds is OPTIONAL** — `sweepAllAssets` moves ALL supported fungible
  assets (native + every `getPortfolioRegistry` ERC-20, ERC-20s first / native last with a gas
  reserve) with **per-asset outcomes** (one failure never aborts the rest; NFTs excluded + disclosed).
  Recovered accounts save to the address book via `useAddressBook()` (usable platform-wide) and the
  recovery is audited via `captureLegacyRecovery` (client-ledger `legacy_account_recovered`, address +
  type only, stable/idempotent entryId, **never** key material). See
  `docs/developer-guide/legacy-account-recovery.md` + `specs/062-legacy-account-recovery/`.
- **Bridging + supplied liquidity (spec 067) route through TWO UUPS routers that never take custody.**
  `BridgeRouter` (`bridgeRouter`/`bridgeRouterImpl`, Across Protocol V3) powers the **Bridge** tab inside
  **Transfer**; `LiquidityRouter` (`liquidityRouter`/`liquidityRouterImpl`, Uniswap V3 + Across HubPool)
  powers the **Supply** section inside **Earn**. Neither is deployed on any network yet (issue #966).
  Four rules govern every change here:
  (1) **THE MEMBER IS THE DEPOSITOR.** `depositV3` is passed `msg.sender`, never `address(this)`, so an
  unfilled Across deposit refunds to the MEMBER. That is why `IBridgeRouter` has **no rescue or
  claim-refund function** — the absence is the design, and adding one would create the custody surface
  the router exists to avoid. (2) **NO CUSTODY.** Uniswap position NFTs mint to the member; Across
  **bridge-LP deposits never touch a FairWins contract at all** (a direct member call to the HubPool —
  `addLiquidity` has no recipient parameter, research R3), so the contract *cannot* pause them and only
  the app-honoured `enabled` flag withholds one. The Supply pause is therefore **"new Uniswap supplies"
  only** — never label it "pooling". (3) **A PAUSE NEVER TRAPS VALUE**: it stops NEW bridges/supplies;
  in-flight bridges settle or refund via Across, and positions stay withdrawable because exits never
  routed through the router. There is no `removePool` — retiring is `setPoolEnabled(false)`, and retired
  pools stay listed with their position count (FR-024). (4) **FEES**: two spec-060 services
  (`bridge.transfer`, `liquidity.deposit`), both `ConfigOnly`, both **cap 250 bps / rate 0 at launch** —
  never hardcode a bps value, never imply a fee ships non-zero. The member's `maxFeeBps` is a consent
  ceiling, the cap binds the fee **amount** taken (not the rate a FeeRouter reports about itself), and
  the fee is charged on **capital Uniswap actually consumed**, never on what was offered.
  **Roles**: `LIQUIDITY_ADMIN_ROLE` curates routes/pools; `GUARDIAN_ROLE` pauses; `DEFAULT_ADMIN_ROLE`
  owns the fund-path addresses (`spokePool`/`positionManager`/`feeRouter`/`sanctionsGuard`) — curating
  badly is reversible, repointing a router is not. `GUARDIAN_ROLE` is **per-router** and does NOT inherit
  the WagerRegistry guardian set; the admin tabs read authority from the router in scope
  (`readRouterAuthority`), never from the app-wide role flags. **Availability**: Uniswap trading pools on
  all five EVM mainnets (1/10/137/8453/42161); Across **bridge-LP on ETHEREUM ONLY** (the HubPool is an
  L1 contract); ETC 61 and Mordor 63 have neither protocol and **cannot host these routers**. See
  `docs/developer-guide/bridge-and-liquidity.md` + `docs/runbooks/bridge-liquidity-operations.md` +
  `specs/067-bridge-pool-liquidity/`.

- **Membership has ONE home, and the operations console reads the whole estate (spec 071).**
  Membership lives on exactly one chain per environment cohort — Polygon on a mainnet build, Amoy on
  a testnet build — resolved by `membershipChainId()` in `config/networks.js` and **derived** from
  the existing `MAINNET_CHAIN_ID`/`TESTNET_CHAIN_ID` pair (never a second literal `137`, which would
  silently read mainnet membership in a testnet build). `hasRoleOnChain`/`getUserTierOnChain`
  **ignore the chain you pass** on the `WAGER_PARTICIPANT` path and always read the reference chain;
  their admin-role branch still honours an explicit chain, because admin roles genuinely ARE
  per-chain. Purchases settle on the reference chain too — membership is only readable from one
  place if it is also written in one place. "All chains" ALWAYS means the build's **cohort**
  (`cohortChainIds()`, never `listSupportedChainIds()`): constitution III forbids reads crossing the
  testnet/mainnet boundary. Every estate read returns one of **three** states —
  `read` / `not-deployed` / `unreadable` — and `value` exists only on `read` so `?? 0` has nowhere
  to live; an unreachable chain must NEVER render as a zero, and any total missing one is labelled
  partial and names it. Balances are **never summed across units** (`aggregate()` returns per-unit
  subtotals only), and accrued (undrawn) is never added to treasury (received). Reads span chains;
  **writes never do**: one transaction, one named chain, wallet required there, authority read from
  the contract that will enforce it — and an *unconfirmed* authority read leaves the control offered
  rather than hiding a killswitch on an RPC timeout. There is deliberately **no control that acts on
  several chains at once**. Providers come from `getReadProvider`/`readProviderFor`, never
  hand-built from `NETWORKS[chainId].rpcUrl`. See `docs/developer-guide/chain-estate-reads.md` +
  `specs/071-multi-chain-admin-console/`.
- **White-label tenants (spec 072): the tenant manifest is the single source of truth.**
  `tenants/<id>/manifest.json` defines a tenant's identity, settings, and contract set;
  `tenants/fairwins/` is the default tenant and MUST reproduce the current product exactly.
  Never hardcode a tenant identity value (name, logo, URL, PWA metadata, support/legal links)
  in shipped paths — resolve via `frontend/src/config/tenant.js` (`tenantBrand()`,
  `isFeatureEnabled()`, `tenantThemeClass()`). Tenant selection is BUILD-TIME
  (`VITE_TENANT_ID`, one origin = one tenant, no runtime switching); an unknown id fails
  loudly and never falls back to another tenant. Theming rides the existing `platform-<id>`
  CSS class seam (default tokens stay in `theme.css`; non-default tenants inject from the
  manifest). Isolation for value is ON-CHAIN via separate proxy instances: `TENANT_ID=<id>`
  on deploy scripts tenant-prefixes CREATE2 salts and records under
  `deployments/tenants/<id>/` (same schema); a dedicated tenant resolves ONLY its own set —
  absence stays absence, no fallback to the shared estate. Manifests never contain secrets;
  `npm run tenants:validate` gates in CI. See `docs/developer-guide/white-label-tenants.md`
  + `specs/072-white-label-tenants/`.
- **Mini-apps (spec 073) are UNTRUSTED third-party code, and the host object is the whole of what
  they get.** The Apps section serves packages published to IPFS and curated on-chain by the
  `MiniAppRegistry` (UUPS proxy, keys `miniAppRegistry` / `miniAppRegistryImpl`). Five rules:
  (1) **`launchable` IS the serving decision, NEVER `status`.** A Pending record with a prior
  approval is a LIVE app whose update is in review (FR-003); gating on `status === Approved` would
  let any vendor take their own app offline by submitting anything. `registryClient.normalizeApp`
  READS the chain's `launchable` — never re-derive it. Approval is **content-committed**:
  `approveApp(id, expectedManifestHash)` reverts `StaleProposal`, because reading the proposed tuple
  at execution time let a vendor swap the package after review. **Never add an id-only overload.**
  (2) **The registry has ONE home per cohort** — `miniAppChainId()`: **Polygon 137** on a mainnet
  build, **Mordor 63** on a testnet one. Deployment targets are **Polygon and Mordor ONLY; Amoy is
  deliberately not one**, which is why this is the one reference chain in the estate that does NOT
  derive from `TESTNET_CHAIN_ID` (that would resolve every testnet build to a chain with no
  registry). Never hardcode `137`: the catalog decides which packages the host EXECUTES, so
  crossing the cohort boundary would run mainnet-curated code against testnet wallets.
  (3) **The `host` object is the ENTIRE privileged surface** (`contracts/host-context.md`, hostApi
  **2**): `appId`, `wallet` (`address`, `chainId`, `isConnected`, `requestConnect`, `switchChain`,
  `submit`), `readProvider`, `contracts`, `network`, `networks`, `store`, `audit`, `toast`,
  `navigate`. Wrappers, never handles — no signer, no context, no storage handle, and adding a key
  grants it permanently to every third-party package. `wallet.submit` chooses the write rail
  (classic signer vs passkey `sendCalls`) because an app cannot: identity first, so a passkey member
  acting as a vault still gets a PROPOSAL. **Sanctions screening happens INSIDE `submit`**, before
  any rail is touched — strictly stronger than an app-side pre-check, which a package could simply
  skip. It resolves at **BROADCAST** — use `SubmitResult.wait()`, never report success from `submit`
  alone, and note `wait()` takes NO timeout where `tx.wait(1, ms)` did, so each app must race its
  own. `contracts(name)` is gated by a per-package manifest allowlist and **throws** for an
  undeclared name (returning `null` would read as "not deployed"). `readProvider` is cached per
  underlying provider — it must keep a STABLE identity, or any app using it as an effect dependency
  spins.
  (4) **Never bundle host config into a package.** `config/contracts.js` reaches `virtual:tenant`
  (a hard build failure), and the preset's `envPrefix` turns any bundled `import.meta.env` read into
  `undefined` — a bundled `NETWORKS` would report every subgraph as absent, which is a fabricated
  fact, not an outage. Packages take configuration from the host at runtime. Equally: **nothing in
  `frontend/miniapps/` may import from `frontend/src/`** — a package is built separately, frozen at
  an immutable CID, and a bundled copy of a React context is a DIFFERENT context. The reverse also
  holds and is the direction that actually broke: **nothing in `frontend/src/` may import a tree
  that was converted into a package.** Both are gated by
  `frontend/src/test/miniapps/packageBoundary.test.js` — a scoped vitest run cannot catch a stale
  import, because the module simply never loads; only the full suite or a build will.
  (5) **`blob:` in `script-src` is for mini-app packages ONLY** — verified bytes are imported from a
  Blob URL (R1). Never add `https:` to `script-src`. The SW package cache
  (`fairwins-miniapp-packages-v1`) is cache-first because CIDs are immutable, and is **not a trust
  boundary**: after every retrieval, cache or network, the loader re-checks keccak(manifest bytes)
  against the chain and the sha256 of **every byte it executes or injects** — the entry and the
  declared stylesheets. It does NOT fetch files it will not use (`verifyAllDeclaredFiles` is off for
  a launch, on for a curator review), so do not restate this as "every file in the manifest": the
  invariant is that nothing unverified ever runs, not that everything declared is downloaded.
  **Converted apps: Token Mint and ClearPath ONLY** (live on Polygon 137 and Mordor 63; ids are
  per-registry and differ per chain — resolve by `idByName`/slug, never by id across cohorts).
  **Wagers is deliberately NOT a mini-app and must not be converted** — most of its file closure
  is shared with the host-retained `HomeScreen`/Trade surfaces, because
  `HomeScreen` is itself a wager surface, so a package would mean two copies of `WagerTable`/
  `wagerVm`/`wagerCardHelpers` drifting apart. It lives at **Finance ▸ Transfer ▸ Wagers**
  (`WAGERS_VIEW`/`WAGERS_PATH` in `config/appNav.js`, rendered by `PayTransferPanel`); `/wagers`
  redirects there. See the FR-030 amendment in `specs/073-miniapp-platform/spec.md`.
  See `docs/developer-guide/miniapps.md` + `docs/runbooks/miniapp-registry-operations.md` +
  `specs/073-miniapp-platform/`.
- **The nav drawer's height is BOUNDED BY DESIGN (spec 081), and the rail it uses is shared.**
  `components/ui/PortalNav.jsx` renders the Admin Panel's and My Account's rails as well as the
  drawer, so the accordion behaviour is **opt-in via `collapsibleGroups`** — absent, the component
  MUST take the exact render path those surfaces have always taken (a presentational `<span>`
  heading, no buttons, nothing collapsed; gated by `src/test/PortalNav.test.jsx`). A collapsed
  section is **UNMOUNTED, not `display:none`** — a heading claiming `aria-expanded="false"` over
  rows still in the DOM and the tab order is claiming something untrue, so a test asserting on a
  folded section's item must open it first. Section headings are named **`"<label> section"`**
  because a group and one of its items can share a name (Tools holds an item called "Apps").
  Expansion precedence is **filter > active section > stored**, and neither override is ever
  written back — folding Tools while sitting on Recovery must survive leaving it. Pinned mini-apps
  are ONE capped strip (`VISIBLE_PINNED_CAP = 5`), never rows again: the drawer's height with 5
  pins and with 50 must be identical, and the "Show all N (+K)" control sits BELOW the scrolling
  row (inside it, the one element that discloses hidden pins was itself the first scrolled out of
  view). Tiles show the catalog's own `artworkFor(slug)` (spec 077) — no new icon field on the
  registry record, the manifest, or the host object. `nav_sections` + `nav_density` are
  device-scoped in `fw_global_prefs` and **deliberately absent from
  `lib/backup/syncedObjects.js`** (a test asserts it); section keys are DERIVED from group labels,
  so a renamed or hidden group needs no migration. Compact density (a Settings card) is one class on the drawer root
  with **every** compact rule scoped under it in `AppNavDrawer.css` — never in `PortalNav.css`,
  which the other two rails read — with a hard 36×36 CSS px floor per interactive target. Note
  `src/index.css` carries a global `button { padding: 0.6em 1.2em }`: new drawer button classes
  MUST be written `.app-nav-drawer .<class>` or their content box silently collapses. The Apps
  group is GONE — the catalog entry lives in **Tools** (tab id `apps` and `/apps/<slug>`
  unchanged). The desktop 64px gutter renders none of this. See
  `docs/developer-guide/nav-drawer.md` + `specs/081-nav-drawer-density/`.
- **The drawer's search field searches the APP, and `config/navSearchIndex.js` is what makes that
  true.** Members type protocol names, not menu labels: "morpho" is Earn ▸ Lend, "opensea" is
  Collect, "bip39" is a card inside Recovery, "rpc" is a tab that is deliberately not in this menu
  at all. The index tags each nav item with synonyms and names the destinations inside it; matching
  (`lib/nav/navSearch.js`) ANDs the terms and matches each as a TOKEN PREFIX, so never hand-write
  stems. Four rules: (1) the index is **descriptive, never authoritative** — the drawer filters
  items for tenant/chain FIRST and consults the index per surviving item, so an entry can never
  resurrect a surface the app has hidden; (2) Settings/Network/Membership/Account join results
  **only while a filter is active** and leave with it — the resting drawer's bounded height (spec
  081) is unchanged; (3) a destination's `id` IS its `data-attention` marker, and a shortcut
  deep-links with `focus=<id>` so the surface flashes on arrival (`lib/nav/attention.js`, mounted
  once as `AttentionFocus` in App.jsx) — a marker is optional and its absence degrades to a plain
  navigation, never to a broken link; (4) `navId` must be a real nav item / WalletPage tab id, which
  `src/test/nav/navSearchIndex.test.jsx` enforces. Accordion cards additionally carry `hash`, and
  `accordionSectionForHash` is the ONE place a `#card` deep link resolves to an OPEN card — for
  Settings and Recovery alike; do not add a second hash→section map. See
  `docs/developer-guide/nav-search.md`.
- **RPC endpoints belong to the MEMBER (spec 069), and network settings live in the user panel.**
  The `network` tab moved off the Tools nav group onto the account button beside Preferences (tab id +
  `/wallet?tab=network` unchanged); `NAV_GROUPS` must not carry it again. Endpoint resolution has ONE
  implementation — `frontend/src/lib/network/rpcEndpoints.js#resolveRpcEndpoints`, precedence
  **member override → build default** (`NETWORKS[chainId].rpcUrl`) — consumed by BOTH
  `utils/rpcProvider.js#makeReadProvider` (every ethers read) and `wagmi.js`'s transports. **Never
  hand-build a provider from `NETWORKS[chainId].rpcUrl`**: go through `makeReadProvider` /
  `getReadProvider(chainId)`, or `getRpcUrlForChain(chainId)` for a bare URL. A member failover yields
  real failover (quorum-1 `FallbackProvider` / viem `fallback`), with the build default behind it so a
  custom endpoint going dark never takes a network down. **Credential rules are absolute**: keys ride
  in a request HEADER (never written into a URL by the app), attach to the PRIMARY endpoint only,
  redact through `redactRpcUrl` at every display/log boundary, are device-scoped
  (`fw_global_prefs.network_endpoints`, usable with no wallet connected) and are **deliberately absent
  from `lib/backup/syncedObjects.js`** — do not add them. Saving is honest: an endpoint answering with
  a DIFFERENT `eth_chainId` is refused (it would silently serve another chain's state), an unreachable
  one saves with the failure shown. **Bring-your-own-node is supported**: any https host, plus loopback
  http for a local node — which is why `connect-src` grants `https:` scheme-wide (a per-member
  allowlist cannot exist in a static header). That grant is for `connect-src` ONLY; never extend it to
  `script-src`/`frame-src`/`img-src`. `CSP_RPC_GRANTS` (endpointStore.js) and both nginx configs must
  stay in sync (gated by `src/test/nginxCspConnectSrc.test.js`). Non-loopback `http://` is refused
  (browser mixed-content blocking, not a policy we control). Reads pick up a change immediately
  (`useEndpointsRevision` in provider memo deps); wallet transports are module-load-time, so the panel
  discloses the reload instead of implying an instant switch. See
  `docs/developer-guide/network-endpoints.md` + `specs/069-network-endpoints-user-panel/`.

- **Cloud infrastructure is DECLARATIVE (spec 087), and the GCP project is SHARED.** Terraform
  (`infra/terraform/`) provisions; Ansible (`infra/ansible/`) converges node interiors. Six rules,
  each of which has a way to be silently wrong:
  (1) **IAM is ADDITIVE ONLY.** `chippr-bots-site-wp` hosts a public WordPress VM plus `clearpath-*`,
  `fukuii-*`, `kings-edge-*`. `google_project_iam_binding` is one word from the safe `_iam_member`
  and is **authoritative for that role project-wide** — it strips the role from every other
  principal, and the plan diff looks small and ordinary. `_iam_policy` is worse (the whole policy).
  Both are rejected by `npm run check:iac`; the CI identity also lacks `projectIamAdmin`, so the
  same mistake fails at the API. **Two layers, because either alone has a failure mode.**
  (2) **Never declare a `google_secret_manager_secret_version`** — it writes the payload into state
  in plaintext. Terraform owns secret **containers + access bindings** only. The ONE accepted
  exception is the origin-lock header read via a *data source* (data-source results are ALSO written
  to state; `sensitive` hides a value from output, not from state) — the gate warns on every such
  use so it stays countable.
  (3) **Adoption is by `import`, never recreate**, and a surface is done only at a **zero-diff
  plan**. If a plan is not clean the CONFIGURATION is wrong — fix the repo, never apply to force
  live infra to match a generated body. `import` blocks STAY after adoption: they are the audit
  record and the state-loss recovery path. KMS key versions, secret payloads and the
  Cloudflare-pinned static IPs are unrecoverable and carry `prevent_destroy`.
  (4) **Terraform owns Cloud Run SHAPE; Cloud Build owns the IMAGE.** The `ignore_changes` set
  (`image`, `revision`, `client`, `client_version`) is gate-enforced — without it every merge reports
  drift, and drift nobody reads is worse than none. The pipeline correspondingly must not set shape
  flags. **The Cloud Run alto bundler must stay decommissioned** (G-11): re-arming it puts two
  executors on ONE EOA — colliding nonces, stuck bundles, both instances healthy-looking, no in-band
  detection.
  (4a) **The five Terraform modules live in the private `chippr-robotics/chippr-tf-modules`**, pinned
  by **commit SHA** (a tag can be repointed, a commit cannot; G-16 enforces the pin). Add new modules
  THERE, not to `infra/terraform/modules/`, which now holds only a pointer — a local module is
  invisible to the other Chippr projects sharing this estate. `terraform init` needs
  `TF_MODULES_TOKEN` because the repo is private; a missing token reads as `repository not found`,
  not as a permission error.
  (5) **Both Cloudflare rulesets are AUTHORITATIVE for their phase** — an apply deletes any rule
  added at the dashboard. The geo gate answers HTTP 451 and is a **legal control** (spec 007), under
  CODEOWNERS. (6) **The nodes have NO public SSH**: `:22` is open to the IAP range only, and the
  Ansible inventory tunnels through it. If a playbook cannot connect, fix the tunnel — **never widen
  the firewall**. Handlers restart the whole `fairwins-stack@<role>` unit, never a container (one
  shared network namespace). Secret delivery **invokes** `infra/vm/common/fetch-secrets.sh` rather
  than reimplementing it. Apply is **automatic on merge** and executes the *reviewed* plan, gated on
  the infra-tree digest; a mismatch fails rather than replanning. See
  `docs/developer-guide/infrastructure-as-code.md` + `docs/runbooks/infrastructure-operations.md`
  + `specs/087-infrastructure-as-code/`.

- **FinOps (spec 089): the CATALOGUE is the source of truth, and a zero is never an absence.**
  `packages/finops-catalogue` declares every revenue and cost source exactly once; the exporter
  (`services/finops-exporter`), the dashboard generator (`scripts/finops/generate-dashboards.js`)
  and the CI gate (`npm run check:finops`) all derive from it. **Adding a revenue or cost source to
  the platform without a catalogue entry FAILS CI** — that gate is the feature, because "remember to
  update the dashboard" is a convention and conventions decay. Five rules:
  (1) **A VALUE EXISTS ONLY IN STATE `read`.** Every source resolves `read` / `not-configured` /
  `unreadable` and `reading.js` has three constructors of which only one takes a number, so "zero
  because the read failed" has no code path. `not-configured` is first-class and does NOT alert or
  make a total partial — it says "not wired up" (the OpenSea/Gains/GMX attribution ids genuinely are
  unset), where `$0` would say "wired up and earning nothing". A total missing a live source is
  labelled partial and NAMES it. (2) **`basis` IS MANDATORY ON EVERY COST**: `billed` came from a
  billing record (**GCP only** — Cloudflare and QuickNode publish no dollar figure at all on our
  plan, research R1), `modelled` is our arithmetic over a declared plan rate. Never collapse them;
  vendor *usage* is exported separately because usage is a fact even when the dollar figure is a
  model. (3) **PREPAID POOLS ALERT ON RUNWAY, NEVER A BALANCE FLOOR** (a floor is only right at one
  burn rate). Burn counts **decreases only** (a top-up would otherwise read as negative burn ⇒
  infinite runway), and runway is **`null`/absent when unknowable — never `+Inf`**, which every alert
  rule reads as perfect health. Staleness alerts are separate and NEVER resolve a value alert.
  (4) **LABELS COME FROM BOUNDED ENUMERATIONS** (`schema.js`) — never a member address, wager id or
  tx hash, which makes series count a function of usage and outgrows the tier in days.
  (5) **`infra/grafana/` IS GENERATED AND COMMITTED** — never hand-edit it (C5 regenerate-and-diff),
  and a dashboard edited in the Grafana UI is drift that the next provision overwrites. `miniapp
  licenses` and `wager platform fee` are catalogued `planned`: neither exists on chain, so they show
  as NOT YET LIVE, declare no metric, and contribute nothing to any total. The exporter is
  **read-only by construction** (no signer, no write route), binds loopback only, and
  `fetch-secrets.sh` refuses to boot if key material reaches its env. See
  `docs/developer-guide/finops.md` + `docs/runbooks/finops-operations.md` + `specs/089-finops-dashboard/`.

- **The repo is an npm WORKSPACE (spec 075): one root lockfile, 10 members, `contracts/` deliberately
  NOT a member** (it is one compilation unit and cannot be split). Two skills carry the operational
  detail — **`monorepo-workspace`** (dependencies, adding a package, recovering a broken install)
  and **`monorepo-verify`** (the gate suite and what each gate proves). Three rules are absolute,
  each because it already went wrong here: (1) **Never recover an install with `npm install`** —
  npm/cli#4828 silently drops optional platform binaries from node_modules AND the lockfile on
  an incremental install, breaking every Vite build including the on-chain mini-app release path,
  and re-running `npm install` cannot fix it (the lock is already wrong, so npm reports "up to
  date"). Use `npm run deps:reinstall`. **`npm ci` does not fix it either** — measured: it exits 0
  reporting "added 2955 packages" from a lockfile that *does* contain the entry, and still leaves
  the binary uninstalled, because that entry is `optional` AND `peer` and npm skips optional peer
  deps even when locked. If a `deps:reinstall` is interrupted (no lockfile, half-built
  node_modules), restore the lockfile with `git checkout -- package-lock.json` and then install the
  binary alone: `npm install --no-save @rolldown/binding-linux-x64-gnu@<version from the lockfile>` —
  ~18s, and verified to leave `package-lock.json` byte-identical. **The binary's NAME moves with the
  toolchain** — it was `@rollup/rollup-linux-x64-gnu` until Vite 8 (spec 077) replaced rollup with
  rolldown, and rollup then left the tree entirely, so guidance naming the old package would have
  read fine and helped nobody. Take the current name from `REQUIRED_OPTIONAL` in
  `scripts/deps/check-dependency-hygiene.js`, which is the gate that enforces it; do not trust a
  package name written in prose, including this one. **Dependabot triggers this
  routinely**: 3 of 5 lockfile-touching Dependabot PRs in one week dropped the binary, and
  `check:deps` is what catches it. (2) **Every dependency contributing Solidity source is
  pinned EXACTLY** — a caret range makes deployed bytecode a function of when the lockfile was last
  resolved; `@chainlink/contracts` floating 1.3.0→1.5.0 changed `ChainlinkFunctionsOracleAdapter`'s
  bytecode and only the byte-diff gate caught it. **This includes the npm `solc` package itself** —
  it is not tooling: `hardhat.config.js` (~L190) resolves `solc/soljson.js` and compiles WITH IT when
  `FORCE_SOLCJS=true` or in Codespaces, so on that path its version decides bytecode. It is pinned
  exact and dependabot-ignored for ANY update. Note the byte gate does NOT cover it: a run using the
  native binary never exercises the solcjs path, so the gate passed a `0.8.24`→`0.8.36` bump (#1084).
  A byte gate only covers inputs the run actually reaches — an input active only behind an env switch
  is invisible to it. (3) **A shared package under `packages/` MUST be
  resolvable by plain Node** (extensioned imports + explicit `exports`) — `frontend/src` has ~2,966
  extensionless imports while the gateway is Node ESM, which is *why* the EIP-712 structs stayed
  duplicated. Those structs + their action metadata now have ONE source, `@fairwins/intent-types`,
  checked against the verifying contracts by `test/intent/TypehashParity.test.js` and
  `services/relay-gateway/test/actionCoverage.test.js`. Any change touching dependencies, hoisting,
  or the build preset MUST pass the byte gates (`scripts/codegen/bytecode-digest.js`,
  `scripts/miniapps/record-build-digests.js`) — mini-app output bytes are keccak-committed
  on-chain. **Both byte gates now RUN in CI** (`test.yml`: the bytecode diff in
  `smart-contract-tests`, the mini-app bytes in their own `miniapp-bytes` job); until then they
  were scripts nobody was required to run, and the mini-app one reported "output bytes unchanged"
  after a *failed* build. A gate firing here is not a chore — getting it green means deliberately
  re-recording a baseline, i.e. accepting that deployed bytecode or a published package changed.
  See `specs/075-monorepo-workspaces/`.

<!-- SPECKIT START -->
For additional context about technologies to be used, project structure,
shell commands, and other important information, read the current plan
at specs/087-infrastructure-as-code/plan.md
<!-- SPECKIT END -->
