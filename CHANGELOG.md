# Changelog

**This file is generated.** Entries are written by `.github/workflows/release.yml` at release time
from the classifications carried on merged pull requests (spec 076). Do not hand-edit it — a
hand-written entry will be overwritten by the next release, and a hand-written version number is
rejected outright by the version gate.

Versions follow the scheme in
`specs/076-monorepo-semantic-versioning/contracts/version-scheme.md`, which defines what
"breaking" means in this repository rather than leaving it to judgment.

Release candidates (`vX.Y.Z-rc.N`) are cut from `staging` and are not recorded here; only published
production releases are.

<!-- RELEASES:START -->

## v1.5.2 — 2026-08-10

Promoted from: none — released directly from main
Previous release: v1.5.1 · Range: `v1.5.1..v1.5.2` (1 commits)

### 🧹 Maintenance

- chore(release): consolidate 10 lost release records, and stop them accumulating (#1119)

### Artifacts

Range: `v1.5.1..v1.5.2`

| Artifact | Status | Identity |
|---|---|---|
| SPA image | moved | — |
| Relay gateway image | moved | — |
| Contract implementations | unchanged | — |
| Mini-app packages | unchanged | — |
| Subgraph endpoint | moved | `v0.2.0` |

## v1.5.1 — 2026-08-10

> **Consolidated record.** This entry covers the whole range **v1.2.5 → v1.5.1**, i.e. it also
> accounts for the commits released as v1.2.6, v1.2.7, v1.2.8, v1.2.9, v1.3.0, v1.3.1, v1.4.0,
> v1.4.1 and v1.4.2. Those tags exist and are immutable, but their individual release-record pull
> requests were never merged — each was branched from `main`, so they accumulated and conflicted
> with one another until the in-repo record was ten versions behind what had actually shipped.
> `.github/workflows/release.yml` now closes superseded records and derives its range from the
> CHANGELOG rather than the last tag, so a record can no longer be silently lost this way.
>
> One earlier entry could not be recovered: **v1.2.4** was tagged but its record was lost before
> this consolidation, and the commits it covered are folded into the v1.2.5 range above it.

Promoted from: none — released directly from main
Previous release: v1.2.5 · Range: `v1.2.5..v1.5.1` (13 commits)

### 🚀 Features

- feat(080): make compiled bytecode path-independent — addresses stop moving when source moves (#1110)
- feat(frontend): rework Address Book into 3a expandable roster (#1113)
- feat(frontend): modernize Address Book UI with colored network pills (#1023) (#1106)

### 🐛 Bug Fixes

- fix(frontend): stop the Bridge quote fetch loop that flickered between pricing and unavailable (#1111)
- fix(deps): drop @uma/core — 1,138 packages (−35.5%) for 199 lines of Solidity (#1089)

### 📚 Documentation

- spec: Hardhat 3 toolchain migration (079) (#1102)

### 🧹 Maintenance

- chore(release): v1.2.5 [skip release] (#1091)
- chore(deps): Bump @scure/bip39 from 1.6.0 to 2.2.0 (#1100)
- chore(deps): Bump express from 4.22.2 to 5.2.1 (#1098)
- chore(deps): Bump release-drafter/release-drafter from 6 to 7 (#1095)
- chore(deps): Bump actions/setup-python from 5 to 7 (#1093)
- chore(deps): Bump actions/setup-go from 5 to 7 (#1094)
- chore(deps-dev): Bump the dev-tooling group across 1 directory with 16 updates (#1084)

## v1.2.5 — 2026-08-09

Promoted from: none — released directly from main
Previous release: v1.2.4 · Range: `v1.2.4..v1.2.5` (3 commits)

### 🐛 Bug Fixes

- fix(release): grant pull-requests write; require same-repo for the release exemption
- fix(release): open a PR for the release record; backfill v1.0.0-v1.2.3

### Artifacts

Range: `v1.2.4..v1.2.5`

| Artifact | Status | Identity |
|---|---|---|
| SPA image | moved | — |
| Relay gateway image | moved | — |
| Contract implementations | unchanged | — |
| Mini-app packages | unchanged | — |
| Subgraph endpoint | moved | `v0.2.0` |

## v1.2.3 — 2026-08-09

Promoted from: none — released directly from main
Previous release: v1.2.2 · Range: `v1.2.2..v1.2.3` (3 commits)

### 🐛 Bug Fixes

- fix(release): refuse unsupported workspace glob shapes instead of guessing
- fix(release): derive the tracked manifest list from the workspace

## v1.2.2 — 2026-08-09

Promoted from: none — released directly from main
Previous release: v1.2.1 · Range: `v1.2.1..v1.2.2` (2 commits)

### 🧹 Maintenance

- chore(deps): scoped overrides for three vulnerable transitive packages (#1021)

## v1.2.1 — 2026-08-09

Promoted from: none — released directly from main
Previous release: v1.2.0 · Range: `v1.2.0..v1.2.1` (4 commits)

### 📚 Documentation

- docs: the platform binary is rolldown's now, not rollup's (spec 077)
- docs: stop telling people to npm install inside a workspace (T047) + three stale claims

## v1.2.0 — 2026-08-09

Promoted from: none — released directly from main
Previous release: v1.1.0 · Range: `v1.1.0..v1.2.0` (3 commits)

### 🚀 Features

- feat(miniapps): app-store rows, details sheet, fixed bottom nav (spec 077 iteration 2)

### 🐛 Bug Fixes

- fix(miniapps): restore swallowed catalog CSS sections; stop the sheet stealing focus

## v1.1.0 — 2026-08-09

Promoted from: none — released directly from main
Previous release: v1.0.1 · Range: `v1.0.1..v1.1.0` (1 commits)

### 🚀 Features

- feat(miniapps): store UX redesign + vite 8 byte-gate resolution (spec 077) (#1082)

## v1.0.1 — 2026-08-09

Promoted from: none — released directly from main
Previous release: v1.0.0 · Range: `v1.0.0..v1.0.1` (4 commits)

### 🐛 Bug Fixes

- fix(admin): SupplyTab and BridgeTab refetched in a loop, not 4x (#1031)

## v1.0.0 — 2026-08-09

Promoted from: none — released directly from main
First release · 2508 commits

### 🚀 Features

- feat(release): version identity, the merge gate, and staging (076 T012-T049)
- feat(release): add the single version-computation authority (076 T001-T011)
- feat(ui): show which build this is at the bottom of the nav drawer
- feat(1019): remove demo mode — the platform runs against live networks now
- feat(075): turbo.json — the declared target graph (US6)
- feat(075): close the by-name boundary gap; drop eslint-plugin-boundaries (US7)
- feat(075): @fairwins/abi — generate ABIs from compiled artifacts (US5, subgraph migrated)
- feat(075): machine-check client/gateway action parity; deps:reinstall (US4)
- feat(075): npm workspaces — one lockfile, 7 members, zero committed bytes changed (US3)
- feat(075): finish US1/US2 and make the version invariants machine-checked
- feat(074): declare the build inputs so the bytecode is reproducible (US1)
- feat(066): staking fee router, admin controls & emergency pause (#958)
- feat(request): receive-any asset catalog + Pay balance-line cleanup (spec 064 follow-up) (#956)
- feat(assets): universal asset selector for Pay/Request/Wager + trade view (spec 064) (#955)
- feat(wallet): fold "acting as" into a caret dropdown on the wallet biticon (#954)
- feat(wallet): the wallet header identity reflects the ACTING account (#952)
- feat(recovery): biometric-first key protection, dark-mode contrast, recovered acting-account (#950)
- feat(recovery): legacy account recovery — encrypted import, all-asset sweep, address book, backup & audit (#949)
- feat(admin): app-wide membership stats + treasury growth on Overview (#918)
- feat(057): Predict — per-user CLOB creds, client-direct trading (Option A) (#912)
- feat(skill): fairwins-infra — bring gasless Cloud Run services up/down for cost (#897)
- feat(054): wager tag naming registry (%tags) — full implementation (#898)
- feat(passkey): global signature→confirmation progress overlay (#894)
- feat(034/036): Tier 2 gasless group pools — factory-forwarder relayer path (#807)
- feat(036/041): harden alto bundler edge + fix gasless CSP connect-src gap (#808)
- feat(wallet): add Pay & Transfer section for gasless stablecoin + native transfers (#809)
- feat(036): wire gasless UX into the no-fund wager write flows (#803)
- feat(036): gasless relayer — build-from-source engine + Mordor deployment + hardening (#802)
- feat(041): Oracle-settled open challenges (Polymarket) (#801)
- feat(034): remove Semaphore from group pools — address-based WagerPool/WagerPoolFactory, relayer-ready, audit-hardened (#793)
- feat(035+036): gasless intent contracts, relay client, and fully configured relayer (#800)
- feat(037): pool activity source — route pool lifecycle into notifications (#785)
- feat(034): ZK-Wager Pools — deploy prerequisites, Mordor launch, relayer (#776)
- feat(address-book): icon-only buttons on mobile, icon+label on desktop (#779)
- feat(address-book): add copy-to-clipboard button per address (#778)
- feat(034): ZK-Wager Pools — resolution UI + My Account language selector (US1/US2) (#775)
- feat(wallet): make My Account section nav a slide-over drawer on mobile (#774)
- feat(clearpath): detect executor-gated treasuries + "Fund from treasury" action (#773)
- feat(clearpath): proposal timeline, vote receipts, bottom-sheet builder, Self recipient (#771)
- feat(swap): network-aware DEX provider — ETCswap on ETC, Uniswap elsewhere (spec 033) (#766)
- feat(backup): encrypted data backup & restore via IPFS + on-chain pointer (spec 032) (#765)
- feat(notifications): platform-wide notification & activity system (spec 031) (#764)
- feat(clearpath): Standard DAOs & External DAO Connectors (spec 030) (#763)
- feat(tokens): spec 028 — token mint & compliant token administration portal (#761)
- feat(subgraph): index oracle adapter conditions (#751) (#758)
- feat(frontend): serve wager reads over RPC on networks without a subgraph (#742)
- feat(landing): replace "Built on X" badge with a "Deployed on" networks section (#740)
- feat(vouchers): buy a quantity, gift to an address, and redeem from a list (#737)
- feat(subgraph): enable membership voucher indexing on deployed testnets (spec 026) (#734)
- feat: open-challenge wagers gated by a shared claim code (024) (#722)
- feat: Upgradeable WagerRegistry via UUPS proxy + reusable UUPSManaged base (025) (#724)
- feat(wagers): gate "either side submits outcome" to equal-stakes bets (#719)
- feat(notifications): source draw proposals from the subgraph (kill eth_getLogs) (#714)
- feat(017): deploy v2 WagerRegistry subgraph to Studio + resolve Amoy block (#707) (#709)
- feat(019): My Wagers automatic views & simplification
- feat(018): My Wagers views & privacy feedback
- feat(subgraph): index v2 WagerRegistry + per-transfer WagerTransfer records (Spec 017)
- feat(017): My Wagers card grid redesign
- feat(verify): multi-chain contract source verification
- feat(mordor): deploy core v2 to Mordor + Network-tab integration (Spec 015)
- feat(frontend): relocate network selector to My Account, simplify wallet menu
- feat(frontend): wager activity notifications — bell, feed, badges, warnings (spec 012)
- feat(frontend): quick variant for the dashboard Share Account QR
- feat(frontend): Share Account quick action on the dashboard
- feat(frontend): QR color customization with persisted palette choice (spec 011, US3)
- feat(frontend): copy and share actions in address QR modal (spec 011, US2)
- feat(frontend): address QR display in Account tab (spec 011, US1)
- feat(008): chain-aware wager surface — list, create, accept, admin (batch 2)
- feat(008): chain-aware sanctions screen + key registry service (batch 1)
- feat(008): make useSiteStats chain-aware (T014)
- feat(008): scope local role/purchase cache per (chainId, account)
- feat(008): chain-aware membership read hooks + shared network notice (MVP slice)
- feat(007): pre-launch lockdown script + mainnet cutover runbook
- feat(007): membership migration script for the full cutover (dry-run by default)
- feat(007): compliance gating US4–US6 — entry gate, membership attestation, key-gen eligibility
- feat(007): compliance & legal gating — geo-gate, sanctions screening, versioned docs
- feat(dev): local Hardhat dev environment with two funded wallets (Spec Kit 006) (#639)
- feat(dev): local Hardhat dev environment with two funded wallets (Spec Kit 006)
- feat(005): Arbitrating tab in MyMarketsModal + Dashboard button-driven flow tests
- feat(005): re-enable ThirdParty create flow — arbitrator input, key-gate, encrypt-for-arbitrator
- feat(create): collapse the Private Wager encryption explainer behind a disclosure
- feat(005): index the arbitrator in createWager for discovery (composed into 004 v3)
- feat(005): FR-010 terms-unavailable state in wager detail view (T013a + T009a)
- feat(draw): implement Draw resolution (both stakes returned) — Spec Kit 004 US1+US2+US3
- feat(frontend): Polymarket-only oracle UI behind VITE_ORACLE_MODELS (Spec Kit 003)
- feat: route membership sales to chipprbots.eth treasury (Polygon)
- feat(frontend): make Polygon mainnet (137) the primary/default network
- feat(wagers): surface market selection at top with resolution-type tabs (#623)
- feat: add Claim Refund button for wagers past resolution deadline (#615)
- feat: overhaul E2E test suite and fuzzing to cover FairWins functional checklist (#608)
- feat: add wager withdraw and decline functionality (#606)
- feat: store metadataUri on-chain so both participants can decrypt wager messages (#602)
- feat(wagers): per-user EnumerableSet index for O(N_user) lookups
- feat(frontend): replace demo mode toggle with Amoy/Polygon network switcher
- feat(frontend): auto-register encryption key during membership purchase
- feat(frontend): replace static welcome modal with interactive onboarding tutorial
- feat(frontend): condition picker + 3 new oracle types in createWager dropdown
- feat(admin): oracle adapter administration tab + cleanup dead enum
- feat(p2p-roles): refocus protocol on P2P wagers with operator-power separation
- feat(oracles): add Chainlink + UMA wager resolution adapters
- feat(membership): Lower Friend Market entry to $1 and trim UI to enforced limits
- feat(frontend): collapse Polymarket browser once a market is linked
- feat: lock linked-market end time and shorten wager timing
- feat(frontend): auto-start QR scanner, fix scan icon, accept ENS for opponent/arbitrator
- feat(frontend): require creator to declare their side on linked-market bets
- feat(frontend): paginated My Wagers view with subgraph-backed scale
- feat(frontend): add Polymarket top-markets browser to dashboard and wager modal
- feat(frontend): wire Uniswap V3 + Testnet/Mainnet toggle + Polymarket linked-market lookup
- feat: default to Polygon Amoy across the stack
- feat(frontend): chain-aware token labels + theme-aware Mordor banner
- feat: migrate to Polygon Amoy + Polymarket-pegged side-bet E2E
- feat: implement market search and launch navigation in UserManagementModal
- feat: update ZKKeyManager constructor to require initial admin address and add deployment configuration for Mordor network
- feat: add key registry service for on-chain encryption key management
- feat: implement FriendMarketsContext for centralized friend market management and refactor components to use context
- feat: implement shared signature handling for encrypted wagers in MarketAcceptanceModal and FriendMarketsModal
- feat: enhance MarketAcceptanceModal with encryption handling and UI updates
- feat: add new wager statuses and update handling in various components
- feat: privacy-preserving market lookup with event-based discovery
- feat: Complete P2P wager UX update across onboarding, sidebar, and landing CSS
- feat: Update landing page and dashboard to P2P wager-first UX
- feat: Add network-aware oracle availability detection
- feat: Add OracleRegistry integration to FriendGroupMarketFactory (PR8)
- feat: Add UMAOracleAdapter for arbitrary truth assertions (PR7)
- feat: Add ChainlinkOracleAdapter for price-based conditions (PR6)
- feat: Add IOracleAdapter interface and OracleRegistry (PR5)
- feat: Add oracle timeout fallback mechanism (PR4)
- feat: Add claim timeout with treasury fallback (PR3)
- feat: Add challenge period for manual resolutions (PR2)
- feat: Implement claimWinnings() function for stake transfers (PR1)
- feat: Add interactive onboarding tutorial for new users
- feat: Add Polymarket oracle resolution for private markets
- feat: Add friend market notification system with unread indicators and expiration handling
- feat: Add Multicall3 ABI and implement batch fetching for market categories and statuses
- feat: Implement infinite scroll for market grid
- feat: implement lazy loading for IPFS envelopes and metadata in FriendMarketsModal
- feat: implement conditional logger utility and replace console logs with logger methods; increase polling intervals to reduce load
- feat: Update FriendGroupMarketFactory to support Bookmaker markets and resolution types
- feat: add ClearPathUserModal and ClearPathProModal exports; enhance TokenManagementModal styles and functionality
- feat: enhance market metadata generation and improve description parsing in components
- feat: update IPFS gateway to use Pinata Cloud for deployment
- feat: enhance WalletButton role verification by adding RoleManager fallback
- feat: implement nginx proxy for Pinata API with runtime JWT substitution
- feat: add Cloud Build configuration for Docker image build and deployment
- feat: add Perpetual Futures Education Modal and enhance position fetching logic
- feat: add cron scripts for perpetual futures funding settlement and health checks
- feat: consolidate role grant scripts into a single configurable script
- feat: Add error handling and retry mechanism for market decryption
- feat: Implement lazy market decryption for improved performance and UX
- feat: Enhance envelope encryption documentation with IPFS storage details and benefits
- feat: Implement X-Wing post-quantum encryption and decryption functions
- feat: implement transaction progress component and enhance market acceptance modal with encryption handling
- feat: add documentation for private prediction markets and envelope encryption
- feat: enhance market display titles to handle encrypted and private markets
- feat: implement versioned signing messages and update encryption functions for backward compatibility
- feat: implement share modal for FriendMarkets and enhance market status handling
- feat: add role manager configuration for ConditionalMarketFactory and update deployment scripts
- feat: enhance market acceptance functionality with encrypted market handling and dynamic token info
- feat: update TieredRoleManager address and improve contract address retrieval in MarketAcceptancePage
- feat: enhance WalletContext to clear stale WalletConnect data on mount and during disconnect
- feat: configure PaymentProcessor to use TieredRoleManager for role grants
- feat: add script to setup admin roles and configure tier prices in USC
- feat(deploy): update contract addresses and deployment scripts for Mordor network
- feat(deploy): add new deployment scripts and constants for FriendGroupMarketFactory and role management
- feat: Implement birth certificate creation and verification for clones
- feat: add integrity module for floppy keystore with Merkle tree and signing
- feat: add ENS DID support (did:ens)
- feat: add AT Protocol (Bluesky) DID support
- feat: add x402 protocol support for HTTP-native payments
- feat: add agent identity and persistent memory storage
- feat: add multi-chain support to floppy keystore skill
- feat: extract floppy disk keystore as Claude skill
- feat: Update tier pricing mechanism to fetch from TierRegistry contract and adjust fallback prices
- feat: Add FriendGroupMarketFactory balance and withdrawal functionality to AdminPanel
- feat: Implement TreasuryVault management in AdminPanel
- feat: Integrate nullifier system for anti-money laundering protections in FriendGroupMarketFactory and update related documentation
- feat: Add technical specifications and user guide for private market encryption
- feat: Enhance market handling with encrypted metadata support and role management script
- feat: Add scripts for building frontend and managing TierRegistryAdapter deployment and configuration
- feat: Enhance role synchronization logic and add admin scripts for tier management
- feat: Implement unified session manager for encrypted communications in friend markets
- feat: implement functionality to create NFL Divisional Round prediction markets
- feat: implement functionality to create NFL Divisional Round prediction markets
- feat: add utility scripts for contract verification and testing
- feat: implement test script for floppy key management
- feat: add floppy disk keystore management
- feat: Redeploy FriendGroupMarketFactory with updated approval logic and enhance WalletButton for native token handling
- feat: Add Market Acceptance Modal and enhance FriendMarketsModal with acceptance functionality
- feat: Implement user tier loading and syncing for premium purchase modal
- feat: implement tiered membership system in RolePurchaseModal and related components fix: update FriendGroupMarketFactory constructor to accept owner address style: enhance RolePurchaseModal CSS for tier selection and responsiveness chore: update contract addresses in deployment scripts and config files fix: correct role manager address in ConditionalMarketFactory
- feat: add MarketAcceptancePage for handling market acceptance via QR codes
- feat: Add nullification restriction to TreasuryVault withdrawals
- feat: Add RSA accumulator-based nullifier system for market protection
- feat: Enhance LandingPage with social media links and membership contact information
- feat: Implement modular role management system with PaymentProcessor, RoleManagerCore, TierRegistry, UsageTracker, and MembershipManager contracts
- feat: Introduce TieredRoleManagerLite for gas-constrained deployments; implement lazy initialization for tier metadata and enhance deployment script with additional checks
- feat: Add Safe Singleton Factory support for contract initialization and ownership transfer
- feat: Implement comprehensive vault contracts for DAO treasury and market collateral management

### 🐛 Bug Fixes

- fix: remove duplicate portfolio balance header (#1078)
- fix(release): the release pipeline silently published nothing
- fix(release): branch-policy violated two of the repo's own CI gates
- fix(release): the constitution-IV check must match the YAML key, not the word
- fix(release): the promotion rule cannot apply before staging exists
- fix(turbo): close the last three #1036 items
- fix(test): BridgeView screening asserted call ORDER, not the requirement
- fix(spec-075): the ethers fixture GATE 2 was recorded as passing without (#1040)
- fix(eip712): consolidate the domains and gate them against the Solidity (#1038)
- fix(gates): five gates that passed in the states they exist to catch (#1039)
- fix(test): the package boundary gate saw only the minority import style (#1037)
- fix(turbo): three undeclared inputs that could serve a wrong cache hit (#1036)
- fix(test): AdminBridgeTab has the same authority race #1029 fixed in its sibling
- fix(ci): my own container job tripped the exit-code guard
- fix(ci): the two byte-reproducibility gates were never wired into CI
- fix(build): both shipped container images were broken by the workspace conversion
- fix(ci): two more workflows skipped PRs that target a feature branch
- fix(test): the AEAD tamper test sometimes did not tamper
- fix(wallet): read the chain from the WALLET, not from wagmi's config (#1030)
- fix(test): AdminSupplyTab awaited the pool list, then raced the authority read (#1029)
- fix(e2e): WAL-08/09 tested an unreachable banner; make the mock's chain real
- fix(ci): correct the torture-test artifact retention table
- fix(ci): stop the artifact quota from failing every job (-86% per-run bytes)
- fix(1028): arbitrator by real id; CRE-08 asserts render not viewport
- fix(1019,1028): three from the pattern sweep — one is green-but-vacuous on the gate
- fix(1028): assert the success screen EXISTS, not that it is visible
- fix(1028): key seeding works on a fresh chain; keypad waits for its own effect
- fix(1028): the post-submit assertion never waited for the transaction
- fix(1028): wagers can now be created — encryption keys were an unmet precondition
- fix(1028): the four deep full-tier defects, plus the three shared blockers
- fix(e2e,ci): a test that never tested its own name, and the twin of a bug I fixed once
- fix(075): add the Slither finding my baseline regex could not match
- fix(075): baseline Slither's pre-existing High findings so the gate can stay on
- fix(075): pin eslint-plugin-react-hooks to main's version; correct a wrong claim
- fix(075): four CI defects the first pipeline run exposed
- fix(075): mount the root node_modules for Matchstick under workspaces
- fix(075): repoint the subgraph CI guard at the generated ABIs
- fix(075): lift activity-feed group headers out of the list (real a11y defect)
- fix(074): repair the CI gates that could not fail (US2, partial)
- fix(infra): make the single-alto gate fail CLOSED (it started a second executor) (#1002)
- fix(clearpath): repoint two host hooks at the host-side copy after the conversion
- fix(reports): read the chain the report is about, not the build default
- fix: repair the 11 pre-existing frontend test failures
- fix(supply): drop stale HubPool reads; close T144-T150 (#971)
- fix: add scripts/ops/register-fee-service.js, omitted from #969 (#970)
- fix(earn): scope Morpho attribution to Lend and Rewards views (#964)
- fix(my-wagers): lift sheet above mobile bottom nav (#953)
- fix(pwa): shorten install name to 🍀Fairwins (#919)
- fix: preferences toggle switches render as squares on mobile (#916)
- fix(057): wire POLYMARKET_API_ADDRESS from secret in gateway manifest (#911)
- fix(055): launch feedback — Collect label, merged portfolio section, image CSP + deploy wiring (#905)
- fix(frontend): mobile UX — lock viewport, fix modal/menu layering, theme-aware membership card (#903)
- fix(alto): switch Polygon bundler RPC to QuickNode (publicnode archive-403) (#895)
- fix(open-challenge): let passkey takers connect + accept, render terms as prose (#896)
- fix(frontend): let oracle challenge market picker fill the bottom sheet (#851)
- fix(041): clarify oracle open challenge is a peer-to-peer wager (#805)
- fix(039): make info-tooltip triggers blend into labels and read more compact (#798)
- fix(034): make pool nicknames deterministic across users (normalize address casing) (#792)
- fix(034): add wasm-unsafe-eval to the PRODUCTION nginx CSP template (#791)
- fix(ci): apply Semaphore viaIR:false override so contract compile stops timing out (#788)
- fix(024): open-challenge screen patches from testing feedback (#787)
- fix(034): load Semaphore packages via static dynamic import (join was broken) (#781)
- fix(clearpath): gate Execute on timelock ETA, decode revert errors, copy proposal id (#772)
- fix(clearpath): decode ProposalCreated positionally — fixes values .map crash (#770)
- fix(clearpath): two DAO-view bugs — false over-treasury warning + proposal indexing on ETC (#769)
- fix(frontend): flag estimated tier prices when MembershipManager is unreachable (#752) (#756)
- fix(open-challenge): code-key decrypt, deadlines, arbitrator picker, subtle tx (#746)
- fix(csp): allow Mordor/Polygon/ETC RPC hosts in connect-src (#744)
- fix(frontend): disable ethers RPC batching on Ethereum Classic (Mordor reads) (#743)
- fix(frontend): voucher purchase crash + link redeem T&C to a vouchers terms section (#736)
- fix(open-challenge): approve stake before accepting + show funding steps (#733)
- fix(frontend): sync membershipVoucher address to per-network config (#732)
- fix(frontend): complete membership/voucher ABIs + chain-guard, deploy feature-complete Mordor (#730)
- fix(wagers): My Wagers open-challenge display — stake decimals + "Open Challenge" label (#728)
- fix(frontend): address UX tester feedback on My Account & Admin (#725)
- fix(account-stats): correct declined-wager P&L and wire real USDC wallet balance (#713)
- fix(csp): allow api.studio.thegraph.com in connect-src (subgraph) (#712)
- fix(landing): default landing header to dark mode (#711)
- fix(frontend): show wager details on acceptance screen, sync accept-by time, readable notification bell
- fix(frontend): stop border-box padding from collapsing icon-only buttons
- fix(frontend): refresh stale MembershipManager ABI (purchaseTierWithTerms)
- fix(encryption): stop double sign prompt and false "keys not initialized" on wager creation
- fix: allow camera=(self) in production nginx template so QR scanner works
- fix: nginx security-header inheritance, visible scanner error, drop dead deploy workflow
- fix(010): UAT footer & policy-document corrections
- fix(009): allow same-origin camera so the QR scanner works
- fix(009): theme-independent QR rendering + visible scan-button icon
- fix(frontend): read membership tier from the wallet's chain in purchase modal
- fix(frontend): resolve membership-purchase contract by wallet chain
- fix(007): de-dupe synced contract keys + fix sync regex (no-dupe-keys)
- fix(007): wrap lockdown signer in NonceManager for sequential txs
- fix(007): allow LOG_CHUNK override for getLogs paging in migration
- fix(007): make deploy.js resilient to load-balanced RPC nonce lag
- fix(007): persist sanctionsGuard in deployment record + add sync:polygon script
- fix(007): screen grantee in MembershipManager.grantMembership (security review)
- fix(007): address Copilot PR review (#641)
- fix(modals): show Polymarket search in the oracle flow + remove wager items from wallet dropdown
- fix(e2e): mock wallet write-transaction support — UI writes now work
- fix(oracle): PolymarketOracleAdapter takes admin ctor arg (Ownable(admin))
- fix(oracle): refund Polymarket wagers on a tie instead of paying a fixed side
- fix(frontend): resolve six E2E testing bugs (#619)
- fix(wagers): correct resolve timing, clarify outcomes, honest finality UX (#618)
- fix: address critical security findings (#617)
- fix: remove countdown gate on resolve — show button immediately (#616)
- fix: allow both parties to resolve wagers and add resolution window (#614)
- fix: use exact trading period seconds instead of ceil-rounded days for resolve deadline (#612)
- fix: bronze members blocked from creating wagers due to stale concurrent count (#611)
- fix(my-wagers): treat expired pending offers as terminal, fix stale time-left, add Clear/Reclaim path (#609)
- fix: display correct USDC balance when DEX is not configured (#610)
- fix: make acceptance deadline deterministic instead of user-editable (#604)
- fix(my-wagers): derive selectedMarket from id so detail view sees decryption (#603)
- fix(encryption): use X25519 for 1v1 envelopes that add recipients via KeyRegistry
- fix: remove unused getDefaultAcceptanceDeadline import
- fix: auto-set acceptance deadline to midpoint between now and end time
- fix: display USDC balance instead of hardcoded "USC" in wallet dropdown
- fix: update Get USDC button link to Circle faucet (testnet) and Uniswap (mainnet)
- fix(lint): remove unused networkMode and listSupportedChainIds
- fix(frontend): validate MembershipManager contract exists before calling paymentToken()
- fix(a11y): fix Lighthouse target-size failure in onboarding tutorial
- fix(frontend): add oracle resolution methods to onboarding tutorial
- fix(frontend): update welcome modal to reflect peer-to-peer wager mechanics
- fix(frontend): make wager creation modal scrollable
- fix(frontend): wire Polymarket-pegged side bets end-to-end
- fix(oracles): adapter ownership under deterministic deploy + Amoy v2 deploy
- fix(frontend): restore wager modal scroll + spacing CSS
- fix(frontend): clear lint errors unmasked by the etcswap → dex fix
- fix(frontend): green the pipeline for the P2P role refactor
- fix(frontend): silence QR scanner close error and strip text chrome
- fix(frontend): slim dashboard header, theme toggle, collapsible Polymarket feed
- fix(frontend): drop cent prices from linked-market side picker buttons
- fix(frontend): lazy-load footer logo to clear Lighthouse offscreen-images
- fix(frontend): allow gamma-api.polymarket.com in CSP connect-src
- fix(frontend): consolidate header nav into wallet menu and fix theme styling
- fix(frontend): clear lingering setZkPublicKey + unused networkMode
- fix(frontend): drop dead Peg-to-Wager UI block and stale unused refs
- fix(ci): repair sed-mangled mock data, hook deps, and stale test expectations
- fix(frontend): accept any supported chain, not just one EXPECTED_CHAIN_ID
- fix: use wagmi provider/signer for key registration instead of window.ethereum
- fix: update ZKKeyManager deployment to require owner address refactor: remove unused mockPositions from MyMarketsModal tests
- fix: enhance wager cancellation handling and improve error messages
- fix: add missing FRIEND_GROUP_MARKET_FACTORY_ABI and ResolutionType exports
- fix: update frontend tests to match offer/wager terminology
- fix: resolve wager acceptance failure caused by proposalId collision
- fix: reliably fetch and display active wagers for connected wallets
- fix: wager creation error hidden by state race + add staticCall pre-check
- fix: wager creation silent failure and market resolution not implemented
- fix: sync deployment JSONs with latest redeployed contract addresses on Mordor
- fix: Resolve ESLint errors in Dashboard and test file
- fix: add window existence check in WalletContext
- fix: add global observer mocks and fix loading state test
- fix: resolve ESLint errors in OnboardingTutorial and FairWinsAppNew
- fix: regenerate package-lock.json files for CI sync
- fix: Apply PR review feedback - accessibility improvements and Cypress guard
- fix: update test to reflect notification system behavior
- fix: improve state management efficiency in notification hook
- fix: resolve linter errors in friend market notifications
- fix: regenerate frontend package-lock.json for CI compatibility
- fix: sync package-lock.json files with package.json dependencies
- fix: ensure menu closes on screen size change and improve click handling for kebab menu items
- fix: Resolve artifact naming conflicts in CI workflows
- fix: Address PR review feedback for post-quantum encryption
- fix: Mock Pinata credentials in ipfsService tests for CI
- fix: Remove unused imports and variables to pass linting
- fix: Regenerate package-lock.json files for CI compatibility
- fix: remove unnecessary URLs from Lighthouse configuration
- fix: update tests to use buyer1 as msg.sender for processPayment
- fix: address Slither static analysis findings
- fix: add --via-ir flag to Manticore solc compilation
- fix: Update package-lock.json to sync with package.json dependencies
- fix: Re-export computeMarketHashSimple from primeMapping utility
- fix: Remove contact information from development warning modal message
- fix: Improve error handling for contract deployment and ensure deployer signer availability

### ⚡ Performance

- perf(infra): right-size the gasless Cloud Run services (-$98.55/mo) (#1000)

### ♻️ Refactoring

- refactor(075): extract @fairwins/intent-types — one EIP-712 source (US4, extraction only)
- refactor(054): rename "wager tag" → "Callsign" across the stack + redeploy (#900)
- refactor(wallet): use vendor-neutral "Browser Wallet" default + bump web3 deps (#777)
- refactor(landing): move deployed-networks into a subtle header crawler (#745)
- refactor(frontend): Wire up v2 createWager/acceptWager/declareWinner flows
- refactor: Rebuild on-chain layer for P2P betting
- refactor(frontend): focus FriendMarketsModal on creation; migrate viewing to MyMarketsModal
- refactor(frontend): drop ClearPath/TokenMint UI and finish ETC→USDC sweep
- refactor(frontend): drop ETC/Mordor framing from UI copy, mock data, and tests
- refactor(frontend): rename ETCswap → Dex and drop limited-functionality banner
- refactor: Update key registration logic to ensure key is registered only if needed and handle existing keys gracefully
- refactor: Enhance Header component for app mode and update WalletPage layout
- refactor: Update Dashboard component to use new wallet connection hook and adjust tests accordingly
- refactor: Update onboarding tutorial to reflect new resolution methods and remove oracle references
- refactor: rename "market" to "wager" throughout the application for consistency
- refactor: improve code clarity per review feedback
- refactor: update token creation modal to use radio inputs for selection and improve accessibility
- refactor: simplify FRIEND_MARKET role verification by removing unused variables
- refactor: clean up imports and variable names in tests and components
- refactor: replace CONTRACT_ADDRESSES with getContractAddress for factory address retrieval
- refactor: simplify data loading logic in components and ensure cleanup on unmount
- refactor: Reorganize smart contracts into logical folder structure

### 📚 Documentation

- docs(release): record quickstart validation and the operational gap (076 T050-T052)
- spec(076): narrow the no-implementation-details claim, fix problem-statement grammar
- spec(076): monorepo semantic versioning and release promotion
- docs(claude): correct three claims that went stale (#1038, spec 075)
- docs(075): T023 is done — all six E2E layers resolved
- docs(075): repair a tasks.md line mangled by shell backtick expansion
- docs(075): CLAUDE.md guardrail for the workspace + the two monorepo skills
- docs(075): add monorepo-workspace + monorepo-verify skills
- docs(074): spec + plan for monorepo workspaces, packages, and a target graph
- docs: state what the loader actually verifies, not more
- docs: publish the mini-app guide and runbook in the nav
- docs: point the open-challenges guide at Transfer → Wagers
- docs(blog): announce the staking feature (#959)
- docs(065): specify Earn liquid & delegated staking feature (#957)
- spec(063): universal acting-account + cross-chain legacy recovery (design) (#951)
- docs(blog): add 18 Finance Professional Series briefings (#947)
- docs(blog): add 20 Knowledge Base concept primers with schedule (#946)
- docs(blog): rewrite all 34 posts for a semi-technical audience (#945)
- docs(blog): blockchain architecture blog program — inventory + 34 drafted posts (#943)
- spec(056): collectibles sell-side trading (Phase 2) — specify (#907)
- docs(research): OpenSea SDK analysis for minimal in-app NFT trading (#904)
- docs(035,036): intent-based signatures + relayer infrastructure specs (#783)
- spec(034): ZK-Wager Pools — group pools, 4-word gateway, anonymous consensus (#768)
- docs(specs): close shipped-but-unmarked tasks (024/025/026/027) + deploy README (#739)
- docs: remove archived futarchy drift from governance & security (#738)
- docs: align docs with UUPS proxies + open challenges + vouchers (#735)
- spec: membership purchase progress indicator (022) (#718)
- docs: design-agent prompt for My Account stats dashboard (#710)
- docs(spec): add Spec 017 — v2 WagerRegistry subgraph + per-transfer records
- spec(017): clarify surface, detail view, tab labels
- spec(017): My Wagers card grid redesign
- docs(reference): rewrite API/contracts/configuration for v2; archive unshipped badge spec
- docs: refresh documentation to match the live v2 P2P wager system
- docs(009): spec, plan, and tasks for QR share & scan rendering
- spec(008): runtime chain consistency across frontend modals
- docs(speckit): 007 compliance-gating spec/plan/tasks/research/data-model/contracts
- spec: Polymarket-only oracle selection (frontend) — /speckit-specify
- spec: complete remaining E2E stubs (encryption, privacy, lifecycle) — /speckit-specify
- spec: Cypress E2E flow coverage (Spec Kit) + remove obsolete dispute spec
- docs: add FairWins functional testing checklist (#607)
- docs: fix leftover token symbol text regressions
- docs(vault): drop ETC mainnet/Mordor RPC entries from example .env
- docs: drop ETC/Mordor framing from active docs and runbook copy
- docs: plan Polygon Amoy migration to unblock Polymarket-pegged side bets
- docs: Update documentation for P2P wager pivot, archive 27 outdated files
- docs: Update README to reflect P2P wager management focus
- docs: Add comprehensive implementation plan and updated flow diagrams
- docs: Add comprehensive system flow diagrams and consistency analysis
- docs: Add P2P wager platform architecture assessment
- docs: Add comprehensive nullifier system documentation

### 🧪 Tests

- test(1028): membership headroom + deterministic address-resolution wait
- test(1028): seed encryption keys in the wager specs; harden the seeding command
- test(075): get Cypress past the entry gate (T023, layer 1 of at least 3)
- test(074): mini-app byte-reproducibility gate + recorded baseline (US3 prereq)
- test(coverage): include access/upgradeable/integration suites in contract coverage (#748)
- test(024): close the open-challenge hardening test gaps + evidence coverage (#741)
- test(008): regression guard for build-bound chain resolution (FR-011)
- test(007): set VITE_ORACLE_MODELS=all for FriendMarketsModal oracle specs
- test(oracle-hiding): component-level coverage + fix conditional help-text leak
- test(e2e): harden specs per adversarial review (kill false-confidence)
- test(e2e): US3 encrypted privacy round-trip (T006-T007)
- test(e2e): US2 on-chain key registration (T004-T005)
- test(e2e): foundation (T001-T002) + US1 lifecycle journeys (T003)
- test(e2e): salt prepareCondition questionId for node-reuse robustness
- test(e2e): implement US4 oracle-resolution (Polymarket + tie fix)
- test(e2e): implement US3 refund-timeout
- test(e2e): implement US6 admin-panel (read-only)
- test(e2e): implement US2 frozen-accounts + US5 expired-membership
- test(e2e): stabilize createAndAcceptWager via chainTx (verified on live chain)
- test(e2e): US1 paused-protocol — PAU-01 verified on live chain-1337 loop
- test(e2e): suppress dev-warning modal/banner overlays in mockWeb3Provider
- test: update getContractAddressForChain test for the now-live Polygon deployment
- test: add PolymarketOracleAdapter unit suite + lifecycle E2E; measure oracle coverage
- test(admin): drop unused txReceipt destructure to fix lint
- test(smoke): replay patched modal's contract calls on Amoy
- test: Add end-to-end smoke test for the v2 wager lifecycle
- test(frontend): repair Dashboard.test mocks after demoMode + DexContext changes
- test: Add FriendGroupMarketFactory UMA oracle integration tests
- test: Add FriendGroupMarketFactory oracle integration tests
- test: Add OracleRegistry tests and MockOracleAdapter (PR5)
- test: update market metadata tests to store resolution criteria separately and add description parsing tests

### 🏗️ Infrastructure

- ci: draft PRs no longer run CI; stop uploading videos of passing runs
- ci(subgraph): run Matchstick via vendored Docker image
- ci: stop the weekly torture test from spuriously failing
- ci(oracles): soft-skip fork tests on PRs without AMOY_RPC_URL secret

### 🧹 Maintenance

- chore: remove the vestigial pool relayer (#1062)
- chore(deps): Bump @solana/kit from 5.5.1 to 7.0.0
- chore(deps): Bump actions/upload-pages-artifact from 3 to 5
- chore(deps): Bump actions/setup-node from 4 to 7
- chore(deps): Bump actions/github-script from 7 to 9
- chore(deps): ignore hardhat TOOLCHAIN majors, not just hardhat itself
- chore(deps): Bump @solana-program/system from 0.10.0 to 0.13.0
- chore(deps): Bump actions/cache from 4 to 6
- chore(deps): Bump actions/upload-artifact from 4 to 7
- chore(deps): Bump actions/download-artifact from 4 to 8
- chore(075): dependabot + mechanise the archive rule (Polish)
- chore(075): drop 4 unused frontend deps (US3 prerequisite, T035)
- chore(075): renumber 074 -> 075 (spec-number collision with unified-my-account)
- chore(057): pin gateway image to predict-058 (builder-sign live) (#913)
- chore(054): record WagerTagRegistry Polygon mainnet deploy (#899)
- chore(frontend): point Amoy subgraph at fairwins-amoy v0.3.0 (#759)
- chore(frontend): remove dead code surfaced by audit (#753, #754) (#757)
- chore(deploy): Amoy (80002) — feature-complete set (UUPS membership + voucher) (#731)
- chore(deploy): Amoy (80002) — UUPS WagerRegistry + 024 open challenges (#729)
- chore: enable frontend-design plugin; gitignore .playwright-mcp artifacts (#716)
- chore(deploy): redeploy v2 contracts on Polygon Amoy to mainnet parity
- chore(spec-012): mark T033 complete — PR #651 opened
- chore(spec-011): record T021 complete; T020 awaits manual device matrix
- chore(spec-011): polish gates, lint fix, and analysis remediations
- chore(ci): upgrade Node.js 20 → 22 across CI workflows and Dockerfiles
- chore(007): sync frontend to Polygon 137 cutover addresses
- chore(007): record Polygon mainnet (137) cutover addresses
- chore(007): add deploy:polygon npm script
- chore(007): mark T052 — Slither static analysis green in CI
- chore(007): mark Phase 9 a11y/CI/docs tasks complete
- chore(007): phase 9 — a11y tests, fork-test CI wiring, deploy/migration runbook
- chore(005): mark T005/T010 (contract, on 004 branch) + T009a/T013a (FR-010) complete
- chore: set up Spec Kit for spec-driven feature development (#628)
- chore(frontend): wire Polygon mainnet (137) config for live v2 deployment
- chore: update frontend package-lock.json
- revert(frontend): re-apply create-only wager modal from PR #582
- chore(oracles): clean up obsolete comment in UMA CEI block
- chore(oracles): close UMA reentrancy gap, add registry tests + fork CI
- chore(frontend): Move orphan futarchy UI to legacy/
- chore: strip dead ClearPath/TokenMint CSS, theme, and doc stragglers
- chore: catch leftover ETC label in archived perpetual-futures deploy script
- chore: finish ETC/Mordor/USC → MATIC/USDC sweep across non-frontend
- chore(nginx): swap Mordor/ETC RPC hosts for Polygon Amoy in CSP
- chore: final ETC → MATIC sweep across scripts, tests, and contracts list
- chore: strip ETC/Mordor framing from contracts, scripts, tests, and env
- chore: remove Mordor chain from network config and deploy paths
- chore: trigger frontend rebuild after wager terminology refactor
- chore: update dependencies in package.json
- chore: sync package-lock.json files
- style: update card description styling for improved visibility and adjust stats row positioning
- chore: add @walletconnect/ethereum-provider dependency

<!-- RELEASES:END -->
