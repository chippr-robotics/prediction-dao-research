# Security Posture Inventory

**Application:** FairWins (prediction-dao-research)
**Date:** 2025-05-25
**Scope:** Smart contracts, frontend, backend/scripts, infrastructure, CI/CD, key management

---

## Table of Contents

1. [Critical Findings](#critical-findings)
2. [High Severity](#high-severity)
3. [Medium Severity](#medium-severity)
4. [Low Severity](#low-severity)
5. [Informational](#informational)
6. [Parlay Threats (Chained Attack Scenarios)](#parlay-threats-chained-attack-scenarios)
7. [Positive Security Controls](#positive-security-controls)

---

## Critical Findings

### CRIT-01: PolymarketOracleAdapter `linkMarketToPolymarket` Has No Access Control

**File:** `contracts/oracles/PolymarketOracleAdapter.sol:137-181`
**Component:** Smart Contract

The `linkMarketToPolymarket()` and `linkMarketToPolymarketWithCTF()` functions are `public`/`external` with **no access control modifier** (`onlyOwner` is missing). Any address can link any friend market ID to any Polymarket condition ID. This contrasts with the other oracle adapters (`ChainlinkDataFeedOracleAdapter`, `ChainlinkFunctionsOracleAdapter`, `UMAOptimisticOracleV3Adapter`) which all correctly protect `linkMarket()` with `onlyOwner`.

**Attack Scenario:** An attacker can front-run a legitimate market creation by calling `linkMarketToPolymarketWithCTF()` with a malicious CTF contract address from the `supportedCTFContracts` set, or link a market to a Polymarket condition that favors them. Since `linkMarketToPolymarketWithCTF` also validates conditions against the CTF but does not verify the caller is the market's creator or an admin, an attacker could link a wager to a pre-resolved condition of their choosing.

**Impact:** Market resolution manipulation, potential theft of escrowed wager funds.

### CRIT-02: `createWager` External Calls Before State Changes (Inverted CEI)

**File:** `contracts/wagers/WagerRegistry.sol:225-248`
**Component:** Smart Contract

The `createWager` function performs two external calls (`safeTransferFrom` on line 226, `membershipManager.recordCreate` on line 229) **before** writing any wager state to storage (lines 231-246). The comment on line 225 explicitly documents this as "CEI: external call before state change" — which is the **opposite** of Checks-Effects-Interactions.

While `nonReentrant` mitigates same-contract reentrancy, the `membershipManager` is a separate contract that could be swapped by an admin (via `setMembershipManager`). If a malicious or vulnerable `membershipManager` were set, it could exploit the inverted CEI ordering.

**Mitigating Factor:** `nonReentrant` guard prevents same-contract reentrancy. Risk depends on the integrity of the `membershipManager` contract.

**Impact:** Potential reentrancy via compromised/upgraded `membershipManager`.

### CRIT-03: Fork Data with Extended Private Keys Written to World-Readable `/tmp`

**File:** `.claude/skills/floppy-keystore/scripts/clone.js:1454-1462`
**Component:** Key Management

During the floppy keystore fork process, the extended private key (xprv) and all fork data — including all derived private keys — are written in plaintext to `/tmp/fork-data.json`. On multi-user systems, `/tmp` is world-readable by default.

**Attack Scenario:** On a shared workstation or CI runner, another process or user reads `/tmp/fork-data.json` during the brief window it exists, obtaining the xprv which can derive all private keys for every supported blockchain (Ethereum, Bitcoin, Zcash, Monero, Solana).

**Impact:** Complete compromise of all blockchain accounts controlled by the cloned keystore.

### CRIT-04: CI Workflow Expression Injection — Secret Value in Shell Context

**File:** `.github/workflows/deploy-cloud-run.yml:38-44`
**Component:** CI/CD

The "Debug secrets" step uses `${{ secrets.VITE_PINATA_JWT }}` directly inside a `run:` block. GitHub Actions performs expression substitution **before** the shell runs. If the secret contains shell metacharacters (e.g., `$(...)`, backticks, `'`), they are injected directly into the shell script and **executed**. While GitHub masks known secret values in logs, the masking is best-effort.

```yaml
if [ -n "${{ secrets.VITE_PINATA_JWT }}" ]; then
```

**Attack Scenario:** If the secret value ever contains shell metacharacters (intentional or accidental), arbitrary code executes in the CI environment with access to GCP credentials and other secrets.

**Impact:** Arbitrary code execution in CI, potential exfiltration of all secrets including GCP service account tokens.

### CRIT-05: `recordClose` Only Called for Creator — Opponent `activeCount` Never Decremented

**File:** `contracts/wagers/WagerRegistry.sol:324,364,280,296,396-403,426`
**Component:** Smart Contract

When wagers are resolved, cancelled, declined, refunded, or batch-expired, `membershipManager.recordClose()` is only called for `w.creator` — never for the opponent. This means the opponent's `activeCount` in the MembershipManager grows monotonically and is **never decremented**.

**Attack Scenario:**
1. Attacker creates many wagers naming a specific victim as opponent, using `ResolutionType.Either`
2. Victim accepts each wager (as a good-faith participant)
3. Attacker immediately resolves each wager in their own favor via `declareWinner`
4. Creator's `activeCount` is decremented via `recordClose`, but victim's `activeCount` keeps growing
5. Eventually, victim hits `maxConcurrentMarkets` and is **permanently locked out** of creating new wagers

**Impact:** Permanent denial of service for any user targeted as an opponent. This is a griefing attack with no recovery path — the opponent's `activeCount` can never decrease.

---

## High Severity

### HIGH-01: Pinata JWT Baked into Docker Image Build Layer

**File:** `.github/workflows/deploy-cloud-run.yml:35`
**Component:** CI/CD

The Pinata JWT is passed as a `--build-arg` during Docker build:
```
--build-arg VITE_PINATA_JWT="${{ secrets.VITE_PINATA_JWT || '' }}"
```

Docker build args are not secrets — they are stored in the image's build history and can be extracted with `docker history` or `docker inspect`. The JWT grants write access to the Pinata IPFS pinning service. While the nginx template is designed to inject it at runtime, this build arg also bakes it into the frontend JS bundle.

**Attack Scenario:** Anyone with pull access to the Artifact Registry image can extract the Pinata JWT from the build layer metadata, then use it to pin arbitrary content or exhaust the Pinata API quota.

**Impact:** IPFS pinning service compromise, potential content injection.

### HIGH-02: `deploy-cloud-run.yml` Missing `VITE_PINATA_JWT` as Cloud Run Environment Variable

**File:** `.github/workflows/deploy-cloud-run.yml:48-57`
**Component:** Infrastructure

The `gcloud run deploy` command does not pass `VITE_PINATA_JWT` as a `--set-env-vars` or `--set-secrets` parameter. The nginx template expects `${VITE_PINATA_JWT}` to be substituted at container startup via `envsubst`. If this env var isn't set on the Cloud Run service, the Pinata proxy endpoint will send requests with `Authorization: Bearer ` (empty token), which will fail silently. The JWT was passed as a build arg (HIGH-01) but may not be available at runtime unless separately configured.

**Impact:** Pinata upload functionality broken in production, or JWT leaked in build layer.

### HIGH-03: CSP Allows `'unsafe-inline'` and `'unsafe-eval'` for Scripts

**File:** `frontend/nginx.conf.template:59`
**Component:** Frontend Security

The Content Security Policy includes `script-src 'self' 'unsafe-inline' 'unsafe-eval'`. Both `'unsafe-inline'` and `'unsafe-eval'` significantly weaken CSP protections. `'unsafe-eval'` enables `eval()`, `Function()`, and `setTimeout(string)` — all of which are XSS exploitation primitives. `'unsafe-inline'` allows inline `<script>` tags.

**Attack Scenario:** If an attacker can inject any HTML content (via IPFS metadata, XSS in market descriptions, or a compromised dependency), the weakened CSP allows execution of arbitrary JavaScript including wallet-draining scripts.

**Impact:** XSS exploitation becomes trivial if any injection vector exists.

### HIGH-04: WalletConnect Project ID Hardcoded as Fallback in Frontend and CI

**Files:**
- `frontend/src/wagmi.js:106` — fallback: `e7a122e5963ecec9bb2ab09e08bca54f`
- `.github/workflows/deploy-cloud-run.yml:30` — fallback: `c30d7d7a8d575fe3dcc72ed55e5b287e`

**Component:** Frontend / CI/CD

Two different WalletConnect Project IDs are hardcoded as fallback values. These are committed to a public repository. WalletConnect Project IDs are tied to billing and rate-limit quotas. An attacker can use these IDs to relay malicious wallet connection requests or exhaust the project's WalletConnect quota.

**Impact:** Wallet connection abuse, service degradation, potential phishing relay.

### HIGH-05: `PRIVATE_KEY` Fallback Silently Undermines Floppy Keystore Security Model

**File:** `hardhat.config.js:166`
**Component:** Key Management

`loadFloppyKeysSync(true)` is called with `allowFallback=true` at config load time, and the result is used for **all** networks including production testnets (`amoy`, `mordor`). If the floppy is not mounted or the password is wrong, the system silently falls back to the `PRIVATE_KEY` environment variable. The comment at line 246 claims "SECURITY: Keys loaded from floppy disk only" for mordor, but this is incorrect — `floppyKeys` was already computed with fallback enabled.

**Attack Scenario:** A developer believes keys are loaded from the air-gapped floppy, but a `.env` file with `PRIVATE_KEY` set causes silent fallback to less-secure key storage. If `.env` is committed or leaked, the deployer account is compromised.

**Impact:** Full compromise of the deployment account on production networks.

### HIGH-06: Fee-on-Transfer Token Accounting Mismatch

**File:** `contracts/wagers/WagerRegistry.sol:226,266,377-378`
**Component:** Smart Contract

The contract uses `safeTransferFrom` to pull stakes but trusts the recorded amount without verifying the actual balance received. If a fee-on-transfer or deflationary token is admin-allowlisted, the contract records `creatorStake = X` but receives `X - fee`. Over many wagers, the deficit grows until `claimPayout` or `claimRefund` reverts due to insufficient balance.

**Attack Scenario:** A fee-on-transfer token is added to the allowlist. Attacker creates and resolves many wagers. The last users to claim payouts find the contract is insolvent — recorded stakes exceed actual balance.

**Impact:** Insolvency of WagerRegistry escrow, permanent fund loss for late claimers.

### HIGH-07: `deploy-contracts.yml` Exposes PRIVATE_KEY to CI

**File:** `.github/workflows/deploy-contracts.yml:47-48`
**Component:** CI/CD

The contract deployment workflow passes `${{ secrets.PRIVATE_KEY }}` as an environment variable to a shell step running `npx hardhat run`. If any npm dependency (hardhat or transitive) is compromised, it can read `process.env.PRIVATE_KEY` and exfiltrate the deployer key. Combined with unpinned action versions (LOW-05), a supply chain attack could capture this key.

**Impact:** Compromise of the deployer/admin private key for all deployed contracts.

### HIGH-08: Encryption Signature Cached in sessionStorage

**File:** `frontend/src/hooks/useEncryption.js:56-96`
**Component:** Frontend Security

The wallet-derived encryption signature (from which both X25519 and X-Wing private keys can be deterministically derived) is stored in `sessionStorage`. Any script running in the same origin — including XSS payloads enabled by the weak CSP (HIGH-03) — can read it, derive all encryption keys, and decrypt all private market metadata for the user.

**Impact:** Complete loss of market privacy for affected users.

### HIGH-09: UMA Adapter `conditionToAssertion` Permanently Blocks Retry After False Resolution

**File:** `contracts/oracles/UMAOptimisticOracleV3Adapter.sol:137,161-173`
**Component:** Smart Contract

When `assertResolution` is called, `conditionToAssertion[conditionId]` is set to `_PENDING_SENTINEL` (line 137) and never updated to the actual `assertionId`. If an assertion is disputed and the DVM resolves it as `assertedTruthfully = false`, the condition is permanently resolved as `false` in the cache. Furthermore, `conditionToAssertion[conditionId]` remains non-zero, blocking any new assertion attempt (line 129 checks `!= bytes32(0)`).

**Attack Scenario:** Attacker asserts a false claim. Honest party disputes. DVM resolves as false. The condition is now permanently marked as "resolved false" with no ability to submit a corrective assertion for the true outcome.

**Impact:** Incorrect permanent resolution of UMA-backed wagers, potential fund theft.

---

## Medium Severity

### MED-01: `cancelOpen` and `declineWager` Missing `whenNotPaused`

**File:** `contracts/wagers/WagerRegistry.sol:271,287`
**Component:** Smart Contract

Both `cancelOpen` and `declineWager` are missing the `whenNotPaused` modifier. During an emergency pause (e.g., after detecting an exploit), these functions remain callable. While this might be intentional (allowing users to recover funds during pause), it creates an inconsistency: `createWager` and `acceptWager` are paused, but cancel/decline are not.

**Risk:** During an active exploit, the ability to cancel wagers and extract escrowed funds could be abused by an attacker who created malicious wagers before the pause.

### MED-02: `autoResolveFromPolymarket` and `autoResolveFromOracle` Missing `notFrozen` Check

**File:** `contracts/wagers/WagerRegistry.sol:329,342`
**Component:** Smart Contract

Both oracle auto-resolve functions lack `notFrozen(msg.sender)`. While these functions don't benefit the caller directly (anyone can trigger resolution), a frozen account could still trigger resolution at a strategically chosen time. More importantly, the resolved wager routes funds to a winner who might be the frozen user — `_settleOracleWin` doesn't check whether the winner is frozen.

**Risk:** A frozen user can indirectly benefit from oracle resolution by having an unfrozen third party trigger `autoResolveFromPolymarket`, then claim the payout (which also lacks a frozen check on the winner, only on msg.sender).

### MED-03: `batchExpireOpen` Unbounded Loop Gas Risk

**File:** `contracts/wagers/WagerRegistry.sol:419-430`
**Component:** Smart Contract

`batchExpireOpen` iterates over a caller-supplied array of wager IDs with no upper bound. Each iteration performs a storage read, a storage write, an external `membershipManager.recordClose()` call, and a `safeTransfer`. With a large enough array, the transaction exceeds the block gas limit.

**Risk:** This is a user-facing DoS concern rather than a contract-level issue. Callers should batch appropriately, but the contract offers no guidance or enforcement.

### MED-04: Wildcard CORS on Pinata Proxy

**File:** `frontend/nginx.conf.template:25,31`
**Component:** Infrastructure

The Pinata API proxy sets `Access-Control-Allow-Origin: *`. This means any website can make authenticated requests to the Pinata API through the proxy. Combined with the server-side JWT injection, this allows any origin to pin content to the project's Pinata account.

**Attack Scenario:** An attacker creates a malicious webpage that makes `fetch()` requests to `https://fairwins.app/api/pinata/pinJSONToIPFS`, pinning arbitrary content and exhausting the project's Pinata quota, or using the service for their own IPFS hosting.

**Impact:** Resource abuse, content injection, quota exhaustion.

### MED-05: `accruedFees` Overflow in MembershipManager

**File:** `contracts/access/MembershipManager.sol:143,163,179`
**Component:** Smart Contract

`accruedFees` is a `uint128` that accumulates all membership payment fees. Each `purchaseTier`, `upgradeTier`, and `extendMembership` call adds to it with unchecked `+=`. While `uint128` is enormous (~3.4e38), the variable is never decremented except by `withdrawFees`. If fees are never withdrawn, in a long-lived contract with many memberships, accumulation could theoretically overflow. Solidity 0.8+ would revert, causing a denial of service for all membership purchases.

**Risk:** Low probability but high impact — all membership operations would revert if `accruedFees` overflows.

### MED-06: Command Injection via Environment Variables in `execSync` Calls

**Files:**
- `.claude/skills/floppy-keystore/scripts/loader.js:55-56`
- `scripts/operations/floppy-key/loader.js:26`
- `.claude/skills/floppy-keystore/scripts/identity.js:46`
- `.claude/skills/floppy-keystore/scripts/cli.js:133`

**Component:** Key Management

Multiple files use `execSync` with string interpolation of `CONFIG.MOUNT_POINT` (derived from the `FLOPPY_MOUNT` env var). While double-quoted in the shell command, environment variable injection into shell commands is a known attack vector.

**Impact:** Arbitrary command execution if env vars are poisoned.

### MED-07: Password Exported to Shell Environment via `disk-detect.js`

**File:** `.claude/skills/floppy-keystore/scripts/disk-detect.js:113`
**Component:** Key Management

In `--export` mode, the keystore password is printed to stdout for `eval`:
```javascript
console.log(`export FLOPPY_KEYSTORE_PASSWORD="${password}"`);
```
The password becomes visible in `ps auxe`, shell history, and `/proc/<pid>/environ`.

**Impact:** Keystore password disclosure on shared systems.

### MED-08: Monero Key Derivation Uses Weak Custom Scheme

**File:** `.claude/skills/floppy-keystore/scripts/chains.js:204-206`
**Component:** Key Management

The fallback Monero key derivation uses `SHA-256(mnemonic + index)` without proper domain separation or HMAC-based construction. This deviates from cryptographic best practices.

**Impact:** Potential key derivation weaknesses for Monero accounts.

### MED-09: WagerRegistry `declareWinner` with `ResolutionType.Either` Allows Self-Declaration

**File:** `contracts/wagers/WagerRegistry.sol:310-312`
**Component:** Smart Contract

With `ResolutionType.Either`, any participant (creator or opponent) can unilaterally declare any participant as the winner. This is by design for friend-group trust models, but the resolution type name is misleading — "Either" implies either party can resolve, not that either party can claim victory for themselves.

**Risk:** A malicious participant in an `Either`-type wager can declare themselves the winner and drain both stakes. This is mitigated by the fact that both parties agreed to this resolution type, but UX confusion could lead users to select `Either` without understanding the implications.

### MED-10: No Dispute Mechanism for `ResolutionType.Creator` / `ResolutionType.Opponent`

**File:** `contracts/wagers/WagerRegistry.sol:313-316`
**Component:** Smart Contract

With `ResolutionType.Creator`, only the creator can declare the winner. With `ResolutionType.Opponent`, only the opponent can. There is no dispute mechanism, escalation path, or timeout forcing resolution. The designated resolver can simply never call `declareWinner`, locking both stakes until `resolveDeadline` passes (up to 180 days).

**Risk:** A participant who loses the underlying bet can grief the winner by refusing to resolve, locking funds for up to 6 months.

### MED-11: Chainlink Data Feed — No Maximum Staleness Threshold

**File:** `contracts/oracles/ChainlinkDataFeedOracleAdapter.sol:102-103`
**Component:** Smart Contract

The staleness check only verifies `updatedAt >= cfg.deadline`. There is no maximum age threshold. If a Chainlink feed goes stale for days and then updates, `evaluate` accepts arbitrarily old data as long as `updatedAt >= deadline`.

**Risk:** Resolution based on stale/outdated price data that does not reflect current market conditions.

### MED-12: Docker Containers Run as Root

**Files:** `Dockerfile:35-54`, `frontend/Dockerfile:36-48`
**Component:** Infrastructure

Neither Dockerfile creates a non-root user. The `nginx:alpine` base image runs the master process as root. If an nginx vulnerability allows RCE, the attacker has root inside the container.

**Risk:** Elevated privileges upon container compromise. Partially mitigated by Cloud Run sandboxing.

### MED-13: Cryptographic Session State Stored in localStorage

**File:** `frontend/src/utils/crypto/sessionManager.js:395-420`
**Component:** Frontend Security

The SessionManager saves full Double Ratchet and Group Session state (including private ratchet keys, chain keys, sender keys) to `localStorage`. This data persists across browser restarts and is accessible to any script in the same origin.

**Risk:** Complete compromise of encrypted communications via XSS or browser extension access.

---

## Low Severity

### LOW-01: `dangerouslySetInnerHTML` Used in MyMarketsModal

**File:** `frontend/src/components/fairwins/MyMarketsModal.jsx:2023`
**Component:** Frontend

`dangerouslySetInnerHTML` is used to render icons from `getIcon()`. While the function returns hardcoded HTML entities (`&#9888;`, etc.), using `dangerouslySetInnerHTML` is a pattern that invites future XSS if the function is modified to accept user input.

### LOW-02: Non-Constant-Time MAC Comparison for Admin Keystore

**Files:** `hardhat.config.js:68`, `scripts/operations/floppy-key/loader.js:282-283`
**Component:** Key Management

Admin keystore MAC verification uses `Buffer.equals()` which is not guaranteed constant-time, unlike the mnemonic keystore which uses `constantTimeCompare()`. This creates a theoretical timing side-channel.

### LOW-03: Weak Admin Keystore scrypt Parameters

**File:** `scripts/operations/floppy-key/store-admin-key.js:58-62`
**Component:** Key Management

Admin keystore uses `N=16384` (2^14) vs mnemonic keystore's `N=262144` (2^18). The admin key has 16x less brute-force protection despite controlling the deployed contracts.

### LOW-04: `localhost:8545` in CSP connect-src

**File:** `frontend/nginx.conf.template:59`
**Component:** Frontend Security

The production CSP allows connections to `http://localhost:8545`, enabling the frontend to connect to a local Hardhat node. This is a development artifact that should be removed in production.

### LOW-05: GitHub Actions Using Mutable Tags

**File:** `.github/workflows/deploy-cloud-run.yml:18-19`
**Component:** CI/CD

Actions use mutable version tags (`@v2`, `@v4`) instead of pinned SHA hashes. A compromised upstream action could inject malicious code into the CI pipeline.

### LOW-06: No `--set-secrets` for Cloud Run Deployment

**File:** `.github/workflows/deploy-cloud-run.yml:48-57`
**Component:** Infrastructure

The Cloud Run deployment doesn't use `--set-secrets` for sensitive configuration. Environment variables should use Secret Manager references for production secrets.

### LOW-07: Decrypted Mnemonic Cached as JavaScript String

**File:** `.claude/skills/floppy-keystore/scripts/loader.js:43-44`
**Component:** Key Management

JavaScript strings are immutable and cannot be reliably zeroed from memory. The mnemonic persists in the V8 heap until garbage collected. `clearCache` sets the variable to `null` but doesn't guarantee memory clearing.

### LOW-08: `MembershipManager.purchaseTier` Missing `nonReentrant`

**File:** `contracts/access/MembershipManager.sol:133`
**Component:** Smart Contract

`purchaseTier`, `upgradeTier`, and `extendMembership` perform `safeTransferFrom` calls but lack `nonReentrant` guards. If `paymentToken` is a malicious ERC20, it could re-enter during the transfer. This is low severity because the admin controls which token is set.

### LOW-09: Opponent Added to `_userWagerIds` Before Acceptance (Spam Vector)

**File:** `contracts/wagers/WagerRegistry.sol:249`
**Component:** Smart Contract

The opponent is added to `_userWagerIds` at wager creation (line 249), before they accept. If the wager is cancelled/declined/expired, the opponent still has this wager ID in their set. An attacker can spam wager creation targeting a victim, inflating their `getUserWagerCount`.

### LOW-10: `PolymarketOracleAdapter.getOutcome` Returns `block.timestamp` as `resolvedAt` for Uncached Results

**File:** `contracts/oracles/PolymarketOracleAdapter.sol:492-502`
**Component:** Smart Contract

When the resolution cache misses and the adapter fetches directly from the CTF, it returns `block.timestamp` as `resolvedAt` (line 502) rather than the actual resolution time. This is semantically incorrect and changes with every call.

### LOW-11: Missing HSTS Header

**Files:** `frontend/nginx.conf.template`, `frontend/nginx.conf`
**Component:** Infrastructure

Neither nginx config sets `Strict-Transport-Security`. Without HSTS, browsers won't enforce HTTPS on subsequent visits, enabling SSL stripping attacks.

### LOW-12: Lighthouse CSP-XSS Audit Disabled

**File:** `frontend/lighthouserc.json:55`
**Component:** CI/CD

`"csp-xss": "off"` disables the CSP XSS audit in Lighthouse CI, meaning CSP weaknesses are never flagged automatically.

### LOW-13: `MembershipManager.extendMembership` Allows Extension of Expired Memberships

**File:** `contracts/access/MembershipManager.sol:171-186`
**Component:** Smart Contract

`extendMembership` checks `m.tier == Tier.None` but not whether the membership has expired. An expired membership can be extended without going through `purchaseTier`, potentially bypassing intended re-enrollment flows.

### LOW-14: No Key Revocation in KeyRegistry

**File:** `contracts/privacy/KeyRegistry.sol`
**Component:** Smart Contract

Once a key is registered, there is no function to delete it. A user can only overwrite with a new key, not signal that the old key should not be trusted.

---

## Informational

### INFO-01: Centralization Risk — Admin Controls

The `DEFAULT_ADMIN_ROLE` in WagerRegistry and MembershipManager has extensive powers: swap the membership manager (locking all users out), change oracle adapters (manipulate resolutions), modify token allowlist, change payment token, change treasury, withdraw all fees, and freeze any account. All oracle adapters use `Ownable` with a single owner. There is no timelock, multi-sig requirement, or governance delay on any admin operation.

### INFO-02: Subgraph Exposes All Wager Data Publicly

The subgraph indexes all wager events including participant addresses, stakes, and metadata. While encrypted metadata is protected, the on-chain data (who is betting against whom, for how much) is inherently public on the blockchain and the subgraph merely makes it more accessible.

### INFO-03: Key Derivation From Wallet Signatures

The encryption key derivation relies on users signing a deterministic message. The signature itself becomes the seed for encryption keys. If a user signs the same message on a phishing site, the phisher obtains their encryption private key. This is an inherent trade-off of the signature-based key derivation model and is well-documented in the codebase.

### INFO-04: `ResolutionType.Either` Trust Model Documentation

The `Either` resolution type allows either party to declare any winner. This requires significant trust and should be clearly communicated in the UI. The contract itself is correct, but the trust model should be documented prominently for users.

### INFO-05: `Status.Cancelled` Enum Value Never Used

The `Status.Cancelled` value is defined in `IWagerRegistry` but never set anywhere. `cancelOpen` and `declineWager` both `delete _wagers[wagerId]` which resets status to `None`, not `Cancelled`.

### INFO-06: Positive Finding — Well-Known Test Keys Protected

`scripts/operations/seed-testnet.js` correctly detects well-known test keys (`0x...001` through `0x...00a`) and refuses to use them on non-local networks. The `.env.example` file contains appropriate warnings.

### INFO-07: Positive Finding — SafeERC20 Used Throughout

All token transfers use OpenZeppelin's `SafeERC20` library, protecting against non-standard ERC20 return values (e.g., USDT).

### INFO-08: Positive Finding — Reentrancy Guards Present

All state-changing functions in `WagerRegistry` have `nonReentrant` modifiers. Oracle callbacks use `onlyOO` in the UMA adapter.

---

## Parlay Threats (Chained Attack Scenarios)

### PARLAY-01: Oracle Adapter Swap + Inverted CEI = Fund Theft [CRITICAL]

**Chain:** CRIT-02 + MED-02 + Admin Key Compromise (HIGH-05)

1. Attacker compromises the deployer key via the silent `PRIVATE_KEY` fallback (HIGH-05)
2. Attacker calls `setMembershipManager()` to point to a malicious contract
3. The malicious `membershipManager.recordCreate()` (called before state is written, per CRIT-02) re-enters a different function or reverts selectively
4. Combined with the lack of `notFrozen` on auto-resolve (MED-02), the attacker can manipulate which wagers get resolved and how

**Impact:** Total fund drainage from the WagerRegistry escrow.
**Likelihood:** Low — requires admin key compromise first.
**Severity if exploited:** Critical.

### PARLAY-02: Polymarket Link Manipulation + Oracle Resolution = Wager Fraud [CRITICAL]

**Chain:** CRIT-01 + MED-02

1. Attacker monitors the mempool for new wager creation transactions using `ResolutionType.Polymarket`
2. Before the legitimate `linkMarketToPolymarket` call, attacker front-runs with their own `linkMarketToPolymarketWithCTF` call, linking the market to a condition that has already resolved in their favor, or to a supported CTF contract where they control the outcome
3. Since `autoResolveFromPolymarket` has no `notFrozen` check (MED-02), even if the attacker's account is subsequently frozen, a third party can trigger resolution
4. The wager resolves based on the attacker-chosen Polymarket condition

**Impact:** Theft of wager stakes by manipulating which oracle condition determines the winner.
**Likelihood:** Medium — the missing access control is trivially exploitable.
**Severity if exploited:** Critical.

### PARLAY-03: CSP Weakening + IPFS Content Injection + Pinata CORS = Remote XSS [HIGH]

**Chain:** HIGH-03 + MED-04 + IPFS Metadata Rendering

1. Attacker uses the open Pinata proxy (MED-04, wildcard CORS) to pin malicious content to IPFS through the project's own API endpoint
2. The malicious IPFS content is crafted to contain a valid-looking encrypted envelope with an XSS payload in a metadata field
3. When the frontend fetches and renders this metadata, the `'unsafe-inline'` and `'unsafe-eval'` CSP (HIGH-03) allows the injected script to execute
4. The executing script calls `signer.signMessage()` using the victim's connected wallet, obtaining their encryption key derivation signature, which gives the attacker their X25519 private key

**Impact:** Theft of encryption private keys, ability to decrypt all private market metadata for the victim.
**Likelihood:** Medium — requires finding an injection point in metadata rendering.
**Severity if exploited:** High.

### PARLAY-04: Floppy Key Leak via `/tmp` + CI Pipeline = Production Key Theft [HIGH]

**Chain:** CRIT-03 + Shared CI Runner + LOW-05

1. CI workflow runs on a shared runner (LOW-05, mutable action tags mean supply chain risk)
2. A compromised action or adjacent job reads `/tmp/fork-data.json` during a floppy keystore fork operation (CRIT-03)
3. The xprv extracted from the file allows deriving all private keys for all supported blockchains
4. Attacker drains all associated accounts

**Impact:** Total compromise of all blockchain accounts.
**Likelihood:** Low — fork operations are typically manual, not CI-driven.
**Severity if exploited:** Critical.

### PARLAY-05: WalletConnect ID Abuse + Phishing = Social Engineering [MEDIUM]

**Chain:** HIGH-04 + PUBLIC Repository

1. Attacker extracts the hardcoded WalletConnect Project ID from the public repository
2. Attacker creates a phishing site using the same Project ID, making wallet connection prompts appear to come from FairWins
3. Victim connects their wallet to the phishing site
4. Attacker presents the key derivation signing message (publicly known from the codebase), obtaining the victim's signature
5. From the signature, attacker derives the victim's X25519 encryption keys and decrypts all their private market metadata

**Impact:** Decryption of private market metadata, potential social engineering for further exploitation.
**Likelihood:** Medium — WalletConnect IDs are not authentication, but they add legitimacy to phishing.
**Severity if exploited:** Medium.

### PARLAY-06: Membership Expiry During Active Wager + `activeCount` Underflow [MEDIUM]

**Chain:** MED-09 + LOW-08

1. User's membership expires while they have active wagers
2. `revokeMembership` is called, which notes: "monthCount / activeCount left intact"
3. If the wager is then resolved via `declareWinner` with `ResolutionType.Either`, `recordClose` decrements `activeCount`
4. If membership was revoked and a new membership purchased (resetting `activeCount` to 0), the subsequent `recordClose` could underflow... but Solidity 0.8+ prevents this with a revert
5. This means the wager becomes **unresolvable** — `recordClose` reverts, blocking `declareWinner` and `_settleOracleWin`

**Impact:** Funds permanently locked in the WagerRegistry for affected wagers.
**Likelihood:** Low — requires specific sequence of membership state changes.
**Severity if exploited:** Medium.

### PARLAY-07: `cancelOpen` During Pause + Exploit Recovery [MEDIUM]

**Chain:** MED-01 + Emergency Response

1. An exploit is discovered and the Guardian pauses the contract
2. The attacker, who created wagers as part of the exploit setup, calls `cancelOpen` (which is NOT paused, per MED-01)
3. The attacker recovers their escrowed stakes through cancellation while the contract is paused
4. Legitimate users cannot create new wagers or accept existing ones, but the attacker extracts their funds

**Impact:** Attacker recovers exploit setup capital during emergency pause.
**Likelihood:** Medium — directly exploitable during any pause scenario.
**Severity if exploited:** Medium.

### PARLAY-08: Supply Chain Compromise + CI Private Key = On-Chain Admin Takeover [CRITICAL]

**Chain:** LOW-05 + HIGH-07 + HIGH-05

1. A third-party GitHub Action (e.g., `dorny/paths-filter@v3`) is compromised via tag force-push (LOW-05)
2. The compromised action exfiltrates `process.env.PRIVATE_KEY` from the `deploy-contracts.yml` workflow (HIGH-07)
3. With the deployer key, attacker calls `setMembershipManager()`, `setOracleAdapter()`, `setTokenAllowed()` on WagerRegistry
4. Attacker can now manipulate membership checks, oracle resolutions, and token handling to drain all escrowed funds

**Impact:** Complete on-chain admin takeover and fund drainage.
**Likelihood:** Low — requires upstream action compromise.
**Severity if exploited:** Critical.

### PARLAY-09: Opponent `activeCount` Griefing + UMA Retry Block = Permanent Fund Lock [HIGH]

**Chain:** CRIT-05 + HIGH-09

1. Attacker creates wagers with victim as opponent, using `ResolutionType.UMA`
2. Victim accepts the wagers
3. Attacker submits false UMA assertions; honest party disputes; DVM resolves as false
4. Due to HIGH-09, the UMA condition cannot be retried — permanently "resolved as false"
5. Due to CRIT-05, the victim's `activeCount` was incremented but will never be decremented (resolution fails, and the opponent's `activeCount` isn't decremented even on successful resolution)
6. Victim is permanently locked out of creating new wagers AND their funds are stuck in unresolvable wagers

**Impact:** Permanent fund lock + permanent service denial for targeted users.
**Likelihood:** Low — requires both bugs to be exploited together.
**Severity if exploited:** High.

### PARLAY-10: XSS via CSP + sessionStorage Keys + Encrypted Market Decryption [CRITICAL]

**Chain:** HIGH-03 + HIGH-08 + MED-04 + MED-13

1. Attacker pins malicious content via the open Pinata proxy (MED-04)
2. Frontend renders the content; XSS executes due to weak CSP (HIGH-03)
3. XSS payload reads encryption signature from `sessionStorage` (HIGH-08)
4. XSS payload also reads Double Ratchet session state from `localStorage` (MED-13)
5. Attacker derives victim's X25519 + X-Wing private keys from the signature
6. Attacker decrypts all private market metadata and ongoing encrypted communications

**Impact:** Total loss of privacy for all encrypted market data and communications.
**Likelihood:** Medium — requires an HTML injection point, but CSP doesn't block it.
**Severity if exploited:** Critical.

---

## Positive Security Controls

The following security measures are properly implemented:

1. **OpenZeppelin AccessControl** — Role-based access with `DEFAULT_ADMIN_ROLE`, `GUARDIAN_ROLE`, `ACCOUNT_MODERATOR_ROLE`
2. **ReentrancyGuard** — All state-changing functions protected with `nonReentrant`
3. **Pausable** — Emergency pause capability via Guardian role
4. **SafeERC20** — All token transfers use safe wrappers
5. **Account Freezing** — Moderation capability for compromised/malicious accounts
6. **Stale Condition Check** — `createWager` verifies oracle conditions aren't already resolved
7. **Deadline Enforcement** — MAX_ACCEPT_WINDOW (30 days) and MAX_RESOLVE_WINDOW (180 days) prevent indefinite locks
8. **Token Allowlist** — Only admin-approved tokens can be used for wagers
9. **Post-Quantum Cryptography** — X-Wing hybrid KEM (X25519 + ML-KEM-768) for forward-looking privacy
10. **Floppy Keystore** — Air-gapped key management for production deployments
11. **Deterministic Deployment** — Safe Singleton Factory for predictable contract addresses
12. **Slither CI** — Static analysis runs on security-relevant changes

---

## Summary

| Severity | Count | Key Issues |
|----------|-------|------------|
| **Critical** | 5 | Missing oracle access control, inverted CEI, `/tmp` key leak, CI expression injection, opponent `activeCount` never decremented |
| **High** | 9 | Pinata JWT in Docker layers, missing Cloud Run secrets, weak CSP, hardcoded WalletConnect IDs, PRIVATE_KEY fallback, fee-on-transfer tokens, CI key exposure, sessionStorage encryption keys, UMA retry block |
| **Medium** | 13 | Missing pause/freeze modifiers, unbounded loops, wildcard CORS, accruedFees overflow, command injection, password exposure, weak key derivation, Either self-declaration, missing dispute mechanism, feed staleness, root containers, localStorage crypto keys |
| **Low** | 14 | dangerouslySetInnerHTML, timing attacks, weak scrypt, localhost CSP, mutable action tags, missing secrets config, memory caching, missing nonReentrant, spam wagers, incorrect resolvedAt, missing HSTS, disabled CSP audit, expired membership extension, no key revocation |
| **Informational** | 8 | Centralization risk, public subgraph, signature-based key derivation, Either trust model, unused enum, positive SafeERC20, positive reentrancy guards, positive test key protection |
| **Parlay (Chained)** | 10 | Three rated Critical, three rated High, four rated Medium |

### Top 5 Recommended Fixes (Priority Order)

1. **Fix CRIT-05:** Call `recordClose` for both creator AND opponent in `declareWinner`, `_settleOracleWin`, `claimRefund`, `cancelOpen`, `declineWager`, and `batchExpireOpen`
2. **Fix CRIT-01:** Add `onlyOwner` to `linkMarketToPolymarket` and `linkMarketToPolymarketWithCTF` in `PolymarketOracleAdapter`
3. **Fix CRIT-04:** Rewrite the CI "Debug secrets" step to use `env:` block instead of expression substitution in `run:`
4. **Fix HIGH-06:** Add balance-before/balance-after checks for token transfers, or document that fee-on-transfer tokens must never be allowlisted
5. **Fix HIGH-03 + MED-04:** Remove `'unsafe-eval'` from CSP and restrict Pinata proxy CORS to the app's own origin
