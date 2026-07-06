# Research: Passkey Wallet Accounts & Site-Wide Login Management (041)

Phase 0 output. Each entry: **Decision / Rationale / Alternatives considered**.
Sequencing context: 041 lands **after** 035 (intents) and 036 (relayer) are
deployed — see plan.md "Sequencing decision".

## 1. Smart-account implementation

**Decision**: Vendor the **Coinbase Smart Wallet** contract family
(`coinbase/smart-wallet`, BSD-3-Clause) into `contracts/account/` at a pinned,
audited commit: `CoinbaseSmartWallet` (account), `CoinbaseSmartWalletFactory`
(deterministic CREATE2 factory), `WebAuthnSol` (WebAuthn assertion verifier,
RIP-7212-precompile-first with FreshCryptoLib Solidity P-256 fallback), and
`ERC1271` support. FairWins deploys its **own factory instance** (we do not
depend on Coinbase's deployed instances), so the same bytecode can be
self-deployed on ETC/Mordor in the later increment.

**Rationale**:
- **Passkey-native and multi-owner**: owners are raw P-256 public keys *or*
  EOA addresses — exactly the spec's controller model (FR-018–FR-021: add
  passkey, link wallet, remove controller, never remove the last one).
- **ERC-1271 built in** — required for signing 035 intents (USDC v2.2 /
  ERC-7598 accept contract signatures for `transferWithAuthorization`).
- **`executeBatch`** — collapses approve+act to one biometric prompt (FR-016).
- **RIP-7212-first with Solidity fallback** — optimal on Polygon/Amoy today,
  and the identical contract works on ETC/Mordor later (no precompile there),
  matching the spec's deferred-increment posture.
- **Deterministic factory** → same address on every chain (FR-023, hard
  requirement from clarification Q5) provided the factory itself is deployed
  at the same address (see §7).
- Heavily audited, large deployed base, permissive license, no vendor service
  coupling — the SDK-side integration exists natively in viem (§5).

**Alternatives considered**:
- **Safe + passkey (SafeWebAuthnSignerProxy) module** — most battle-tested
  core, but passkeys are grafted on via signer-proxy contracts (extra
  deployment per credential), heavier gas, and the module surface is larger
  than we need. Better fit for multisig treasuries than consumer accounts.
- **ZeroDev Kernel v3 (ERC-7579 modular)** — excellent modularity (WebAuthn
  validator auto-uses 7212), but modularity is surface area we don't need,
  and the reference tooling assumes ZeroDev's SDK/infra.
- **Alchemy LightAccount / Modular Account** — clean, but passkey support
  leans on Alchemy's signer service; conflicts with the no-vendor-custody
  posture.
- **Custom account contract** — violates the repo's "don't re-roll audited
  wiring" rule; unjustifiable audit burden for funds-holding code.

## 2. EntryPoint version & deployment posture

**Decision**: Pin the ERC-4337 **EntryPoint version required by the vendored
account release** (v0.6 for current Coinbase Smart Wallet; re-verify the
account release ↔ EntryPoint pairing at implementation start). Use the
canonical existing EntryPoint deployment on Polygon/Amoy; record its address
per network in `deployments/` under key `entryPoint` rather than assuming it
in code. For the ETC/Mordor increment, self-deploy the same EntryPoint
bytecode deterministically (same address), following the spec-034 precedent of
self-deploying missing primitives on Classic (originally Semaphore, since
removed by the address-based pools rework in PR #793).

**Rationale**: The account and EntryPoint are a matched pair; mixing versions
is a known foot-gun. Recording the address in `deployments/` keeps
constitution V ("addresses come from sync artifacts") intact even for
third-party singletons.

**Alternatives considered**: EntryPoint v0.7/v0.8 with a 7579 account (pulls
in §1's rejected Kernel path); skipping `deployments/` recording for
"well-known" addresses (violates constitution V and breaks the ETC increment
where the address must be produced by our own deploy).

## 3. Transaction submission: intent-first, UserOp for the rest

**Decision**: Route by action type:
1. **035-covered product actions** (create/accept wager, claim, refund,
   membership purchase, pool join, voucher redeem …): the passkey account
   signs the **035 intent** via ERC-1271 (WebAuthn ceremony → account
   signature envelope; requires the §11 enablement) and submits through the
   merged relay stack — `frontend/src/lib/relay/intentClient.js` /
   `useIntentAction.js` → `services/relay-gateway` → `services/oz-relayer`
   engine — user pays no gas; the gateway screens the signer (= account
   address) per 036. EIP-712 types come from
   `frontend/src/lib/relay/intentTypes.js` (three-way byte-identical rule;
   never redefined).
2. **Account-native operations** (first deployment, add/remove controller,
   account upgrade) and **any action when the relayer path is down**:
   ERC-4337 **UserOperation** via bundler. Bundler endpoints are per-network
   config: primary = **self-hosted `alto` (Pimlico OSS, MIT)** colocated with
   the relay-gateway deployment behind the same edge perimeter; fallback =
   configured third-party public bundlers (Polygon/Amoy only).
3. Account deployment is **counterfactual**: the account contract deploys via
   the UserOp `initCode` bundled into the user's first on-chain action
   (FR-007) — no separate "activate" step.

**Rationale**: Reuses the platform's (by then) production intent+relayer
rails for 90% of traffic instead of building a parallel gas story; keeps
FR-013 honest (no hard dependency on the relayer — the UserOp path is a
complete fallback); self-hosted bundler is the only viable option for the ETC
increment and keeps account-control changes off un-vetted third parties.

**Alternatives considered**: UserOps-for-everything (ignores the deployed
035/036 rails, doubles gas cost and infra surface); relayer-only (violates
FR-013 — account management and relayer-down fallback would be impossible);
third-party bundler only (dead end for ETC; single point of failure for
controller changes).

## 4. Fees (user-paid, stablecoin-first)

**Decision**:
- **Relayed-intent path**: user pays no network fee (035/036 posture); no
  change.
- **UserOp path**: default fee payment is the account's **native-token
  balance**; where a configured third-party **ERC-20 paymaster** is available
  on Polygon/Amoy, offer **fee-in-USDC** so a stablecoin-only user can still
  perform account-native ops (FR-014). Fee always disclosed pre-confirmation
  in stablecoin terms; when the stablecoin fee path is unavailable, apply the
  clarification-Q3 fallback (pay native if held + guidance, or wait/retry).
- FairWins deploys **no paymaster of its own** in this feature and sponsors
  nothing (FR-015).

**Rationale**: Matches the spec's "no native token needed, but not free"
target while avoiding a FairWins-funded paymaster (new custody + funding
surface). The rare UserOp-only moments (controller changes) are acceptable
places for the ERC-20-paymaster dependency because the relayer path covers
all funds-reaching actions.

**Alternatives considered**: FairWins-operated ERC-20 paymaster (real
contract + hot-deposit surface; unjustified for v1 volume — revisit when 035
volume data exists); native-token-only UserOps (fails FR-014 for
stablecoin-only users on controller changes).

## 5. Frontend integration (wagmi/viem, no vendor SDK)

**Decision**: Implement a custom **wagmi connector** (`frontend/src/
connectors/passkey.js`) using **viem's built-in account-abstraction module**:
`toWebAuthnAccount` (P-256 owner from a WebAuthn credential) +
`toCoinbaseSmartAccount` (account abstraction over the vendored contracts) +
`createBundlerClient` (UserOp submission), plus viem's WebAuthn P-256
utilities for ceremonies. The connector exposes the standard wagmi surface
(`connect`, `disconnect`, `getAccounts`, `getChainId`, `switchChain`,
`getProvider`) so `WalletContext` treats it as just another connector;
`WalletContext`'s signing abstraction becomes **viem-first for smart
accounts** (the ethers `BrowserProvider` path remains for EOA connectors
untouched). **Verified at implementation start (T002)**: viem `2.53.1`
exports `toWebAuthnAccount`, `toCoinbaseSmartAccount`, `createBundlerClient`,
`createWebAuthnCredential`, `entryPoint06Address`/`entryPoint06Abi` from
`viem/account-abstraction`; wagmi `3.6.21` exports `createConnector`. The
EntryPoint pairing for the vendored Coinbase Smart Wallet v1.1.0 is **v0.6**
(`entryPoint06Address`), matching research §2.

**Rationale**: Zero new vendor dependencies (viem already ships everything,
including the WebAuthn helpers); matches the repo's existing custom-connector
architecture (`wagmi.js`, `WalletContext.jsx`, `WalletButton.jsx`); keeps the
"one unified connected-account state" requirement (FR-002) by construction.

**Alternatives considered**: `permissionless.js` (adds a dependency for what
viem already covers); ZeroDev/Alchemy/Privy SDKs (vendor coupling, embedded
infra assumptions); building raw WebAuthn + ABI plumbing ourselves
(re-rolling maintained, tested library code).

## 6. Encryption keys: WebAuthn PRF with per-credential wrapping

**Decision**: Derive encrypted-feature key material from the **WebAuthn PRF
extension**: per credential, `PRF(salt_fairwins)` → HKDF → a **key-encryption
key (KEK)**. Generate one random **master seed per account**; every
controller credential stores a copy of the master seed **wrapped under its
own KEK** (blobs stored via the spec-032 encrypted-data-sync channel; small,
non-secret-revealing). The master seed feeds the existing
`deriveKeyPairFromSignature`-equivalent derivation (x25519 + X-Wing), so
encrypted features behave identically to EOA users. Device capability
detection at credential creation: no PRF support → encrypted features are
explicitly marked unavailable for that credential (clarification Q1,
FR-012); linking an EOA controller also unlocks the legacy signature-derived
path as an alternative unwrap route.

**Rationale**: WebAuthn signatures are non-deterministic, so the existing
"same signature → same key" trick cannot work; PRF is the
purpose-built deterministic primitive. Master-seed wrapping is what makes
FR-012's "same keys on every device / every controller" hold across
*different* credentials (PRF outputs are per-credential); it also gives
removal semantics (deleting a controller's wrapped blob + on-chain removal).

**Alternatives considered**: Deriving keys directly from each credential's
PRF (different controllers ⇒ different keys — violates FR-012);
`largeBlob`/`credBlob` extensions (patchier support than PRF); server-side
key escrow (custodial — forbidden); deriving from the account address or
public data (not secret).

## 7. Deterministic same-address across networks (FR-023)

**Decision**: Deploy the **factory (and, where absent, the EntryPoint and
P-256 fallback verifier) via the canonical CREATE2 deterministic-deployment
proxy** with pinned salts, so factory addresses are identical on every
platform network; account address = `factory.getAddress(initialOwners,
nonce)` is then chain-independent. **The initial owner set (first passkey
public key) permanently determines the address** — later controller
add/remove does not change it. `scripts/deploy/deploy-account-stack.js`
performs the deterministic deploys and records `entryPoint`,
`accountFactory`, `p256Verifier` per network in `deployments/`;
`sync:frontend-contracts` carries them to the frontend.

**Rationale**: Hard requirement from clarification Q5; deterministic-deployer
replay is the established, auditable way to pin cross-chain addresses and is
exactly what the ETC/Mordor increment needs.

**Alternatives considered**: Per-chain factory addresses with an address
mapping in app state (breaks the "one address like an EOA" promise and the
wrong-chain-send safety property); registry contract translating account IDs
to per-chain addresses (extra trusted surface, still confusing).

## 8. RIP-7212 facts (verified)

- Precompile at `0x0000000000000000000000000000000000000100`; flat **3,450
  gas** per P-256 verification.
- **Live on Polygon PoS (137) since the Napoli upgrade (2024) and on Amoy
  (80002)**. Not present on ETC (61) / Mordor (63) — the vendored
  `WebAuthnSol` automatically falls back to the FreshCryptoLib Solidity
  verifier (~10–100× gas), which is why the ETC increment is cost-deferred,
  not blocked.
- Verification overhead on Polygon makes SC-006 (≤2× classic fee) achievable:
  P-256 verify is a rounding error next to base UserOp overhead.

## 9. Testing strategy

**Decision**:
- **Contracts (Hardhat)**: vendored-contract unit tests (owner add/remove
  including last-owner protection, ERC-1271 acceptance of WebAuthn-signed
  digests, `executeBatch`, factory determinism) run against the **Solidity
  fallback verifier** because Hardhat's EVM lacks the 7212 precompile;
  integration tests prove `MembershipManager.purchase` and `WagerRegistry`
  flows work when `msg.sender` is a smart account. Precompile-path assertions
  run in the Amoy checklist (quickstart.md).
- **Frontend (Vitest)**: connector/context/hooks with a stubbed authenticator
  and mocked bundler/relayer clients; PRF-degradation branches explicitly
  tested.
- **E2E (Cypress)**: Chrome DevTools Protocol **virtual authenticator**
  drives real WebAuthn ceremonies headlessly (create, sign-in, transaction
  ceremony, second-credential add) against the local dev stack.
- **Existing suites unchanged** = SC-004's regression gate.

**Alternatives considered**: mocking WebAuthn at the JS API level in Cypress
(weaker fidelity than the CDP virtual authenticator); standing up a full
4337 devnet in CI for the precompile (Hardhat can't; a live-network check
covers it more honestly).

## 10. Compliance integration

**Decision**: The **account address** is the screened/gated identity
everywhere (FR-011). Additionally, per clarification Q2: linked **EOA
controller addresses** are screened at link time (flagged → link refused)
and re-screened with the account (flagged controller ⇒ account treated as
flagged for gated actions) — implemented in the existing
`useAddressScreening`/`sanctionsScreen` client path plus the on-chain
`ISanctionsGuard` where enforcement already exists; the 036 relayer's
signer-screening applies unchanged since the signer it attributes is the
account address. Entry gate and membership purchase flows are unchanged
(account address is `msg.sender`).

**Rationale**: Closes the flagged-EOA-controller bypass with the cheapest
possible hook points (link event + existing periodic screen), no new
compliance machinery.

**Alternatives considered**: screening every UserOp signature's credential
(credentials have no addresses — nothing to screen); on-chain
controller-set screening in the account contract (would require forking the
vendored audited contract — rejected).

## 11. ERC-1271 enablement of the merged intent rails (post-merge finding)

**Decision**: Extend intent-signer verification from ECDSA-only to
**OpenZeppelin `SignatureChecker.isValidSignatureNow`** (ECDSA first,
ERC-1271 `isValidSignature` fallback for signers with code) in two places,
shipped as part of 041's foundational phase:

1. **On-chain** — `contracts/upgradeable/SignerIntentBase.sol` (both
   `recover` sites). Logic-only; no storage changes (ERC-7201 nonce layout
   untouched); intent struct typehashes unchanged, so the three-way
   byte-identical rule is unaffected. Shipped as **in-place upgrades** of
   both registry facets (`WagerRegistry` + `WagerRegistryIntents`, storage
   defined solely in `WagerRegistryCore`) and `membershipManagerImpl`, via
   the `scripts/deploy/upgrade-gasless-intents.js` pattern with
   `check:storage-layout` gating. Pools: `WagerPool` clones are **immutable**
   — publish a new `poolImpl` so future clones accept ERC-1271 `…WithSig`
   intents; existing clones stay ECDSA-only (passkey users can still act on
   them via direct account transactions).
2. **Gateway** — `services/relay-gateway/src/intent/verify.js`: when ECDSA
   recovery does not match a claimed signer that has code on the bound
   chain, `eth_call isValidSignature(digest, signature)` against the signer
   before accepting.

**Rationale**: Discovered by `/speckit-analyze` against the merged #800 code:
`SignerIntentBase` uses `digest.recover(sig) != signer` and the gateway uses
`ethers.verifyTypedData` — both ECDSA-only, and a contract account can never
produce a signature that ECDSA-recovers to its own address. Without this
enablement the entire intent-first architecture (§3 row 1) silently degrades
to UserOps-for-everything for passkey users. `SignatureChecker` is the
standard, audited way to accept both signer kinds without touching struct
hashing, nonces, or storage.

**Alternatives considered**: UserOp-only routing for passkey accounts
(doubles gas + infra for 90% of traffic; abandons the deployed relayer
rails); a parallel passkey-specific intent path (violates "do not invent a
parallel action path" and the three-way type-sync guardrail); wrapping every
intent in an EOA session key held client-side (reintroduces exportable key
material — defeats the passkey security model).
