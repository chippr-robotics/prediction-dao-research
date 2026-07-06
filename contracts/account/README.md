# Vendored: Coinbase Smart Wallet v1.1.0 (spec 041)

Standards-based ERC-4337 smart account used for FairWins passkey wallet
accounts (spec 041). **Do not modify the Solidity logic in this directory** —
it is vendored from upstream audited releases; forking it forfeits the audit
trail. The ONLY changes made when vendoring were **import-path rewrites**
(Foundry remapping-style paths → Hardhat-resolvable relative / npm paths)
and the removal of ONE tooling-only NatSpec line in `MultiOwnable.sol`
(`@custom:storage-location` on the file-level struct — comments have zero
bytecode effect; `@openzeppelin/hardhat-upgrades` hard-errors on file-level
namespaced structs and offers no exclusion config). Logic, pragmas, and
storage layout are byte-identical to upstream.

## Provenance (pinned)

| Component | Upstream | Commit / tag | License | Files |
|---|---|---|---|---|
| Smart wallet | [coinbase/smart-wallet](https://github.com/coinbase/smart-wallet) | `a8c6456` (tag `v1.1.0`) | BSD-3-Clause | `CoinbaseSmartWallet.sol`, `CoinbaseSmartWalletFactory.sol`, `ERC1271.sol`, `MultiOwnable.sol`, `utils/ERC1271InputGenerator.sol` |
| ERC-4337 v0.6 interfaces | [eth-infinitism/account-abstraction](https://github.com/eth-infinitism/account-abstraction) | `abff2ac` (smart-wallet submodule pin) | GPL-3.0 | `lib/account-abstraction/interfaces/{IAccount,UserOperation}.sol`, `lib/account-abstraction/core/Helpers.sol` |
| Solady | [vectorized/solady](https://github.com/vectorized/solady) | `c4c9660` (smart-wallet submodule pin) | MIT | `lib/solady/accounts/Receiver.sol`, `lib/solady/utils/{SignatureCheckerLib,UUPSUpgradeable,LibClone,LibString}.sol` |
| WebAuthn verifier | [base-org/webauthn-sol](https://github.com/base-org/webauthn-sol) | `619f20a` (smart-wallet submodule pin) | MIT | `lib/webauthn-sol/WebAuthn.sol` |
| FreshCryptoLib (P-256) | [rdubois-crypto/FreshCryptoLib](https://github.com/rdubois-crypto/FreshCryptoLib) | `76f3f13` (webauthn-sol submodule pin) | MIT | `lib/FreshCryptoLib/{FCL_ecdsa,FCL_elliptic}.sol` |

Notes:

- `WebAuthn.sol` tries the **RIP-7212 precompile** (`0x…0100`) first and
  falls back to the FreshCryptoLib Solidity verifier — this is what makes the
  same bytecode work on Polygon/Amoy (precompile) and, later, ETC/Mordor
  (fallback), per spec 041 FR-022.
- `LibString.sol` is taken from the smart-wallet solady pin (`c4c9660`)
  rather than webauthn-sol's own solady pin (`e7024be`) so the vendored tree
  carries exactly one solady version; the two pins are API-compatible for
  `LibString` (verified by compilation + the WebAuthn test vectors in
  `test/account/`).
- `Base64` is imported from the repo's existing `@openzeppelin/contracts` npm
  dependency instead of a second vendored OZ copy.
- The account contracts pin `pragma solidity 0.8.23` — `hardhat.config.js`
  carries a dedicated `0.8.23` compiler entry for this directory.
- Deployment: FairWins deploys its **own factory instance** deterministically
  (`scripts/deploy/deploy-account-stack.js`); wallet instances are
  **user-owned** UUPS proxies (upgradable only by their owners — see spec 041
  plan.md Complexity Tracking). The factory is immutable.
