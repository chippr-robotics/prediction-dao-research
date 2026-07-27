# Passkey wallet accounts (spec 041)

FairWins passkey accounts are **self-custodial ERC-4337 smart accounts** owned
by WebAuthn P-256 credentials (device biometrics). This guide covers the
architecture; the user-facing recovery story lives in
`docs/user-guide/passkey-recovery.md`, ops in
`docs/runbooks/relayer-operations.md`.

## Contract stack (`contracts/account/`)

Vendored **Coinbase Smart Wallet v1.1.0** + pinned dependency closure —
provenance and the vendoring rules (no logic modifications, path-only import
rewrites) are in `contracts/account/README.md`. Key properties the platform
relies on:

- **Multi-owner**: P-256 public keys (passkeys) and EOA addresses (linked
  wallets) are interchangeable controllers; add/remove is owner-authorized
  self-calls; `removeOwnerAtIndex` reverts on the last owner (FR-020).
- **ERC-1271** with a per-account replay-safe hash — how passkey accounts
  sign spec-035 intents and USDC EIP-3009 authorizations (ERC-7598).
- **`executeBatch`** — approve+act in ONE user ceremony (FR-016).
- **WebAuthnSol**: RIP-7212 precompile first (3,450 gas on Polygon/Amoy),
  FreshCryptoLib Solidity fallback elsewhere — the same bytecode serves the
  deferred ETC/Mordor increment (FR-022).
- **UUPS upgradable by its owners only** — FairWins holds no authority over
  instances (plan.md Complexity Tracking).

Deployment: `scripts/deploy/deploy-account-stack.js` deploys the
implementation + factory through the canonical CREATE2 deployer with a pinned
salt, so **`accountFactory` has the same address on every network** and
account addresses are chain-independent (FR-023). Recorded deployment keys:
`entryPoint`, `accountFactory`, `accountImpl`, `p256Verifier` (explicit null —
the FCL fallback is inlined). Never hardcode these; they flow through
`sync:frontend-contracts`.

## ERC-1271 intent signing

The merged 035/036 rails originally verified intent signers with ECDSA only.
Spec 041 extended `contracts/upgradeable/SignerIntentBase.sol` with an
ECDSA-then-ERC-1271 check (OZ SignatureChecker semantics, inlined — see the
file's comment for the Cancun `mcopy` constraint) and
`services/relay-gateway/src/intent/verify.js` with the matching fail-closed
`isValidSignature` eth_call fallback. Ship path for live networks:
`scripts/deploy/upgrade-erc1271-intents.js` (in-place upgrades of both
registry facets + `membershipManagerImpl`, storage-layout gated; new
`WagerPool` template for FUTURE clones — existing clones are immutable and
stay ECDSA-only for `…WithSig` twins).

**Scope note**: the EIP-3009 *payment leg* (`ERC3009Auth` v/r/s) is still
ECDSA-only — passkey stake-moving actions ride `executeBatch` UserOps until
the ERC-7598 bytes leg is plumbed through the twins.
`test/fork/usdc-erc1271-authorization.test.js` already proves native USDC
accepts the contract-account authorization.

## Frontend architecture (`frontend/src/lib/passkey/`, `connectors/passkey.js`)

- **`credentials.js`** — WebAuthn ceremonies (PRF requested at creation),
  capability detection (FR-004), typed errors (`CeremonyCancelled`,
  `AuthenticatorUnavailable`), local credential bookkeeping.
- **`smartAccount.js`** — viem-native account layer (`viem/account-abstraction`,
  no vendor SDK): address derivation, owner-bytes encodings, controller
  mutation encoders with last-owner/screening guards, controller reads.
- **`submission.js`** — the routing decision table: relayed intent first
  (gasless), ordered bundler list for UserOps, `SubmissionUnavailable` when
  both are down; honest lifecycle tracking (never `included` before
  inclusion, `stalled` after the window — FR-017).
- **`intentSigner.js`** — drop-in `signer` adapter for the EXISTING
  `lib/relay/intentClient.signIntent`: EIP-712 types imported from
  `lib/relay/intentTypes.js` (three-way byte-identical rule), ERC-1271
  WebAuthn envelope out.
- **`prfKeys.js`** — WebAuthn PRF → HKDF → AES-GCM master-seed wrapping: same
  encryption keys on every device/controller; explicit degradation on
  non-PRF authenticators (clarification Q1) — never silently-wrong keys.
- **`sendBatch.js`** — fulfills `WalletContext.sendCalls` for passkey
  sessions; counterfactual accounts activate automatically via initCode on
  the first action (FR-007).
- **Connector** (`fairwinsPasskey`) — sign-up/sign-in, silent reconnect,
  sessions persist until sign-out (clarification Q4), `ChainNotSupportedError`
  on networks without passkey config (FR-022).

`WalletContext` exposes `loginMethod` (informational only — identity and
gating ALWAYS key off `address`), `accountCapabilities.encryption`, and
`sendCalls`. Classic-wallet paths are untouched (SC-004).

## Fees & sponsorship (spec 050)

Spec 041 shipped with **users paying their own UserOp gas** from the account's
native balance (FR-015: no FairWins paymaster). That strands stablecoin-only
users and fails during gas spikes, so **spec 050 supersedes FR-015 for the
UserOp path**: FairWins sponsors account-native UserOps (native + USDC
transfers, controller changes, first-use deploy) via a **self-hosted verifying
paymaster** — the user needs **zero** native token.

- **On-chain**: `FairWinsVerifyingPaymaster` (EntryPoint v0.6) sponsors an op iff
  its `paymasterAndData` carries a valid signature from the FairWins sponsorship
  signer over the op + a short validity window. FairWins funds the EntryPoint
  **deposit** (the hard exposure cap); validation is signature-only (no external
  storage). `owner` (floppy keystore) withdraws; `verifyingSigner` (KMS) is
  rotatable.
- **Off-chain**: the **relay-gateway** gains `POST /v1/paymaster` (ERC-7677
  `pm_getPaymaster{Stub,}Data`) — the SAME policy engine (killswitch, sanctions
  screen on the account, per-account + global quotas) plus a per-operation cost
  ceiling; on grant it KMS-signs the sponsorship. The **alto bundler** still
  submits. No new service.
- **Frontend**: `buildAccount` wires a viem paymaster client at
  `VITE_SPONSOR_PAYMASTER_<net>` → the gateway endpoint. `sendBatch` **falls back
  to a self-funded UserOp** if sponsorship is unavailable (never-stranded), and
  the confirm UI discloses the **truthful** fee — "Sponsored — no network fee"
  ONLY when a sponsorship was actually obtained, else "you pay the network fee"
  (fixing the previously-unconditional badge).

Eligibility is **identity-open** (any screened, in-quota FairWins passkey
account — not membership-gated). Networks: Polygon 137 first, Amoy 80002 for
validation; ETC/Mordor degrade to honest self-submit. Design +
run/rollback: `specs/050-sponsored-paymaster/` and
`docs/runbooks/paymaster-operations.md`.

## Sign-in is independent of the relayer, the bundler, and the chain

**Signing in must never depend on network support.** It is a WebAuthn ceremony plus an address
derivation, and neither touches a bundler, an EntryPoint, or an RPC. The account address is a pure
function of `(owners, nonce)` and the factory — all chain-independent (FR-023) — so
`smartAccount.computeAccountAddress` derives it locally via CREATE2 over `ACCOUNT_INIT_CODE_HASH`.

Gating login on submission support caused a **lockout**: the selected network persists in the
session, so a member who switched to a chain without a bundler returned to find the passkey option
refused on the chain they were already on — and switching away required being signed in. Three
things enforce the separation now, and none of them may be re-tightened:

- `connectors/passkey.js#connect` has **no** network gate
- `switchChain` **allows** an unsupported chain (it is never a one-way door)
- `useConnectorAvailability` scopes passkey availability to the **device** only

`requirePasskeySupport` is the **submission** gate and belongs only in `buildAccount` and below.
The write path discloses the limitation at the point of action instead of hiding the account.

## Cross-device sign-in

A passkey created on a phone works on a laptop: the credential is discoverable
(`residentKey: 'required'`) and synced by iCloud Keychain / Google Password Manager. What failed was
*identifying the account* — the address lived only in the first device's `localStorage`, and an
assertion returns a credential id and a signature but **not** the public key.

`lib/passkey/crossDevice.js` recovers the public key from the signature itself
(`sha256(authenticatorData || sha256(clientDataJSON))`, DER-decoded to `r`/`s`).

> ⚠️ **A single signature is always ambiguous.** Exactly two distinct P-256 keys verify any given
> `(r, s)` — measured 200/200, because it is inherent to ECDSA. They derive two *different* account
> addresses, so resolving from one assertion could hand a member an address they can fund and never
> spend from. The module therefore requires **two** assertions over different challenges and takes
> the single key in both candidate sets. That is a second authenticator prompt, once per device;
> disclose it, and never "optimise" it away.

The second ceremony is pinned to the credential id from the first, so no chooser reappears and a
different passkey cannot be substituted mid-flow.

**`user.id` cannot carry the key.** It must be supplied to `credentials.create()`, but the key pair
is generated by the authenticator *during* that call — and there is no backend to hold a
credential→account map. Recovery works for passkeys that already exist, which a `user.id` scheme
never could.

**Limit — a passkey added as a second controller.** The derivation assumes the passkey is the
account's *initial* owner. One added later to a pre-existing account does not derive that account's
address, so the result is confirmed against the chain: undeployed is accepted (it is the canonical
account that key owns), deployed-and-listing-the-key is accepted, and deployed-but-not-listing it is
**refused** rather than showing an account that is not theirs. The check soft-fails on an
unreachable RPC, because sign-in must not require a chain.

## Compliance

Screening keys off the **account address** everywhere. Additionally
(clarification Q2): linked wallet controllers are screened at link time
(refused when flagged OR unscreenable — fail-closed) and re-screened with the
account (`usePasskeyAccount.accountFlagged`); on-chain guards remain
authoritative.

## Network scope

The account stack is **deployed on all eight EVM networks**, at the same two
addresses everywhere (FR-023):

| | `accountFactory` | `accountImpl` |
| --- | --- | --- |
| Ethereum 1, Optimism 10, Base 8453, Arbitrum 42161, Polygon 137, ETC 61, Mordor 63, Amoy 80002 | `0xd519C25e9dEd0DAC586B764574100479CB318734` | `0xfC5086A397e4FbAAF8f73892807415Da8d255E61` |

Verified functionally, not just by address: every factory answers
`getAddress(owners, nonce)` with the **same** counterfactual account address on
all eight chains. The deploy script also hard-fails on any cross-network factory
divergence.

Deploying the factory is only half of enabling a network — see
[Enabling a network](#enabling-a-network). Each chain still needs a bundler URL
before members see the option.

### ⚠️ ETC (61) and Mordor (63) require a legacy-mode bundler

Both chains **do not implement the `BASEFEE` opcode** (EIP-3198 — ETC never
adopted EIP-1559). Verified directly on-chain: a probe contract whose constructor
executes `BASEFEE` fails to deploy on both, while the identical probe without it
succeeds, and `PUSH0` works (ETC's Spiral upgrade).

EntryPoint v0.6 reads `block.basefee` in `UserOperation.gasPrice()`, but only on
one branch — `contracts/account/lib/account-abstraction/interfaces/UserOperation.sol:51-61`:

```solidity
if (maxFeePerGas == maxPriorityFeePerGas) {
    //legacy mode (for networks that don't support basefee opcode)
    return maxFeePerGas;
}
return min(maxFeePerGas, maxPriorityFeePerGas + block.basefee);
```

So ERC-4337 works on ETC/Mordor **only if every UserOp sets
`maxFeePerGas == maxPriorityFeePerGas`**. A stock bundler config that quotes an
EIP-1559 fee pair will hit an invalid opcode at post-op and the operation fails
after execution. Before setting `VITE_BUNDLER_URLS_ETC` / `_MORDOR`, pin the
bundler to legacy fee quoting and prove one UserOp end-to-end on **Mordor**
first. This is separate from — and more consequential than — the missing RIP-7212
precompile on these chains, which only costs extra gas.

## Complexity-tracking exceptions (plan.md)

1. The self-hosted **alto bundler** colocated with the relay gateway extends
   the spec-036 no-backend exception (same "can censor, cannot steal" bound).
2. User-owned account proxies sit **outside the UUPSManaged regime** — only
   account owners hold upgrade authority.
