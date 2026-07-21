# Social & Image — Passkey Smart Accounts: Putting WebAuthn Signatures on an ERC-4337 Wallet

## X (Twitter)

Your phone's secure enclave signs P-256. Ethereum recovers secp256k1. No amount of UX polish fixes a curve mismatch — so we made the account a contract. ERC-4337 + WebAuthn, RIP-7212 precompile at ~3,450 gas, no seed phrase. 🔗 <link> #AccountAbstraction #passkeys #ERC4337

## LinkedIn

Most crypto onboarding still starts with "write down these twelve words." The hardware to do better has been in everyone's pocket for years — but secure enclaves sign on secp256r1 (P-256), and Ethereum EOAs only understand secp256k1. You cannot bridge that gap at the key level; you have to bridge it at the account level.

Our new engineering post walks through how FairWins ships self-custodial passkey wallets on ERC-4337 smart accounts, built on the vendored Coinbase Smart Wallet stack:

- How `MultiOwnable` treats a 64-byte P-256 public key and a 20-byte EOA as interchangeable account controllers
- Verifying full WebAuthn assertions on-chain: clientDataJSON checks, malleability guards, and the RIP-7212 precompile with a FreshCryptoLib fallback
- Deterministic counterfactual addresses and first-use deployment via ERC-4337 initCode — including a real bug from an SDK's hardwired factory address
- ERC-1271 replay-safe hashing, so one passkey owning multiple accounts can never have a signature replayed across them

Honest trade-offs included: what the on-chain verifier deliberately skips, and why account upgrades belong to users, not the platform.

Read the full post: <link>

If you are building on account abstraction — where did passkey integration bite you first: the curve, the factory, or the gas?

#AccountAbstraction #ERC4337 #WebAuthn #passkeys #web3

## Image prompt (Gemini / Nano Banana)

A clean modern editorial illustration, isometric style, for an engineering blog banner about passkey-controlled smart contract wallets. Central metaphor: a large translucent isometric vault-like cube (the smart account) standing on a circuit-board plane, its door opened not by a metal key but by a glowing fingerprint hovering in front of a smartphone; from the fingerprint, a luminous curved line (suggesting an elliptic curve) arcs into the vault and threads through a series of small geometric verification gates — hexagons and check-marked nodes — before reaching a stack of coin-like tokens inside. Secondary detail: faint mathematical curve traces and hashed-block patterns etched into the background plane. Composition: vault slightly right of center, phone and fingerprint lower left, generous negative space top left for headline overlay. Color mood: deep navy and teal base palette with a single warm amber accent reserved for the fingerprint and the signature path. Lighting: soft ambient glow with crisp rim light on the isometric edges, subtle depth haze in the background. No text, no logos, no watermarks. Aspect ratio 16:9.
