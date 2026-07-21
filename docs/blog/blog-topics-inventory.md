# FairWins Blog Topic Inventory — Blockchain System Architecture

*An editorial backlog of engineering deep-dives drawn from the FairWins /
Prediction DAO codebase, aimed at the crypto and digital-asset developer
ecosystem.*

This document inventories the discrete systems in the platform that are
strong candidates for architecture blog posts. Each entry lists a brief
description, the intended audience, category tags, whether it belongs to a
broader series or stands alone, and a quality evaluation.

The one published post to date —
[*Private Prediction Markets: Confidential Terms with Trustless
Settlement*](private-prediction-markets-envelope-encryption.md) — is folded
into the **Privacy Architecture** series below as the anchor piece.

---

## How to read the quality evaluation

Each topic carries a score from **1–5** built from four factors:

- **Novelty** — how uncommon or hard-won the approach is.
- **Audience pull** — how much the crypto/dev ecosystem actively searches for it.
- **Differentiation** — whether we can say something most writeups don't.
- **Proof** — whether shipped, tested code backs the claims (not vaporware).

- ⭐⭐⭐⭐⭐ **Flagship** — lead with these; broad reach and a genuinely
  differentiated take.
- ⭐⭐⭐⭐ **Strong** — reliably good technical content with clear demand.
- ⭐⭐⭐ **Solid** — worth writing, narrower audience or more familiar ground.
- ⭐⭐ **Niche** — valuable to a specific segment; lower reach.

---

## Summary matrix

| # | Topic | Series | Score | Primary audience |
|---|-------|--------|-------|------------------|
| 1 | Role-based access control & the operations control plane | Identity & Access | ⭐⭐⭐⭐ | Protocol / backend eng |
| 2 | Soulbound memberships + transferable vouchers | Identity & Access | ⭐⭐⭐⭐ | Token designers, product |
| 3 | Sanctions & compliance gating as a contract primitive | Identity & Access | ⭐⭐⭐ | Compliance eng, founders |
| 4 | Passkey smart accounts (ERC-4337 + WebAuthn) | Accounts & Keys | ⭐⭐⭐⭐⭐ | Wallet / AA developers |
| 5 | Account recovery & unified connect | Accounts & Keys | ⭐⭐⭐⭐ | Wallet / UX eng |
| 6 | Sponsored gas with a self-hosted verifying paymaster (ERC-7677) | Accounts & Keys | ⭐⭐⭐⭐⭐ | AA / infra developers |
| 7 | Safe multisig custody integration | Custody & Multisig | ⭐⭐⭐ | Treasury / DAO eng |
| 8 | On-chain multisig policy engine (transaction guards) | Custody & Multisig | ⭐⭐⭐⭐ | Security / DAO eng |
| 9 | Intent-based gasless payments (EIP-712 + EIP-3009) | Gasless Rails | ⭐⭐⭐⭐ | dApp / relayer devs |
| 10 | Relayer gateway architecture (policy + engine split) | Gasless Rails | ⭐⭐⭐⭐ | Infra / backend eng |
| 11 | UUPS upgrades & storage-layout safety | Contract Architecture | ⭐⭐⭐⭐ | Solidity engineers |
| 12 | The two-facet proxy: beating the 24 KB limit | Contract Architecture | ⭐⭐⭐⭐⭐ | Solidity engineers |
| 13 | Deterministic / singleton deployment across chains | Contract Architecture | ⭐⭐⭐ | Protocol / DevOps eng |
| 14 | The wager lifecycle contract | Prediction Markets | ⭐⭐⭐⭐ | Smart-contract devs |
| 15 | Oracle adapter abstraction (Polymarket / Chainlink / UMA) | Prediction Markets | ⭐⭐⭐⭐⭐ | Oracle / integration eng |
| 16 | Draw resolution & open-challenge wagers | Prediction Markets | ⭐⭐⭐ | Smart-contract devs |
| 17 | Wager pools: ERC-1167 clones & address-keyed payouts | Prediction Markets | ⭐⭐⭐⭐ | Smart-contract devs |
| 18 | Envelope encryption for private markets *(published)* | Privacy Architecture | ⭐⭐⭐⭐⭐ | Applied crypto, fintech |
| 19 | Multi-recipient encryption | Privacy Architecture | ⭐⭐⭐ | Applied crypto eng |
| 20 | Client-side encrypted data sync | Privacy Architecture | ⭐⭐⭐ | Privacy / app eng |
| 21 | The nullifier system | Privacy Architecture | ⭐⭐⭐⭐ | ZK / privacy eng |
| 22 | The FeeRouter: one source of truth for platform fees | Finance Surfaces | ⭐⭐⭐⭐ | Protocol / product eng |
| 23 | Earn: wrapping ERC-4626 lending vaults with fee disclosure | Finance Surfaces | ⭐⭐⭐ | DeFi integrators |
| 24 | Predict: Polymarket trading via builder codes | Finance Surfaces | ⭐⭐⭐⭐ | DeFi / trading devs |
| 25 | Bitcoin: adding a non-EVM chain to an EVM app | Finance Surfaces | ⭐⭐⭐⭐⭐ | Multi-chain / wallet eng |
| 26 | ClearPath: a multi-network external DAO registry | Multi-chain Infra | ⭐⭐⭐ | DAO / infra eng |
| 27 | Indexing without a subgraph (graceful degradation) | Multi-chain Infra | ⭐⭐⭐⭐ | Data / infra eng |
| 28 | The unified activity ledger | Multi-chain Infra | ⭐⭐⭐ | Full-stack / data eng |
| 29 | AI-driven smart-contract security review in CI | Security & DevOps | ⭐⭐⭐⭐⭐ | Security eng, AI-curious |
| 30 | Coverage & audit gates that fail loudly | Security & DevOps | ⭐⭐⭐ | Eng leads, security |
| 31 | Symbolic execution & fuzzing a wager protocol | Security & DevOps | ⭐⭐⭐⭐ | Security researchers |
| 32 | Spec-driven development with Spec Kit | Security & DevOps | ⭐⭐⭐ | Eng leaders, agent devs |
| 33 | CallsignRegistry: an in-house ENS-style naming system | Standalone | ⭐⭐⭐ | Naming / identity eng |
| 34 | TokenFactory: templated token minting | Standalone | ⭐⭐ | Token / product eng |

---

## Series 1 — Identity & Access

The role model, membership economics, and compliance gates. Great for
founders and protocol engineers wrestling with "who can do what, and how do
we sell access without a database."

### 1. Role-based access control & the operations control plane
- **Description:** One user-purchasable role and six operator roles, every
  privileged action gated by exactly one role via OpenZeppelin AccessControl,
  surfaced through a grouped `/admin` console where each view appears only if
  the connected wallet holds the required role. Covers the discipline of
  "one action, one role," the operations control plane grouping (Control Room,
  Incident Response, Compliance, Membership & Revenue, Protocol Config,
  Identity, Access Control, Infrastructure), and how role checks flow from
  contract to UI.
- **Audience:** Protocol/backend engineers, technical founders.
- **Tags:** `access-control`, `rbac`, `solidity`, `openzeppelin`, `admin-ux`.
- **Series:** Identity & Access (part 1).
- **Quality:** ⭐⭐⭐⭐ — Access control is universally relevant; the
  role-to-console mapping is a concrete, reusable pattern most teams reinvent.

### 2. Soulbound memberships + transferable vouchers
- **Description:** Membership is a **soulbound** (non-transferable),
  time-bound tier sold in USDC by `MembershipManager` with per-tier throughput
  limits. Vouchers (`MembershipVoucher`, ERC-721) decouple *purchase* from
  *ownership*: a voucher confers nothing while held, so it can be gifted or
  resold, and redeeming it burns the NFT and writes the soulbound membership
  to the redeemer. A clean case study in when to make a token
  transferable vs. not, and how to build a gift/resale market on top of a
  non-transferable primitive.
- **Audience:** Token designers, product engineers, growth.
- **Tags:** `soulbound`, `erc721`, `tokenomics`, `memberships`, `access-control`.
- **Series:** Identity & Access (part 2).
- **Quality:** ⭐⭐⭐⭐ — The soulbound-plus-voucher split is a genuinely
  interesting design tension with clear product motivation.

### 3. Sanctions & compliance gating as a contract primitive
- **Description:** `SanctionsGuard` (`ISanctionsGuard`) is a shared screening
  primitive reused across wagers, pools, and membership redemption. Explores
  compliance as a composable on-chain check rather than an off-chain
  afterthought, and how the same guard threads through independent subsystems.
- **Audience:** Compliance engineers, regulated-product founders.
- **Tags:** `compliance`, `sanctions`, `access-control`, `solidity`.
- **Series:** Identity & Access (part 3).
- **Quality:** ⭐⭐⭐ — Important and underdiscussed, but a narrower audience
  than the first two entries.

---

## Series 2 — Accounts & Keys

Passwordless accounts, recovery, and sponsored gas. This is the highest-demand
cluster right now — account abstraction and passkeys are hot search terms.

### 4. Passkey smart accounts (ERC-4337 + WebAuthn)
- **Description:** Account-native passkey wallets built on a
  `CoinbaseSmartWallet` / `MultiOwnable` foundation with WebAuthn (`webauthn-sol`,
  `FreshCryptoLib` P-256), ERC-1271 signatures, and ERC-4337 UserOps. Master
  seed derivation client-side, no seed phrase for the user. Covers the account
  contract, factory/first-use deploy, and the WebAuthn-to-secp256r1 verification
  path.
- **Audience:** Wallet developers, account-abstraction engineers.
- **Tags:** `account-abstraction`, `erc4337`, `passkeys`, `webauthn`, `p256`, `erc1271`.
- **Series:** Accounts & Keys (part 1).
- **Quality:** ⭐⭐⭐⭐⭐ — Passkeys + AA is one of the most-searched wallet
  topics; we have real, shipped contracts and libraries to show.

### 5. Account recovery & unified connect
- **Description:** The unified connect/recovery flow (spec 045) that merges
  wallet connection and account recovery into one surface, plus controller
  changes for passkey accounts. Tackles the hardest UX problem in
  self-custody: what happens when the device is lost, without reintroducing a
  seed phrase.
- **Audience:** Wallet/UX engineers, product designers.
- **Tags:** `account-recovery`, `passkeys`, `self-custody`, `ux`, `account-abstraction`.
- **Series:** Accounts & Keys (part 2).
- **Quality:** ⭐⭐⭐⭐ — Recovery is the make-or-break of passkey adoption;
  high interest, real design decisions to share.

### 6. Sponsored gas with a self-hosted verifying paymaster (ERC-7677)
- **Description:** A self-hosted **verifying paymaster** (EntryPoint v0.6,
  `FairWinsVerifyingPaymaster`) that reimburses the alto bundler from a
  FairWins-funded deposit, authorized per-op by a KMS-signed **ERC-7677**
  endpoint on the relay gateway (`POST /v1/paymaster`, reusing screening,
  quotas, and killswitch). Includes the never-stranded fallback to
  self-funded UserOps and honest fee disclosure (sponsored vs. user-pays).
- **Audience:** Account-abstraction and infrastructure developers.
- **Tags:** `paymaster`, `erc7677`, `erc4337`, `gasless`, `bundler`, `kms`.
- **Series:** Accounts & Keys (part 3).
- **Quality:** ⭐⭐⭐⭐⭐ — Running your own paymaster + bundler (not a vendor
  SDK) is exactly the kind of hard-won infra writeup the AA community devours.

---

## Series 3 — Custody & Multisig

For treasury, DAO, and security-minded readers: how organizational funds are
held and constrained.

### 7. Safe multisig custody integration
- **Description:** Safe-based custody (spec 043) with a `SafeProposalHub` and
  guard scaffolding for treasury and operator funds. How an app integrates
  Safe as the custody layer for privileged/treasury operations rather than
  rolling its own multisig.
- **Audience:** Treasury engineers, DAO tooling builders.
- **Tags:** `safe`, `multisig`, `custody`, `treasury`.
- **Series:** Custody & Multisig (part 1).
- **Quality:** ⭐⭐⭐ — Solid and practical; Safe integration is well-trodden,
  so differentiation comes from the guard/policy angle in part 2.

### 8. On-chain multisig policy engine (transaction guards)
- **Description:** `SafePolicyGuard` / `SafeGuard` — a policy engine (spec 049)
  that enforces rules on multisig transactions *at execution time* via Safe's
  guard interface. Encodes spending policies, allow/deny rules, and
  constraints directly on-chain, so the multisig can't execute a transaction
  that violates policy even with enough signatures.
- **Audience:** Security engineers, DAO/treasury tooling builders.
- **Tags:** `safe`, `multisig`, `policy-engine`, `transaction-guard`, `security`.
- **Series:** Custody & Multisig (part 2).
- **Quality:** ⭐⭐⭐⭐ — Programmable, enforced-on-chain multisig policy is a
  meatier, more differentiated topic than plain Safe integration.

---

## Series 4 — Gasless Rails

Two rails, one story: how the platform lets users transact without holding gas.

### 9. Intent-based gasless payments (EIP-712 + EIP-3009)
- **Description:** Relayed intents (specs 035/036): every actor action has an
  EIP-712 `…WithSig` twin, and value moves via EIP-3009
  (`…WithAuthorization`). Covers the discipline of keeping intent structs
  **byte-identical across three places** (contract typehashes, frontend, and
  gateway), and the always-available self-submit fallback.
- **Audience:** dApp developers, meta-transaction/relayer engineers.
- **Tags:** `eip712`, `eip3009`, `meta-transactions`, `gasless`, `intents`.
- **Series:** Gasless Rails (part 1).
- **Quality:** ⭐⭐⭐⭐ — The three-way struct-sync discipline is a real,
  battle-tested lesson that most tutorials skip.

### 10. Relayer gateway architecture (policy + engine split)
- **Description:** The relayer infrastructure (spec 036): a **policy gateway**
  (`relay-gateway`) that handles screening, quotas, and killswitch, in front of
  an **execution engine** (`oz-relayer`) and the alto bundler. Why the split
  matters, how the same gateway serves both relayed intents and the ERC-7677
  paymaster endpoint, and how it stays optional (self-submit never stranded).
- **Audience:** Infrastructure and backend engineers.
- **Tags:** `relayer`, `infrastructure`, `gasless`, `cloud-run`, `api-gateway`.
- **Series:** Gasless Rails (part 2).
- **Quality:** ⭐⭐⭐⭐ — The policy/engine separation and shared-gateway reuse
  is a strong systems-design narrative.

---

## Series 5 — Contract Architecture

Solidity craft: upgrades, size limits, and deterministic deployment. Pure
engineer bait.

### 11. UUPS upgrades & storage-layout safety
- **Description:** Multiple UUPS proxies at stable addresses (`WagerRegistry`,
  `MembershipManager`, `WagerPoolFactory`, `FeeRouter`, `CallsignRegistry`) all
  built on a shared `UUPSManaged` base: one-time `initialize` instead of a
  constructor, append-only storage with a trailing `__gap`, and a CI-gated
  `check:storage-layout`. How to ship logic changes in place without corrupting
  state.
- **Audience:** Solidity engineers.
- **Tags:** `uups`, `proxy`, `upgradeable`, `storage-layout`, `solidity`.
- **Series:** Contract Architecture (part 1).
- **Quality:** ⭐⭐⭐⭐ — Upgrade safety is a perennial pain point; the CI gate
  and shared base make for a concrete, copyable pattern.

### 12. The two-facet proxy: beating the 24 KB contract-size limit
- **Description:** The wager registry is **two facets behind one proxy**:
  `WagerRegistry` delegatecalls unknown selectors to `WagerRegistryIntents`
  (the `…WithSig` twins plus relocated batch/auto-resolve functions) because the
  main implementation sits against the EIP-170 24 KB code limit. Both inherit a
  single `WagerRegistryCore` storage definition, validated as a pair by
  `check:storage-layout`. A real-world answer to "my contract won't fit."
- **Audience:** Solidity engineers hitting the size ceiling.
- **Tags:** `eip170`, `proxy`, `delegatecall`, `facets`, `solidity`, `diamond-adjacent`.
- **Series:** Contract Architecture (part 2).
- **Quality:** ⭐⭐⭐⭐⭐ — The 24 KB limit is a wall every ambitious protocol
  hits; a shipped, non-Diamond solution with shared storage is highly
  clickable and rarely written up well.

### 13. Deterministic / singleton deployment across chains
- **Description:** Singleton deployment patterns (see
  `docs/developer-guide/singleton-deployment-patterns.md`) and
  `getContractAddressForChain` as the single resolver, giving stable addresses
  across Mordor, Polygon, and Ethereum. How deterministic deployment keeps
  frontend, subgraph, and gateway pointed at the right contract on every chain.
- **Audience:** Protocol engineers, DevOps.
- **Tags:** `create2`, `deterministic-deployment`, `multi-chain`, `devops`.
- **Series:** Contract Architecture (part 3).
- **Quality:** ⭐⭐⭐ — Useful and practical, somewhat more familiar territory.

---

## Series 6 — Prediction Markets

The core product surface. These pair well with the published privacy post.

### 14. The wager lifecycle contract
- **Description:** `WagerRegistry` v2 as a state machine:
  `WagerCreated` → `WagerAccepted` → `PayoutClaimed` / `WagerRefunded` /
  `WagerCancelled` / `WagerDrawn`, with two absolute deadlines
  (`acceptDeadline`, `resolveDeadline`), checks-effects-interactions
  throughout, and USDC/WMATIC escrow. A clean anatomy of a peer-to-peer escrow
  contract.
- **Audience:** Smart-contract developers.
- **Tags:** `escrow`, `state-machine`, `solidity`, `prediction-markets`, `p2p`.
- **Series:** Prediction Markets (part 1).
- **Quality:** ⭐⭐⭐⭐ — The lifecycle framing is approachable and broadly
  instructive for anyone building escrow.

### 15. Oracle adapter abstraction (Polymarket / Chainlink / UMA)
- **Description:** A single `IOracleAdapter` interface with concrete adapters
  for Polymarket, Chainlink Data Feeds, Chainlink Functions, and UMA's
  Optimistic Oracle V3. How one resolution interface absorbs three very
  different oracle models (push feeds, request/callback, optimistic dispute),
  and the trade-offs each brings.
- **Audience:** Oracle integrators, smart-contract engineers.
- **Tags:** `oracles`, `chainlink`, `uma`, `polymarket`, `adapter-pattern`.
- **Series:** Prediction Markets (part 2).
- **Quality:** ⭐⭐⭐⭐⭐ — A side-by-side of three major oracle designs behind
  one interface is genuinely valuable and rarely covered in one place.

### 16. Draw resolution & open-challenge wagers
- **Description:** Draw handling (spec 004) for wagers that resolve to neither
  side, and open-challenge wagers (spec 024/041) — code-gated wagers with no
  named opponent that anyone can take. Covers the edge cases that make a
  betting protocol robust.
- **Audience:** Smart-contract developers.
- **Tags:** `prediction-markets`, `escrow`, `edge-cases`, `solidity`.
- **Series:** Prediction Markets (part 3).
- **Quality:** ⭐⭐⭐ — A good depth piece for the series; narrower on its own.

### 17. Wager pools: ERC-1167 clones & address-keyed payouts
- **Description:** Group wager pools (spec 034) as a deliberately parallel
  system: a `WagerPoolFactory` (UUPS) that clones **immutable** `WagerPool`
  instances via ERC-1167 minimal proxies, with no anonymity layer — membership,
  voting, and claims are by public wallet address, resolved by a
  creator-proposed payout matrix keyed by winner address that members approve
  to a threshold. A study in choosing a different architecture for a sibling
  feature.
- **Audience:** Smart-contract developers.
- **Tags:** `erc1167`, `minimal-proxy`, `clones`, `factory`, `governance`.
- **Series:** Prediction Markets (part 4).
- **Quality:** ⭐⭐⭐⭐ — The "when clones beat a registry" contrast and
  address-keyed payout matrix make for a substantive piece.

---

## Series 7 — Privacy Architecture

The published post anchors this series; the rest deepen the privacy story.

### 18. Envelope encryption for private prediction markets *(published)*
- **Description:** Confidential wager terms with trustless settlement via
  envelope encryption — the existing flagship post. Already live at
  [`private-prediction-markets-envelope-encryption.md`](private-prediction-markets-envelope-encryption.md).
- **Audience:** Applied cryptographers, fintech engineers.
- **Tags:** `encryption`, `envelope-encryption`, `privacy`, `prediction-markets`.
- **Series:** Privacy Architecture (part 1, published).
- **Quality:** ⭐⭐⭐⭐⭐ — Strong narrative-driven anchor; already the model
  for tone and depth.

### 19. Multi-recipient encryption
- **Description:** Multi-recipient encryption (spec 005): encrypting a single
  payload so that several parties can each decrypt it, without re-encrypting
  per recipient at rest. The key-wrapping mechanics behind sharing an encrypted
  wager with more than one viewer.
- **Audience:** Applied cryptography engineers.
- **Tags:** `encryption`, `key-wrapping`, `privacy`, `cryptography`.
- **Series:** Privacy Architecture (part 2).
- **Quality:** ⭐⭐⭐ — Good technical follow-up; depends on part 1 for context.

### 20. Client-side encrypted data sync
- **Description:** Encrypted data sync (spec 032): synchronizing user data
  across devices while keeping plaintext on the client only. How the server
  stores ciphertext it can't read and how keys travel with the user.
- **Audience:** Privacy-focused app engineers.
- **Tags:** `e2ee`, `data-sync`, `privacy`, `client-side-encryption`.
- **Series:** Privacy Architecture (part 3).
- **Quality:** ⭐⭐⭐ — Practical E2EE sync content; moderate reach.

### 21. The nullifier system
- **Description:** The nullifier system (`docs/NULLIFIER_SYSTEM.md`,
  `docs/developer-guide/nullifier-system.md`): preventing double-spend/replay
  of privacy-preserving actions using nullifiers, a core primitive from the ZK
  world applied here. How nullifiers are derived, stored, and checked.
- **Audience:** ZK and privacy engineers.
- **Tags:** `nullifiers`, `zk`, `privacy`, `replay-protection`.
- **Series:** Privacy Architecture (part 4).
- **Quality:** ⭐⭐⭐⭐ — Nullifiers are catnip for the ZK-curious and
  underexplained outside pure-ZK contexts.

---

## Series 8 — Finance Surfaces

The "money moves" features — Earn, Predict, fees, and Bitcoin. Appeals to
DeFi builders and product teams.

### 22. The FeeRouter: one source of truth for platform fees
- **Description:** `FeeRouter` (spec 060, UUPS) as the *single* fee-config
  store: every configurable fee is a `bytes32 serviceId` with a per-service
  hard cap, never a hardcoded bps value in client or gateway code. Atomic
  wrapped charging (`depositToVaultWithFee`), honest pre-signature disclosure
  with a `maxFeeBps` ceiling members can't be charged above, and
  byte-identical zero-fee behavior. A model for centralizing fee logic without
  centralizing trust.
- **Audience:** Protocol and product engineers.
- **Tags:** `fees`, `fee-router`, `solidity`, `uups`, `product`.
- **Series:** Finance Surfaces (part 1).
- **Quality:** ⭐⭐⭐⭐ — "One source of truth for fees, capped and disclosed"
  is a clean, opinionated design story many teams get wrong.

### 23. Earn: wrapping ERC-4626 lending vaults with fee disclosure
- **Description:** Earn/lending rewards (spec 050) that route deposits into
  ERC-4626 vaults, charging a fee atomically through the FeeRouter and
  disclosing the live rate before signature. How to wrap an external yield
  source without custody surprises.
- **Audience:** DeFi integrators.
- **Tags:** `erc4626`, `defi`, `lending`, `yield`, `fees`.
- **Series:** Finance Surfaces (part 2).
- **Quality:** ⭐⭐⭐ — Useful integration pattern; ERC-4626 is familiar ground.

### 24. Predict: Polymarket trading via builder codes
- **Description:** Predict (spec 057): Polymarket CLOB trading with **no
  contract changes and no custody** — the member's wallet is the only order
  signer — monetized through Polymarket's builder-code program (a `bytes32`
  code attached to every order for a builder fee). Why the additive builder fee
  must be disclosed as its own honest line, and why it's Polygon-only.
- **Audience:** DeFi/trading integrators.
- **Tags:** `polymarket`, `clob`, `trading`, `builder-codes`, `non-custodial`.
- **Series:** Finance Surfaces (part 3).
- **Quality:** ⭐⭐⭐⭐ — Non-custodial CLOB integration + builder-code
  monetization is a timely, concrete revenue-model writeup.

### 25. Bitcoin: adding a non-EVM chain to an EVM-native app
- **Description:** Bitcoin support (spec 061), the first **non-EVM** network:
  string network ids kept strictly parallel to the numeric EVM chain map,
  client-side BIP84/BIP86 key derivation from the passkey master seed, rotating
  receive addresses with gap-limit-20 discovery, fail-safe stamp handling, and
  a hard fee-signing ceiling. How to bolt a fundamentally different chain onto
  an EVM codebase without corrupting its abstractions.
- **Audience:** Multi-chain and wallet engineers.
- **Tags:** `bitcoin`, `non-evm`, `bip84`, `bip86`, `hd-wallets`, `multi-chain`.
- **Series:** Finance Surfaces (part 4).
- **Quality:** ⭐⭐⭐⭐⭐ — "We added Bitcoin to our Ethereum app and here's every
  boundary we had to guard" is a rare, highly shareable engineering story.

---

## Series 9 — Multi-chain Infrastructure

Cross-cutting infra: DAO registries, indexing, and the activity ledger.

### 26. ClearPath: a multi-network external DAO registry
- **Description:** ClearPath (specs 030/042) and `ExternalDAORegistry`: a
  standard for referencing and integrating external DAOs across multiple
  networks. The data model and resolution flow for treating other DAOs as
  first-class, multi-network citizens.
- **Audience:** DAO tooling and infrastructure engineers.
- **Tags:** `dao`, `registry`, `multi-chain`, `interoperability`.
- **Series:** Multi-chain Infra (part 1).
- **Quality:** ⭐⭐⭐ — Interesting for the DAO-tooling niche; narrower reach.

### 27. Indexing without a subgraph (graceful degradation)
- **Description:** Networks-without-subgraph support
  (`docs/developer-guide/networks-without-subgraph.md`): how the app keeps
  working when The Graph isn't available on a chain, falling back to direct RPC
  reads and event scanning. Designing features that degrade honestly instead of
  breaking on unsupported networks.
- **Audience:** Data and infrastructure engineers.
- **Tags:** `the-graph`, `subgraph`, `indexing`, `rpc`, `graceful-degradation`.
- **Series:** Multi-chain Infra (part 2).
- **Quality:** ⭐⭐⭐⭐ — "What to do when there's no subgraph" is a real
  operational problem with little published guidance.

### 28. The unified activity ledger
- **Description:** The unified activity ledger (spec 051): a single normalized
  feed that merges wagers, pools, transfers, and other events into one
  chronological view across subgraph and RPC sources. How to reconcile
  heterogeneous on-chain activity into one coherent timeline.
- **Audience:** Full-stack and data engineers.
- **Tags:** `activity-feed`, `indexing`, `data-modeling`, `full-stack`.
- **Series:** Multi-chain Infra (part 3).
- **Quality:** ⭐⭐⭐ — Solid full-stack content; a familiar problem shape.

---

## Series 10 — Security & DevOps

How the protocol is verified and shipped. Strong for security researchers and
engineering leaders — and the AI-security angle is a standout.

### 29. AI-driven smart-contract security review in CI
- **Description:** The Ethereum security agent (`.github/agents/`,
  `docs/developer-guide/ethereum-security-agent*.md`): an AI security reviewer
  wired into CI that reviews contract changes against a curated checklist.
  How an LLM-based reviewer complements — not replaces — Slither, symbolic
  execution, and human review, and how it's configured to be useful rather than
  noisy.
- **Audience:** Security engineers, AI-in-DevOps-curious teams.
- **Tags:** `ai-security`, `ci`, `smart-contract-security`, `llm`, `devops`.
- **Series:** Security & DevOps (part 1).
- **Quality:** ⭐⭐⭐⭐⭐ — AI + smart-contract security is a magnet topic right
  now, and a shipped CI agent (not a demo) is strongly differentiated.

### 30. Coverage & audit gates that fail loudly
- **Description:** Audit-coverage gating (spec 046) and the "CI fails loudly —
  no `continue-on-error`" doctrine: coverage thresholds, storage-layout checks,
  Slither/Medusa, and how the gates are wired so a regression can't merge.
- **Audience:** Engineering leads, security-minded teams.
- **Tags:** `ci`, `test-coverage`, `audit`, `quality-gates`, `slither`.
- **Series:** Security & DevOps (part 2).
- **Quality:** ⭐⭐⭐ — Good engineering-culture piece; less flashy than part 1.

### 31. Symbolic execution & fuzzing a wager protocol
- **Description:** The static-analysis, symbolic-execution, and fuzz-testing
  stack (`docs/security/`): Slither for static analysis, Manticore for symbolic
  execution (see `docs/MANTICORE_FIX.md`), and Medusa/fuzzing for property
  testing — applied to escrow and payout logic. What each tool actually caught.
- **Audience:** Security researchers, advanced Solidity engineers.
- **Tags:** `symbolic-execution`, `fuzzing`, `manticore`, `slither`, `formal-methods`.
- **Series:** Security & DevOps (part 3).
- **Quality:** ⭐⭐⭐⭐ — A concrete tour of heavyweight verification tools with
  real findings is high-value for the security crowd.

### 32. Spec-driven development with Spec Kit
- **Description:** How the repo uses GitHub's Spec Kit
  (`/speckit-*` workflow: constitution → specify → clarify → plan → tasks →
  analyze → implement) to ship 60+ features repeatably, with a binding
  constitution every plan must pass. A process story about building complex
  crypto systems with (and alongside) coding agents.
- **Audience:** Engineering leaders, agent/tooling developers.
- **Tags:** `spec-driven-development`, `spec-kit`, `process`, `ai-agents`.
- **Series:** Security & DevOps (part 4).
- **Quality:** ⭐⭐⭐ — Process content with real breadth to point at; appeals
  to the growing "build with agents" audience.

---

## Standalone topics

Discrete systems that don't need a series to stand on.

### 33. CallsignRegistry: an in-house ENS-style naming system
- **Description:** `CallsignRegistry` (spec 054, UUPS): an **optional**,
  Gold-tier-gated `%callsign` naming registry with ENS-style commit→reveal
  registration, standalone (not routed through the wager path), holding no
  funds, resolving identity for display with the priority **address book >
  callsign > ENS > generated**. A study in building your own naming layer and
  keeping it strictly optional on the value path.
- **Audience:** Naming/identity engineers, product teams.
- **Tags:** `naming`, `ens`, `commit-reveal`, `identity`, `uups`.
- **Series:** Standalone.
- **Quality:** ⭐⭐⭐ — "Why and how we built our own ENS-lite" is a fun,
  self-contained build story.

### 34. TokenFactory: templated token minting
- **Description:** `TokenFactory` (spec 028) with token templates: minting new
  tokens from vetted templates rather than arbitrary bytecode. The template
  model and what it constrains.
- **Audience:** Token/product engineers.
- **Tags:** `token-factory`, `erc20`, `templates`, `minting`.
- **Series:** Standalone.
- **Quality:** ⭐⭐ — Useful but the most familiar/commoditized topic in the set.

---

## Suggested publishing order

1. **Passkey smart accounts** (#4) — highest search demand, strong hook.
2. **The two-facet proxy** (#12) — pure engineer bait, very shareable.
3. **Oracle adapter abstraction** (#15) — three oracles, one interface.
4. **Sponsored gas / verifying paymaster** (#6) — completes the AA story.
5. **AI-driven security review in CI** (#29) — rides the AI-security wave.
6. **Bitcoin on an EVM app** (#25) — distinctive multi-chain narrative.

From there, fill in each series around these anchors. The published envelope
encryption post already demonstrates the house style: a concrete human
scenario, then the architecture revealed stage by stage.
