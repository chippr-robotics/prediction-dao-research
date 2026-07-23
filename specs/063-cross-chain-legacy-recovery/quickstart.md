# Quickstart / Validation Guide: 063 Cross-Chain Legacy Recovery

**Feature**: 063 | Runnable validation scenarios proving the feature works end-to-end. Implementation
details live in `tasks.md` / the code; this is the run-and-verify guide.

## Prerequisites

- Frontend deps installed (`cd frontend && npm ci`), including new dep `@solana/kit` and dev/test-only
  `@bitgo/utxo-lib`; `@scure/bip39` + `@scure/base` promoted to direct deps.
- Optional gateway modules configured only for live/testnet runs (`SOLANA_*`, `ZCASH_*`); unit tests
  need none. (Monero is deferred — no `MONERO_*`.)
- Run tests: `frontend/node_modules/.bin/vitest run --root frontend`.

## Scenario A — Acting account applies everywhere (US1, no new chains)

1. Sign in; recover or select a vault/legacy account; open the account switcher and act as it.
2. **Verify** each surface shows the acting account, not the connected wallet:
   - Portfolio holdings = acting account's assets.
   - Receive address/QR = acting account's address (or an honest "no address on this chain").
   - Payment Request recipient = acting account; confirmation restates it.
   - Home Send/Receive source + dashboard stats = acting account.
3. Switch back to personal → every surface resets.
4. **Automated**: integration test renders each surface under personal/vault/legacy identities and
   asserts the address used matches the acting account for all of them (SC-001/002).

## Scenario B — Bitcoin hardware-wallet recovery (US2)

1. Recover a known test mnemonic with BTC history on non-default paths/accounts.
2. Run discovery. **Verify** funded addresses are found across BIP44/49/84/86 and account indices >0,
   and the total matches a reference wallet (SC-003).
3. Select the recovered BTC account → send; **verify** fee payer disclosed, fee ceiling enforced,
   valid tx broadcast (testnet).
4. **Automated**: pin zero-mnemonic address vectors per purpose; assert the frozen passkey vectors
   still pass unchanged (SC-007); no-history mnemonic ⇒ "no funds found" not a phantom row.

## Scenario C — Solana (US3)

1. Recover a test mnemonic controlling devnet SOL.
2. **Verify** derived address = pinned vector (`m/44'/501'/0'/0'` →
   `HAgk14JpMQLgt6rVgv7cBQFJWFto5Dqxi472uT3DKpqk` for the zero mnemonic); balance shown; native SOL
   send builds+submits on devnet with fee disclosure.
3. **Automated**: derivation vector test (primary + `m/44'/501'/0'` scheme guard); address validation
   (32-byte base58, no checksum).

## Scenario D — Zcash transparent (US4)

1. Recover a mnemonic with transparent testnet ZEC.
2. **Verify** t-address = pinned vector (`m/44'/133'/0'/0/0` → `t1XVXWCvpMgBvUaed4XDqWtgQgJSu1Ghz7F`
   mainnet); balance via Blockbook; transparent send builds+broadcasts on testnet with live branch id.
3. **Gate (mandatory before mainnet)**: ZIP-244 transparent sighash passes the official vectors AND a
   `@bitgo/utxo-lib` differential cross-check (identical sighash/serialization) — CI-enforced.
4. **Verify** shielded-only funds ⇒ honest "shielded not recovered this version" disclosure (FR-016).

## Security validation (all scenarios, SC-005)

- Grep/scan storage, network payloads, logs, and the activity ledger across the full matrix: **no
  seed, private key, or xprv ever appears** (with Monero deferred, no private key of any kind — not
  even a view key — reaches a gateway).
- Lock/relock, account switch, disconnect → derived keys dropped from memory (FR-018).
