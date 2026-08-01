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
  (2) **The registry has ONE home per cohort** — `miniAppChainId()` (Polygon on a mainnet build,
  Amoy on a testnet one), derived from the `MAINNET_CHAIN_ID`/`TESTNET_CHAIN_ID` pair, never a
  second literal. It is currently deployed on **137 and Mordor 63**; Amoy 80002 has NO address, so
  a testnet build reads "not deployed".
  (3) **The `host` object is the ENTIRE privileged surface** (`contracts/host-context.md`, hostApi
  **2**): `appId`, `wallet`, `readProvider`, `contracts`, `network`, `store`, `audit`, `toast`,
  `navigate`. Wrappers, never handles — no signer, no context, no storage handle, and adding a key
  grants it permanently to every third-party package. `wallet.submit` chooses the write rail
  (classic signer vs passkey `sendCalls`) because an app cannot: identity first, so a passkey member
  acting as a vault still gets a PROPOSAL. It resolves at **BROADCAST** — use `SubmitResult.wait()`,
  never report success from `submit` alone. `contracts(name)` is gated by a per-package manifest
  allowlist and **throws** for an undeclared name (returning `null` would read as "not deployed").
  (4) **Never bundle host config into a package.** `config/contracts.js` reaches `virtual:tenant`
  (a hard build failure), and the preset's `envPrefix` turns any bundled `import.meta.env` read into
  `undefined` — a bundled `NETWORKS` would report every subgraph as absent, which is a fabricated
  fact, not an outage. Packages take configuration from the host at runtime. Equally: **nothing in
  `frontend/miniapps/` may import from `frontend/src/`** — a package is built separately, frozen at
  an immutable CID, and a bundled copy of a React context is a DIFFERENT context.
  (5) **`blob:` in `script-src` is for mini-app packages ONLY** — verified bytes are imported from a
  Blob URL (R1). Never add `https:` to `script-src`. The SW package cache
  (`fairwins-miniapp-packages-v1`) is cache-first because CIDs are immutable, and is **not a trust
  boundary**: the loader re-verifies manifest keccak + per-file sha256 after every retrieval.
  See `docs/developer-guide/miniapps.md` + `specs/073-miniapp-platform/`.
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

<!-- SPECKIT START -->
For additional context about technologies to be used, project structure,
shell commands, and other important information, read the current plan
at specs/073-miniapp-platform/plan.md
<!-- SPECKIT END -->
