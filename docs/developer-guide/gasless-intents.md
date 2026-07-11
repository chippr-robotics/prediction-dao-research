# Gasless Intents (Specs 035 + 036)

FairWins users can authorize every core action with **one off-chain signature** — no separate
ERC-20 approval, no native gas token. A relayer (spec 036) submits the signed intent; the on-chain
effect is always attributed to the **signer**, never the submitter.

## Two gasless rails

FairWins has **two** distinct gasless mechanisms. They serve different account types and actions;
both keep a self-submit fallback (never-stranded).

| Rail | For | How it's gasless | Docs |
|------|-----|------------------|------|
| **Relayed intents** (specs 035 + 036) | EOAs **and** contract accounts (ERC-1271), for *contract* actions (create/accept/claim/membership/…) and EIP-3009 stablecoin transfers | The **relayer's gas wallet** submits a `…WithSig`/`…WithAuthorization` meta-tx and pays gas | *this document* |
| **Sponsored UserOps** (spec 050) | **Passkey smart accounts** (spec 041), for *account-native* UserOperations — native + USDC transfers, controller changes, first-use deploy | A FairWins-operated **verifying paymaster** reimburses the bundler from a FairWins-funded deposit; the user needs **zero** native token | [passkey-accounts.md](./passkey-accounts.md) + [runbooks/paymaster-operations.md](../runbooks/paymaster-operations.md) |

Why both: the relayer can't move a smart account's **native** token — only the EntryPoint can
execute the account — and passkey **account-native** operations (native transfer, controller
add/remove, first-use deploy) have no `…WithSig` meta-tx equivalent, so they can only travel the
ERC-4337 (paymaster + bundler) rail. (Native USDC *does* accept a contract-account ERC-7598
authorization — proven by `test/fork/usdc-erc1271-authorization.test.js` — but the ERC-7598 bytes
leg isn't yet plumbed through the relayer twins, so passkey USDC moves currently ride UserOps too;
see the passkey-accounts scope note.) The sponsored-paymaster rail is specified in
`specs/050-sponsored-paymaster/` and reuses the same relay-gateway policy engine (screening, quotas,
killswitch) to authorize each sponsorship.

## How it works

```
wallet ──sign EIP-712 intent (+ EIP-3009 payment leg)──▶ relay gateway ──calldata──▶ OZ Relayer ──tx──▶ chain
   │                                                        (policy)                  (mechanics)
   └────────────────────── self-submit fallback (user pays own gas — always available) ──────────────▶ chain
```

- **Intent leg** — an EIP-712 struct (e.g. `ClaimPayoutIntent`) signed under the verifying
  contract's domain (`FairWins WagerRegistry` / `FairWins MembershipManager`, version `1`,
  chainId + proxy address). Binds the acting address, every action parameter, a single-use random
  32-byte nonce, and a validity window.
- **Payment leg** (money-in actions only) — an EIP-3009 `ReceiveWithAuthorization` signed under the
  **stablecoin's own** domain, `to` = the consuming contract. Its nonce is stapled into the intent's
  `paymentNonce`, and the contract asserts `stakeAuth.value == signed amount` and
  `stakeAuth.nonce == paymentNonce` — a relayer can censor, but can never substitute, redirect, or
  resize a payment.
- **Fee netting** (optional, admin-toggled `setFeeNetting`) — a second, bounded authorization
  settled atomically to a segregated `gasFeeRecipient` (never the relayer hot key).

## Contract architecture: the registry facet split

`WagerRegistry`'s implementation sits against the EVM 24 KB code-size limit (24,460 of 24,576 bytes
before this feature), so the intent surface ships as a **second implementation facet**:

| Piece | Role |
|-------|------|
| `contracts/wagers/WagerRegistryCore.sol` | Abstract: THE storage layout + all internal action bodies (actor-threaded). Both facets inherit it, so layouts cannot drift. Validated by `npm run check:storage-layout`. |
| `contracts/wagers/WagerRegistry.sol` | Main facet (the UUPS implementation): every pre-existing external + a `fallback()` that delegatecalls unknown selectors to the extension. |
| `contracts/wagers/WagerRegistryIntents.sol` | Extension facet: the `…WithSig`/`…WithAuthorization` twins, `invalidateNonce(+WithSig)`, `setFeeNetting`, and the relocated cold paths `batchExpireOpen` / `autoResolveFromPolymarket` / `autoResolveFromOracle`. |
| `contracts/upgradeable/SignerIntentBase.sol` | Shared mixin: EIP-712 verify + ERC-7201-namespaced per-signer replay-nonce map + invalidation. Zero sequential storage — safe to add to live proxies. |

Callers see **one contract at the proxy address**: one ABI (merge `WagerRegistry` +
`WagerRegistryIntents` artifacts — see `test/helpers/proxy.js#mergeAbis`), one event stream, one
EIP-712 domain (under delegatecall `address(this)` is the proxy). `setIntentExtension` is gated by
`UPGRADER_ROLE` because pointing the fallback at new code is equivalent in authority to an upgrade.

`MembershipManager` (11 KB) hosts its four twins inline — no facet needed. Its EIP-712 domain is
initialized by `initializeIntents()` (`reinitializer(2)`) during the in-place upgrade.

## Twin invariant

Every covered action has two entrypoints with **identical checks and effects** against the acting
identity (`msg.sender` for self-submit, the recovered signer for intents): sanctions screen,
membership gate, ownership, freeze — all fail-closed on the signer. The self-submit path is never
removed: it is the guaranteed fallback when no relayer is reachable.

Covered: create / accept / accept-open (money-in) · claim payout / refund / declare & revoke draw /
cancel open / decline / declare winner (no-stake) · membership purchase / upgrade / extend
(money-in) · voucher redeem (no-stake).

## Replay + invalidation

- Nonces are client-generated random 32-byte values, single-use per `(contract, signer)`,
  usable out of order. State: `authorizationState(signer, nonce)`.
- Cancel an unsubmitted intent: `invalidateNonce(nonce)` (self) or
  `invalidateNonceWithSig(signer, nonce, validBefore, sig)` (relayed).
- Cancel an unsubmitted payment leg: the token's `cancelAuthorization`.

## Frontend

`frontend/src/lib/relay/` is the one client every flow uses:

- `intentTypes.js` — the EIP-712 struct definitions (MUST stay byte-identical to the contract
  typehashes) + per-contract domain builders + the FR-020 stablecoin-domain pre-sign check
  (`domainVersion` in `config/networks.js`: native USDC `'2'`, bridged `'1'`, Mordor USC `null` ⇒
  payment intents unavailable, self-submit only).
- `intentClient.js` — `signIntent` / `relayIntent` / `pollStatus` / `probeHealth` / `makeRelayer`.
  `VITE_RELAYER_URL` unset ⇒ `makeRelayer` returns null ⇒ everything self-submits.
- `useIntentAction.js` — the **never-stranded enforcement point**: relayer unset, unhealthy, 429,
  503, `payment_unsupported_on_chain`, or timeout ⇒ transparent fallback to the caller-supplied
  `selfSubmit()`. Status is honest: never `confirmed` before on-chain inclusion.
- `components/intents/IntentStatus.jsx` — WCAG 2.1 AA status renderer.

## Relayer (spec 036)

See `services/relay-gateway/README.md` (policy gateway: signer recovery, fail-closed sanctions
re-screen, dedup, quotas, kill switch, audit) and `services/oz-relayer/README.md` (submission
engine: nonce lanes, gas pricing — legacy type-0 on ETC/Mordor — inclusion tracking, KMS-held hot
key). Runbook: `docs/runbooks/relayer-operations.md`.

Spec 050 adds a second responsibility to this same gateway: a `POST /v1/paymaster` ERC-7677
endpoint that runs the identical policy pipeline (killswitch → chain → sanctions → quotas, plus a
per-op cost ceiling) and, on grant, **signs a sponsorship** for the verifying paymaster with a
KMS-held signer key (returns `paymasterAndData` rather than submitting a tx). The bundler (alto)
still submits. See [runbooks/paymaster-operations.md](../runbooks/paymaster-operations.md).

## Upgrade & rollout

```bash
npm run check:storage-layout                                            # gating
npx hardhat run scripts/deploy/upgrade-gasless-intents.js --network amoy
npm run sync:frontend-contracts:amoy
# optional: FEE_ENABLED=true FEE_RECIPIENT=0x... FEE_MAX=1000000 \
#   npx hardhat run scripts/operations/set-fee-netting.js --network amoy
```

Rollout: **Amoy** (full flow) → **Mordor** (no-stake intents only — USC lacks EIP-3009) →
**Polygon** (after the 025/027 UUPS migration; the recorded Polygon addresses predate the proxy
migration). Storage deltas: WagerRegistry `__gap` 48→45 (fee scalars ×2 + `intentExtension`),
MembershipManager `__gap` 49→47 (fee scalars ×2); the nonce map is namespaced (zero gap).
