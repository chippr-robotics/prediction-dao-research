# FairWins Engineering Blog — Post Drafts

This directory holds the draft content for the 34-topic blockchain-architecture
blog program scoped in [`../blog-topics-inventory.md`](../blog-topics-inventory.md).

Each post lives in its own numbered directory with two files:

- `blog.md` — the full post (~1,200–1,900 words): a concrete opening scenario,
  the architecture walked stage by stage, real code excerpts drawn from the
  repo, a design-decisions / trade-offs section, and a **Sources** section
  citing the specs, docs, and contracts of record plus external standards.
- `social.md` — the promotion kit: an X (Twitter) post, a LinkedIn post, and a
  16:9 banner **image prompt** for Gemini / Nano Banana.

Every technical claim was researched against the repository's source of truth
(specs under `specs/`, developer guides under `docs/developer-guide/`, runbooks
under `docs/runbooks/`, and the Solidity / service code itself). Where the repo
contradicted the inventory's original blurb, the repo won — see topic 21 for a
notable correction.

## Index

| # | Post | Series |
|---|------|--------|
| 01 | [Role-based access control & the operations control plane](01-rbac-operations-control-plane/blog.md) | Identity & Access |
| 02 | [Soulbound memberships + transferable vouchers](02-soulbound-memberships-vouchers/blog.md) | Identity & Access |
| 03 | [Sanctions & compliance gating as a contract primitive](03-sanctions-compliance-gating/blog.md) | Identity & Access |
| 04 | [Passkey smart accounts (ERC-4337 + WebAuthn)](04-passkey-smart-accounts/blog.md) | Accounts & Keys |
| 05 | [Account recovery & unified connect](05-account-recovery-unified-connect/blog.md) | Accounts & Keys |
| 06 | [Sponsored gas with a self-hosted verifying paymaster (ERC-7677)](06-sponsored-gas-verifying-paymaster/blog.md) | Accounts & Keys |
| 07 | [Safe multisig custody integration](07-safe-multisig-custody/blog.md) | Custody & Multisig |
| 08 | [On-chain multisig policy engine (transaction guards)](08-multisig-policy-engine/blog.md) | Custody & Multisig |
| 09 | [Intent-based gasless payments (EIP-712 + EIP-3009)](09-intent-based-gasless-payments/blog.md) | Gasless Rails |
| 10 | [Relayer gateway architecture (policy + engine split)](10-relayer-gateway-architecture/blog.md) | Gasless Rails |
| 11 | [UUPS upgrades & storage-layout safety](11-uups-upgrades-storage-safety/blog.md) | Contract Architecture |
| 12 | [The two-facet proxy: beating the 24 KB limit](12-two-facet-proxy-24kb/blog.md) | Contract Architecture |
| 13 | [Deterministic / singleton deployment across chains](13-deterministic-singleton-deployment/blog.md) | Contract Architecture |
| 14 | [The wager lifecycle contract](14-wager-lifecycle-contract/blog.md) | Prediction Markets |
| 15 | [Oracle adapter abstraction (Polymarket / Chainlink / UMA)](15-oracle-adapter-abstraction/blog.md) | Prediction Markets |
| 16 | [Draw resolution & open-challenge wagers](16-draw-resolution-open-challenges/blog.md) | Prediction Markets |
| 17 | [Wager pools: ERC-1167 clones & address-keyed payouts](17-wager-pools-erc1167/blog.md) | Prediction Markets |
| 18 | [Envelope encryption for private prediction markets](18-envelope-encryption/blog.md) *(pointer to published post)* | Privacy Architecture |
| 19 | [Multi-recipient encryption](19-multi-recipient-encryption/blog.md) | Privacy Architecture |
| 20 | [Client-side encrypted data sync](20-encrypted-data-sync/blog.md) | Privacy Architecture |
| 21 | [The nullifier system](21-nullifier-system/blog.md) *(design history)* | Privacy Architecture |
| 22 | [The FeeRouter: one source of truth for platform fees](22-fee-router/blog.md) | Finance Surfaces |
| 23 | [Earn: wrapping ERC-4626 lending vaults with fee disclosure](23-earn-erc4626-vaults/blog.md) | Finance Surfaces |
| 24 | [Predict: Polymarket trading via builder codes](24-predict-polymarket-builder-codes/blog.md) | Finance Surfaces |
| 25 | [Bitcoin: adding a non-EVM chain to an EVM app](25-bitcoin-non-evm/blog.md) | Finance Surfaces |
| 26 | [ClearPath: a multi-network external DAO registry](26-clearpath-dao-registry/blog.md) | Multi-chain Infra |
| 27 | [Indexing without a subgraph (graceful degradation)](27-indexing-without-subgraph/blog.md) | Multi-chain Infra |
| 28 | [The unified activity ledger](28-unified-activity-ledger/blog.md) | Multi-chain Infra |
| 29 | [AI-driven smart-contract security review in CI](29-ai-security-review-ci/blog.md) | Security & DevOps |
| 30 | [Coverage & audit gates that fail loudly](30-coverage-audit-gates/blog.md) | Security & DevOps |
| 31 | [Symbolic execution & fuzzing a wager protocol](31-symbolic-execution-fuzzing/blog.md) | Security & DevOps |
| 32 | [Spec-driven development with Spec Kit](32-spec-driven-development/blog.md) | Security & DevOps |
| 33 | [CallsignRegistry: an in-house ENS-style naming system](33-callsign-registry/blog.md) | Standalone |
| 34 | [TokenFactory: templated token minting](34-token-factory/blog.md) | Standalone |

## Suggested publishing order

Lead with the highest-demand, most-differentiated pieces (see the inventory's
rationale): **04** (passkeys) → **12** (two-facet proxy) → **15** (oracle
adapters) → **06** (paymaster) → **29** (AI security review) → **25** (Bitcoin),
then fill in each series around those anchors.
