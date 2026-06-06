# Phase 0 Research: Complete the Remaining E2E Stubs

## R1. Mocking IPFS (the off-chain metadata store)

**Decision**: Intercept the Pinata HTTP boundary with `cy.intercept` and back it
with an in-memory CID→blob map for the spec run.

**Findings**: `ipfsService.js` uploads JSON via `getUploadEndpoint()` →
`/api/pinata/pinJSONToIPFS` (proxy) or `https://api.pinata.cloud/pinning/pinJSONToIPFS`,
and reads via `${IPFS_GATEWAY}/ipfs/{cid}` (`gateway.pinata.cloud` by default). The
existing harness does **not** touch IPFS, so the encrypted-create path hangs in
tests (why 001 disabled the privacy toggle).

**Approach**:
- `cy.intercept('POST', '**/pinJSONToIPFS', (req) => { store[cid] = req.body; req.reply({ IpfsHash: cid }) })`
  where `cid` is a deterministic id derived from a per-test counter (no `Date/random`
  needed; can hash the body).
- `cy.intercept('GET', '**/ipfs/*', (req) => req.reply(store[cidFromUrl(req.url)]))`.
- An explicit "store unreachable" variant returns `req.reply({ statusCode: 500 })`
  (or `forceNetworkError`) to drive the graceful-error + retry assertion (FR-004).

**Rationale**: Mocks only the network boundary (like the wallet), so the app's real
`encryption.js` round-trip is exercised. No production change. Deterministic CIDs
keep it reproducible on a reused node.

**Alternatives**: real local IPFS node (rejected — heavy CI infra, flaky, decided
against in the spec); stub the whole upload/decrypt (rejected — wouldn't test the
crypto).

## R2. Per-account wallet signatures (distinct encryption keys)

**Decision**: Make `mockWeb3Provider`'s `personal_sign` (and `eth_sign`/typed-data
if used) return a **deterministic per-account** value derived from the connected
account address.

**Findings**: `encryption.js:43-48` derives the keypair as
`signature = signer.signMessage(KEY_DERIVATION_MESSAGE)` then
`keccak256(toUtf8Bytes(signature))` — it **hashes the signature and never verifies
it**. The current mock returns the same bytes (`0x` + `ab`×65) for every account,
so all accounts would derive the **same** key and a non-participant could decrypt —
breaking the core privacy assertion (SC-003).

**Approach**: return `keccak256(account || message)` expanded to a 65-byte hex
string (the value need only be deterministic and account-distinct; it is hashed
again downstream). Keep it a pure function of the account so re-connecting the same
account derives the same key (decryption must round-trip).

**Rationale**: Smallest change that makes derived keys account-specific, enabling
the participant-can / non-participant-cannot assertions. Test scope only.

**Alternatives**: use real per-account ECDSA signing with the Hardhat keys in the
mock (rejected — unnecessary; derivation hashes the sig, so real ECDSA buys nothing
and complicates the in-page mock).

## R3. On-chain key registration (03)

**Decision**: Drive the real WalletPage registration flow; assert via a KeyRegistry
read (the same `hasKey`/`getKey` the app uses), plus the UI's registered state.

**Findings**: `keyRegistryService.js` registers via `contract.registerKey('0x'+pub)`
and reads registration status; `WalletPage.jsx` holds `keyRegistered` state and a
register handler (Security area). Registration is an on-chain write — now functional
under the 001 mock-write fix. The registered public key derives from the (R2)
per-account signature.

**Rationale**: No IPFS needed; self-contained; unblocks US3 (participants must have
registered keys to address a private wager).

## R4. Removing the obsolete lifecycle journey (23)

**Decision**: Delete the "Challenged Resolution with Arbitrator" journey (E2E-04)
and keep five valid journeys (1v1 manual, Polymarket auto, accept-timeout,
oracle-timeout, frozen-winner). Renumber/relabel as needed.

**Findings**: The challenge/dispute + arbitrator re-resolution feature was removed
(#621/#625); `declareWinner` is final and ThirdParty resolution is gone from the
create UI — the same obsolescence that led to deleting `09-challenge-dispute`. A
journey testing it would assert a non-existent feature.

**Rationale**: Matches the 001 precedent (FR-002/SC-004); avoids a misleading
"passing" test of dead functionality.

## R5. Lifecycle assertions reuse the 001 capabilities

**Decision**: Build the five journeys on the 001 helpers — `createAndAcceptWager`
(on-chain setup), `createWagerViaUI` (real UI create), `chainTx` (resolve/refund/
autoResolve/freeze + `wagerInfo` reads), `advanceTime`. Assert terminal on-chain
state (`wagerInfo.status`/`winner`) plus a user-visible signal where a UI action is
exercised.

**Open item to verify in Phase 2**: the **winner-claims-payout** UI step (journey 1)
— `claimPayout` is a write tx (should work post-001-fix), but the MyMarkets claim
button/flow hasn't been driven yet; the implement phase confirms the selector and
falls back to a `chainTx` claim + UI "paid" display if the button proves brittle
(documented, not silent).

## R6. Test isolation on the shared node

**Decision**: Reuse 001's conventions — `createWagerViaUI` sets a far-future end
date (survives `advanceTime`), `restoreGlobalState` in `afterEach` for any global
state, salted ids for uniqueness; **verify the full suite on a fresh node** (the
only reliable signal, as the 001 reused-node time-skew showed).

## Resolved unknowns

All Technical-Context constraints are resolved. New capabilities required: IPFS
intercept (R1) + per-account mock signing (R2). Everything else reuses 001.
