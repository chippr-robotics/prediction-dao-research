# Passkey Smart Accounts: Putting WebAuthn Signatures on an ERC-4337 Wallet

*How FairWins turned Face ID into a self-custodial Ethereum account — no seed phrase, no browser extension, and a P-256 verifier that runs on-chain*

| | |
|---|---|
| **Series** | Accounts & Keys (part 1) |
| **Audience** | Wallet developers, account-abstraction engineers |
| **Tags** | `account-abstraction`, `erc4337`, `passkeys`, `webauthn`, `p256`, `erc1271` |
| **Reading time** | ~9 minutes |

## The curve nobody asked for

Picture the onboarding funnel for a peer-to-peer wager platform. A friend sends you a wager link. You have never installed MetaMask, you have never written twelve words on paper, and you are not going to start tonight. What you do have is a phone with a fingerprint sensor and a secure enclave that has been signing things for you — payments, logins — for years.

That enclave speaks WebAuthn. When you register a passkey, the authenticator mints a keypair and will sign challenges after a biometric check, without the private key ever leaving the hardware. This is exactly the custody model crypto wallets have been chasing: keys that cannot be exported, phished, or pasted into a fake support chat.

There is one problem, and it is a stubborn one: the curve. Secure enclaves and platform authenticators sign on **secp256r1** (P-256, the NIST curve). Ethereum externally-owned accounts recover signatures on **secp256k1**. There is no way to make a passkey pretend to be an EOA — `ecrecover` will never accept a P-256 signature. If you want passkeys to control funds, the account itself has to become a smart contract that knows how to verify P-256, and something other than the user has to be able to feed it transactions, because a passkey cannot pay gas from an address that does not exist yet.

That is the shape of FairWins spec 041: an **ERC-4337 smart account** owned by a WebAuthn credential, with on-chain P-256 verification, deterministic counterfactual addresses, and first-use deployment. This post walks the contract stack in `contracts/account/` — what we vendored, what we wired around it, and where the sharp edges were.

## An account is a set of owners, not a key

The account contract is a vendored **Coinbase Smart Wallet v1.1.0** — `contracts/account/CoinbaseSmartWallet.sol` plus its pinned dependency closure (`webauthn-sol`, `FreshCryptoLib`, Solady, `account-abstraction`). The vendoring rule, documented in `contracts/account/README.md`, is strict: no logic modifications, path-only import rewrites. We wanted an audited, widely deployed account implementation, not a fork we would have to re-audit forever.

The foundation is `contracts/account/MultiOwnable.sol`, and its central trick is that an owner is just `bytes`:

- a 32-byte ABI-encoded Ethereum address (a linked EOA), or
- a 64-byte P-256 public key — the `(x, y)` coordinates of a passkey.

Both kinds sit in the same index-addressed mapping and are interchangeable controllers. Adding or removing one (`addOwnerPublicKey(bytes32 x, bytes32 y)`, `addOwnerAddress(address)`, `removeOwnerAtIndex`) is an owner-authorized self-call, and `removeOwnerAtIndex` reverts with `LastOwner()` rather than let an account brick itself by removing its final controller.

Signature validation dispatches on the owner's byte length. Every signature arrives wrapped with the index of the owner that produced it:

```solidity
struct SignatureWrapper {
    /// @dev The index of the owner that signed, see `MultiOwnable.ownerAtIndex`
    uint256 ownerIndex;
    /// @dev If `MultiOwnable.ownerAtIndex` is an Ethereum address, this should be `abi.encodePacked(r, s, v)`
    ///      If `MultiOwnable.ownerAtIndex` is a public key, this should be `abi.encode(WebAuthnAuth)`.
    bytes signatureData;
}
```

In `CoinbaseSmartWallet._isValidSignature`, 32-byte owners go through Solady's `SignatureCheckerLib` (ECDSA or nested ERC-1271); 64-byte owners take the WebAuthn path:

```solidity
if (ownerBytes.length == 64) {
    (uint256 x, uint256 y) = abi.decode(ownerBytes, (uint256, uint256));

    WebAuthn.WebAuthnAuth memory auth = abi.decode(sigWrapper.signatureData, (WebAuthn.WebAuthnAuth));

    return WebAuthn.verify({challenge: abi.encode(hash), requireUV: false, webAuthnAuth: auth, x: x, y: y});
}
```

This one function backs both ERC-4337 `validateUserOp` and ERC-1271 `isValidSignature` — one verification path for transactions and off-chain signatures alike.

## Verifying WebAuthn where gas is real

A WebAuthn assertion is not a bare signature over a hash. The authenticator signs `sha256(authenticatorData || sha256(clientDataJSON))`, where `clientDataJSON` embeds the challenge (base64url-encoded) and a ceremony type. `contracts/account/lib/webauthn-sol/WebAuthn.sol` re-runs the relevant verification steps from the W3C spec on-chain: it checks the client data `type` is `"webauthn.get"`, that the encoded challenge in the JSON matches the expected hash, that the User Present flag is set in `authenticatorData`, and it rejects high-`s` P-256 signatures to close the malleability hole. The library's NatSpec is refreshingly explicit about what it deliberately does *not* verify — origin, `rpIdHash`, signature counters — trusting platform authenticators and app-site association to enforce those, which is the honest trade for keeping verification affordable.

Then comes the actual curve math. P-256 verification in pure EVM is expensive, so the library tries the **RIP-7212 precompile** at address `0x100` first — about 3,450 gas on Polygon and Amoy, where FairWins runs passkeys today. On chains without the precompile, the `staticcall` returns empty and the code falls back to `FCL_ecdsa.ecdsa_verify` from FreshCryptoLib, a Solidity implementation costing a couple hundred thousand gas. The same bytecode serves both worlds — which is precisely why the deferred ETC/Mordor increment needs no contract changes, only a self-hosted bundler.

## An address before an account

The user's account address must exist before any contract does — it is where a friend sends their stake. `contracts/account/CoinbaseSmartWalletFactory.sol` makes the address a pure function of the initial owners:

```solidity
function createAccount(bytes[] calldata owners, uint256 nonce)
    external payable virtual returns (CoinbaseSmartWallet account)
{
    if (owners.length == 0) revert OwnerRequired();

    (bool alreadyDeployed, address accountAddress) =
        LibClone.createDeterministicERC1967(msg.value, implementation, _getSalt(owners, nonce));
    ...
}
```

The salt is `keccak256(abi.encode(owners, nonce))`, and the account is a deterministic ERC-1967 proxy over the shared implementation. `getAddress(owners, nonce)` predicts the address without deploying anything. FairWins deploys the factory itself through a canonical CREATE2 deployer with a pinned salt (`scripts/deploy/deploy-account-stack.js`), so the factory — and therefore every account address — is identical on every supported network. Recorded deployment keys: `entryPoint`, `accountFactory`, `accountImpl`.

Deployment happens lazily. The first time the user acts, the frontend (`frontend/src/lib/passkey/sendBatch.js`) attaches ERC-4337 `initCode` that calls `createAccount`; the EntryPoint deploys the account and executes the operation in the same transaction. One war story worth passing on, preserved as a comment in `frontend/src/lib/passkey/smartAccount.js`: viem's smart-account helper defaults to the *canonical Coinbase factory address*, which derives a **different** counterfactual address than the FairWins-deployed factory. Left unpinned, every UserOp was built for an empty account and reverted with "exceeds balance". The fix is to pin the sender to the address returned by the FairWins factory's `getAddress` and generate `initCode` against that same factory. If you integrate any vendored factory with a generic AA SDK, audit its address-derivation defaults first.

## ERC-1271, with a seatbelt

Wagering on FairWins mostly rides gasless EIP-712 intents (specs 035/036), and USDC moves via EIP-3009 authorizations — both off-chain signatures. A contract account signs those through **ERC-1271**: verifiers call `isValidSignature(hash, signature)` and expect the `0x1626ba7e` magic value.

The vendored `contracts/account/ERC1271.sol` adds one crucial layer: an anti-cross-account-replay wrapper. Because the same passkey can own several accounts, a naive implementation would let a signature approved for account A validate on account B. So the contract never verifies the raw hash — it verifies `replaySafeHash(hash)`, an EIP-712 hash of `CoinbaseSmartWalletMessage(bytes32 hash)` under a domain separator bound to `block.chainid` and `address(this)`. A signature is valid for exactly one account on exactly one chain. On the platform side, spec 041 extended `contracts/upgradeable/SignerIntentBase.sol` with an ECDSA-then-ERC-1271 check so intent verification accepts contract signers, with a matching fail-closed `eth_call` fallback in `services/relay-gateway/src/intent/verify.js`. One honest scope note: the EIP-3009 payment leg is still ECDSA-only in the intent twins, so passkey stake-moving actions ride `executeBatch` UserOps until the ERC-7598 bytes-signature leg is plumbed through — `test/fork/usdc-erc1271-authorization.test.js` already proves native USDC accepts the contract-account authorization.

`executeBatch(Call[] calldata calls)` matters for UX too: approve-and-act becomes one biometric ceremony instead of two.

## No seed phrase does not mean no keys

Passkeys sign; they do not encrypt. FairWins' private-market features need deterministic encryption keys, so `frontend/src/lib/passkey/prfKeys.js` uses the WebAuthn **PRF extension**: a fixed, versioned evaluation point (`fairwins.prf.salt.v1`) is fed through the authenticator's PRF, the output through HKDF-SHA256 (`info="fairwins-kek-v1"`) into a key-encryption key, which wraps a random 32-byte master seed with AES-GCM. Every controller on the account unwraps the *same* master seed, so encryption keys survive device changes. Authenticators without PRF degrade explicitly — the UI reports encryption unavailable rather than deriving silently wrong keys.

## Design decisions

- **Vendor, don't fork.** Coinbase Smart Wallet v1.1.0 is battle-tested and audited; the repo's rule of zero logic modifications means upstream audits remain meaningful. The one deviation is documented in `MultiOwnable.sol` itself: an ERC-7201 NatSpec annotation removed because tooling choked on it — a comment, not bytecode.
- **User-sovereign upgrades.** The account is UUPS-upgradeable, but `_authorizeUpgrade` is `onlyOwner`. FairWins holds no authority over deployed instances — deliberately outside the platform's `UUPSManaged` regime, and the reason this is genuinely self-custodial rather than "self-custodial."
- **`requireUV: false`.** The account checks User Present, not User Verified, at the contract layer, matching upstream. Platform authenticators enforce biometrics at the ceremony; hard-requiring UV on-chain would strand security keys that report UP only.
- **Precompile-first, fallback-always.** RIP-7212 where available, FreshCryptoLib elsewhere. Costlier on precompile-less chains, but one bytecode everywhere beats per-chain builds.
- **Gas honesty.** Spec 041 shipped with users paying their own UserOp gas (FR-015); spec 050 later superseded that with a self-hosted verifying paymaster — but the confirm UI only ever claims "sponsored" when a sponsorship was actually obtained, and the self-funded fallback keeps users never stranded.

The result: an account a user opens with a thumbprint, funds at an address that exists before the contract does, and controls through keys that no server — including ours — ever holds.

## Sources

- `specs/041-passkey-wallet-login/` — feature spec and plan
- `docs/developer-guide/passkey-accounts.md` — architecture guide
- `contracts/account/CoinbaseSmartWallet.sol`, `contracts/account/MultiOwnable.sol`, `contracts/account/CoinbaseSmartWalletFactory.sol`, `contracts/account/ERC1271.sol`
- `contracts/account/lib/webauthn-sol/WebAuthn.sol`, `contracts/account/lib/FreshCryptoLib/`
- `frontend/src/lib/passkey/smartAccount.js`, `frontend/src/lib/passkey/prfKeys.js`
- ERC-4337: <https://eips.ethereum.org/EIPS/eip-4337>
- ERC-1271: <https://eips.ethereum.org/EIPS/eip-1271>
- EIP-712: <https://eips.ethereum.org/EIPS/eip-712>
- RIP-7212 (secp256r1 precompile): <https://github.com/ethereum/RIPs/blob/master/RIPS/rip-7212.md>
- WebAuthn Level 2 (W3C): <https://www.w3.org/TR/webauthn-2/>
- Coinbase Smart Wallet: <https://github.com/coinbase/smart-wallet>
