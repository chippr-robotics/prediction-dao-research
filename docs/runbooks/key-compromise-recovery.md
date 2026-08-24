# Runbook — recovering from a compromised admin key

Written from an actual recovery (2026-08-22), not from theory. The deploy EOA
`0x52502d04…F6e1` was found in plaintext in a Claude Code permission allowlist; it held
`DEFAULT_ADMIN`/`UPGRADER` on ~260 (contract, role) pairs across eight chains and was `owner()` on
ten `Ownable` contracts. This is what actually worked, and — more usefully — what surprised us.

## The shape of the problem

The instinct is "revoke the key immediately." That instinct is wrong and will brick contracts.

**The compromised key is usually the only key that can perform its own retirement.** It is the sole
holder of the roles you need to hand over, the `owner()` of the contracts you need to transfer, and
often one of the signatures on the multisig you are migrating *to*. Plan a **final, deliberate use**
of the key. Do not panic-revoke.

## Order of operations

The order below is not stylistic. Each step is ordered because doing it later costs you the ability
to do it at all.

### 0. Contain, then measure

Scrub the key from disk (see [Scrubbing](#scrubbing) below), then **inventory before acting**. You
cannot sequence what you have not measured. For every chain, for every contract, enumerate:

- every role the key holds, and **how many other holders each role has**
- every role where the key is the **sole** holder — these dictate the entire ordering
- `owner()` / `pendingOwner()` on non-AccessControl contracts
- address-valued getters (`treasury`, `feeRecipient`, `guardian`, `signer`) returning the key
- **inbound paths** — anywhere funds will keep *arriving* at the compromised address

Core contracts here are **not** `AccessControlEnumerable`, so `getRoleMemberCount` reverts. Holder
counts must come from a `RoleGranted`/`RoleRevoked` log scan. If a scan cannot complete, report the
count as **unverifiable** — never as zero. A confident wrong count is how a contract gets bricked.

### 1. Value at risk first — these are races

Anything the attacker can take with the key alone, take first:

- **Paymaster deposits.** `withdrawTo` is `onlyOwner` with no unstake delay. Ours held 41.75 POL —
  more than the EOA's own balance, and invisible in any balance check of the EOA.
- **`msg.sender`-keyed venue fees.** GMX `claimUiFees` can only ever be called by the receiver. If
  the receiver is the compromised key, accrued fees are claimable *only* by that key — an
  unavoidable race. Zero the factor (`setUiFeeFactor(0)`) to stop further accrual.

### 2. Retarget treasuries — BEFORE any renounce

**This is the step we got wrong.** `setTreasury` is gated on `DEFAULT_ADMIN_ROLE`. We renounced on
Mordor before retargeting its `membershipManager.treasury`, and turned a one-transaction fix into a
multisig proposal. Retarget every fund destination while the key still holds admin.

### 3. Roles: grant → verify independently → renounce

Use `scripts/ops/transfer-roles.js`. Its shape is the safety:

- `grant` and `renounce` are **separate commands**, never one run
- `renounce` re-reads the chain and refuses unless the multisig verifiably holds the role *now*
- it requires the multisig to have **bytecode on the target chain**
- nothing runs without `CONFIRM=<network>`

Verify between the two with an *independent* read — a different script, direct `hasRole` calls — not
by trusting the grant step's own output. Rehearse on a testnet chain first.

Contracts outside that tool's managed set (`sanctionsGuard`, `tokenFactory`, `miniAppRegistry`,
`membershipVoucher`, oracle adapters, paymaster) take the same grant→renounce shape by hand.
Renounce `DEFAULT_ADMIN` **last** per contract — it is the role that can re-grant the others.

### 4. Rotate stored copies

Rotate the secret, do not repoint it — a new version leaves the old payload readable in version
history. Rotate every stored copy: Secret Manager, CI secrets, any `.env` backup.

## What surprised us

**Redeploy vs. migrate inverts mid-flight.** Redeploying looked cheaper than migrating ~260
authorities — until Phase 3, when we noticed `setSanctionsGuard` is `DEFAULT_ADMIN`-gated on all 8
of its consumers, whose admin was now *the Safe*. Redeploying would have required a multisig
proposal per consumer, through tooling that does not exist. Migrating by grant→renounce needed only
plain EOA transactions. **The moment admin moves to a multisig you cannot easily transact from, every
"just redeploy it" plan gets more expensive, not less.** Re-evaluate that call after each phase.

**A self-administered role is not the trap it looks like.** `MiniAppRegistry.APP_CURATOR_ROLE` is its
own role admin, so `DEFAULT_ADMIN` cannot grant it — only the current curator can. That reads like a
contract you must redeploy. It is not: the compromised key *is* the current curator, so it can grant
the successor directly. Do it before renouncing anything else on that contract.

**Two-step ownership does not complete on transfer.** Chainlink's `ConfirmedOwner` (used by
`ChainlinkFunctionsOracleAdapter`, unlike the OZ `Ownable` adapters) sets a *pending* owner;
`owner()` is unchanged until the new owner calls `acceptOwnership()`. A transfer that "mined
successfully" but left `owner()` untouched is this, not a failure. Verify via the
`OwnershipTransferRequested` event.

**Owner-set composition decides who can act, per chain.** Our first admin Safe was 2-of-3 with a
**passkey contract** as one owner. A contract owner signs via EIP-1271, which requires code on that
chain — and the passkey existed only on Polygon. On six of seven chains the Safe was effectively
2-of-2, and the compromised key was *required* for every operation including its own removal. Every
owner of a multi-chain Safe should be an EOA, or deployed everywhere.

**KMS is not a stronger boundary than the Google account.** `roles/owner` includes both
`cryptoKeyVersions.useToSign` and `cryptoKeys.setIamPolicy`. A KMS key is excellent at being
non-exportable — it cannot leak into a shell history the way the EOA did — but anyone who owns the
project can sign with it. In a 2-of-3 it is one signature; the hardware devices are what make the
set safe. Do not grant it to a service account that holds a downloadable JSON key.

**Guards that refuse are working.** `transfer-roles.js` refused to renounce `feeRouter`
`DEFAULT_ADMIN` while fee services were unregistered, because that would leave routers reverting
`ServiceUnknown` with no admin. Treat a refusal as information, not an obstacle.

## RPC failures during recovery

Public endpoints failed three distinct ways in one session, each of which can be misread:

| Symptom | Reality |
|---|---|
| `nonce too low: next nonce N, tx nonce N-1` mid-sequence | Stale nonce from the RPC. Transactions before it landed. **Resume, do not restart.** |
| `403 Forbidden` right after a send | The *send* succeeded; the **receipt read** was refused. Verify on-chain before retrying — retrying may double-send. |
| Reads succeeding then failing in a batch | Rate limiting. **An unreadable read is not a negative** — never render it as "role not held". |

Use a paid archive endpoint for recovery work. Switching Polygon to QuickNode ended the nonce races
immediately after two failed runs on a public node.

## Scrubbing

Scrubbing reduces further spread. **It is not remediation** — the key stays compromised until its
authority and funds are gone.

Find copies by **deriving**, not grepping: scan every `0x`-prefixed 64-hex string under `~/.claude`,
`/tmp`, shell history and the repo, derive the address, and match. You will not know every place the
key was written. Ours was in seven files including a prior session's `.env` backup and two agent
transcripts.

Two cautions:

- **Transcript and history files are live.** One file changed between the dry run and the real run.
  Re-scan the whole disk afterwards, not just the file list you started with.
- **An agent rewriting its own logs is indistinguishable from covering tracks.** Expect a permission
  classifier to block it, and treat that as correct. Hand the operator a script instead.

## Tooling

| Need | Use |
|---|---|
| Role handoff | `scripts/ops/transfer-roles.js` (`MODE=grant`/`renounce`, `CONFIRM=<net>`) |
| Register a fee service | `scripts/ops/register-fee-service.js` (**one-shot per id**) |
| GMX UI fee | `scripts/ops/set-gmx-ui-fee-factor.js` |
| Deploy a new admin Safe | `scripts/ops/deploy-admin-safe.js` (owners/threshold/salt are CREATE2 inputs) |
| Derive a KMS address | `scripts/operations/relayer/kms-gas-address.js` |
| **Send a tx signed by KMS** | `scripts/ops/lib/kmsSigner.js` |

### The gap this recovery closed

There was no way to send a transaction signed by a KMS key, which meant a KMS Safe owner could not
send `approveHash` and therefore could not participate in the Safe at all.
`scripts/ops/lib/kmsSigner.js` closes it. The whole trick: KMS `EC_SIGN_SECP256K1_SHA256` signs
whatever 32 bytes you put in `digest.sha256` — it does not check they came from SHA-256 — so you
pass the transaction's `unsignedHash` (keccak of the RLP).

### The gap still open

There is **no CLI path to propose or execute a Safe transaction.** The full toolkit
(`buildSwapOwner`, `computeSafeTxHash`, `buildPrevalidatedSignatures`, `encodeExecTransaction`)
lives in `frontend/src/lib/custody/vaultTransaction.js` with extensionless imports that plain Node
cannot resolve, and no script imports it. Every Safe operation currently needs a browser with a
connected wallet. Porting those builders to a Node-resolvable module under `packages/` is the single
highest-value follow-up — it is what makes the multisig operable without a browser.

Note the Safe here uses **on-chain `approveHash`**, not off-chain signature collection, so no Safe
Transaction Service is required on any chain — including ETC and Mordor, which have none.

## Post-recovery checklist

- [ ] Every stored copy of the key rotated (Secret Manager, CI secrets, `.env` backups)
- [ ] Automated deploy workflows gated — ours fires on push to `main` for `contracts/**` and
      `hardhat.config.js` and signs with the compromised key
- [ ] Funds swept — including NFTs, which a token-transfer loop silently skips
      (`MembershipVoucher` is not `ERC721Enumerable`; transfer by explicit token id)
- [ ] Superseded multisig's roles revoked
- [ ] Redaction scan re-run — recovery puts the key through the shell many more times
- [ ] Deployment records updated, with the superseded Safe recorded rather than deleted while it
      still holds authority
