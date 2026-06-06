# Quickstart: Validating Multi-Recipient Wager Encryption (Participants + Arbitrator)

Runnable validation scenarios proving the arbitrator can find, read, and resolve a private wager. Implementation lives in the source tree / `tasks.md`; this is the run/verify guide.

## Prerequisites

- Deps installed (`npm install`; `cd frontend && npm install`); `npm run compile` clean.
- The contract change (arbitrator index) is layered onto the 004 v3 `WagerRegistry`; for contract tests it just needs to be compiled into `WagerRegistry.sol`.
- Three test wallets: creator, opponent, arbitrator — each with a registered encryption key for the encryption scenarios.

## 1. Contract test — arbitrator discovery index

New suite: `test/WagerRegistry.arbitrator-index.test.js`. Run:

```bash
npx hardhat test test/WagerRegistry.arbitrator-index.test.js
```

Expected:
- **Indexed for arbitrator**: create a `ThirdParty` wager naming arbitrator `A` → `getUserWagerIds(A,…)` includes the wagerId; `getUserWagerCount(A)` increments; creator and opponent indexes also include it.
- **Not indexed when none**: create an `Either` wager (arbitrator = 0) → no third index write; arbitrator-of-someone-else's-wager address has count 0.
- **Resolution still works**: arbitrator `A` calls `declareWinner` on their `ThirdParty` wager → resolves (existing authority unaffected).
- **No regression**: run `npm test` (full contract suite green).

## 2. Frontend — encryption includes the arbitrator as a reader

```bash
npm run test:frontend
```

Expected (encryption/recipient tests):
- A private ThirdParty wager's envelope has a `keys[]` entry for creator, opponent, **and** arbitrator (3 entries); a non-ThirdParty private wager has 2.
- `canDecrypt(envelope, arbitrator) === true`; `canDecrypt(envelope, randomAddress) === false`.
- The single `content` ciphertext is unchanged in shape (encrypted once); participant entries are byte-identical to a two-recipient wager (no regression).

## 3. Frontend — key-gate blocks creation when the arbitrator has no key

Expected:
- Attempting to create a private ThirdParty wager naming an arbitrator with **no** registered key is **blocked** with a clear message naming the arbitrator; no IPFS upload and no `createWager` call occur.
- Once the arbitrator registers a key, creation proceeds.

## 4. Frontend — ThirdParty create UI + disclosure

Expected:
- The create form offers **ThirdParty** resolution and reveals an arbitrator-address input; invalid / self / opponent addresses are rejected inline.
- When an arbitrator is set on a private wager, the UI discloses that the arbitrator can read the terms.

## 5. Frontend — "Arbitrating" discovery view

Expected:
- As the arbitrator wallet, an **Arbitrating** tab/filter lists the wager(s) where the wallet is the arbitrator (driven by `getUserWagers`), shows the decrypted terms, and offers resolve (and, post-004, draw) actions.
- A wallet that is not an arbitrator sees no foreign wagers in that view.

## 6. End-to-end (Amoy, after the combined v3 deploy)

```bash
npm run frontend
```

- Creator (with all three keys registered) creates a private ThirdParty wager naming the arbitrator → opponent accepts → arbitrator opens "Arbitrating", reads the terms, and resolves → correct payout. Confirm a fourth wallet cannot read the terms.

## 7. Security & a11y (CI / pipeline)

```bash
slither .        # arbitrator-index change: 0 new high/critical
# Medusa: invariant that indexing the arbitrator changes no fund/resolution behavior
```
- axe/Lighthouse on the create form (arbitrator input, disclosure) and the Arbitrating view → WCAG 2.1 AA.

## Success mapping

| Spec criterion | Validated by |
|---|---|
| SC-001 (arbitrator reads terms) | §2 + §6 |
| SC-002 (arbitrator discovers wagers) | §1 + §5 |
| SC-003 (end-to-end discover→read→resolve; ThirdParty creatable) | §1 + §4 + §6 |
| SC-004 (non-reader can't read) | §2 + §6 |
| SC-005 (participants no regression) | §2 + `npm test` |
| SC-006 (bundle verifiable vs on-chain) | integrity check in §2/§6 |
| SC-007 (missing-key blocks creation) | §3 |
