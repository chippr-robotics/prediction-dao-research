# Runtime Contract: Mini-App ↔ Host (`hostApi: 1`)

The contract between a mini-app package and the FairWins host. A mini-app's entry
module (`manifest.entry`) default-exports a React component; the host mounts it inside
`MiniAppHostProvider` and passes one frozen `host` prop (also exposed via
`useMiniAppHost()` from the SDK shared scope). Everything below is the **entire**
privileged surface — anything not listed is unreachable by design (FR-013).

## Shared module scope (build-time)

`globalThis[Symbol.for('fairwins.miniapp.host')]` (frozen) provides singleton
`react`, `react-dom`, `react/jsx-runtime`, `ethers`, and `@fairwins/miniapp-sdk`.
The `tools/miniapp-build/` preset externalizes these bare imports to scope reads —
packages ship none of them. `manifest.hostApi` must be ≤ the host's supported version
or launch is refused.

## `host` context object

```ts
{
  appId: string,                       // registry-derived identity; namespace root
  wallet: {
    address: string | null,            // active identity (personal / vault / legacy per useActiveAccount)
    connectedAddress: string | null,
    chainId: number | null,
    isConnected: boolean,
    submit(payload: { to, data?, value?, chainId }): Promise<SubmitResult>,
    //  - routes through the active account (signer / passkey UserOp / Safe proposal / legacy key)
    //  - host auto-audits every call (miniapp_tx_submitted)
    //  - rejects when wallet absent or wrong network, with a typed error the app must surface
    //  - RESOLVES AT BROADCAST, NOT CONFIRMATION — see "Submission is not confirmation"
    requestConnect(): void             // opens the host connect modal
  },
  readProvider(chainId?: number): Provider,   // spec-069-resolved read provider; default = wallet chain
  store: {                             // namespaced to appId; cross-namespace access impossible
    get(key: string): any,
    set(key: string, value: any): void,        // host auto-audits significant changes
    subscribe(listener): () => void
  },
  audit: { log(kind: string, refs?: object): void },  // app-contextual entries (miniapp_app_logged)
  toast: { show(message: string, type?: 'info'|'success'|'error'|'warning'): void },
  navigate(to: string): void           // in-app paths only; external URLs refused
}
```

## Submission is not confirmation

`submit` resolves as soon as the transaction is **broadcast**. `kind: 'sent'` means the
network accepted it, not that it mined, and not that it succeeded — it may still revert.
`kind: 'proposed'` means nothing has moved at all: a vault action is waiting for its
threshold, and there is no transaction hash yet.

An app that awaits `submit` and then tells the member the action is done **is lying**, and
`SubmitResult` deliberately carries no receipt to make that easy. To report confirmation,
wait for it yourself:

```js
const { kind, txHash } = await host.wallet.submit({ to, data, chainId })
if (kind === 'proposed') return showQueuedForVaultApproval()
const receipt = await host.readProvider(chainId).waitForTransaction(txHash)
if (receipt?.status !== 1) return showFailed()
```

Two caveats to design for rather than hide. The read provider is a **different endpoint**
than the one the wallet broadcast through, so "not visible yet" and "not mined yet" are
indistinguishable — impose your own timeout and say *still pending*, never spin forever.
And `waitForTransaction` does not follow a wallet-side speed-up or cancel the way a
`TransactionResponse.wait()` would.

## The two write rails (why an app must not branch on the wallet)

FairWins has two transaction rails. A classic wallet signs through an ethers signer; a
**passkey smart account** (specs 041/050) has **no signer at all** and writes through an
ERC-4337 UserOp batch. `submit` chooses between them, and that choice is the host's alone —
`sendCalls` and `loginMethod` are deliberately absent from the `host` object, so a mini-app
has nothing to branch on and needs nothing.

Precedence is by **identity first, rail second**: a passkey member acting as a Safe vault
still gets a vault *proposal*, not a UserOp from their own account.

On the passkey rail `txHash` may be a UserOp hash or an intent id rather than a transaction
hash, taken in decreasing order of finality. It is never fabricated: if the rail returns no
identifier, `txHash` is `null`.

## Host obligations

- Verify status + integrity before import (approved tuple only); contain app failures
  in an error boundary; inject `manifest.styles` scoped under the app's workspace root;
  tolerate unmount/remount (store survives); auto-audit launch, tx submit, integrity
  failure, and state changes.

## Mini-app obligations

- Default-export a mountable React component; use only the `host` object + shared scope
  for privileged behavior (bundled pure libraries are fine); style via the package's own
  scoped stylesheet(s) (CSS modules recommended; no global selectors); remain functional
  after remount; surface transaction errors through `host.toast`.

## Refusal semantics (professional, specific messages)

| Condition | Host behavior |
|---|---|
| Status ≠ Approved at launch | Refuse; catalog entry updates |
| Manifest keccak mismatch | Refuse, audit `miniapp_integrity_failed`, discard bytes |
| File sha256 mismatch | Same as above |
| Unknown `schema` / unsupported `hostApi` | Refuse with version message |
| Registry unreachable | Refuse launch; "verification unavailable" disclosure |
| All gateways unreachable | Availability message; retry affordance |
| Wallet absent / wrong network on `submit` | Typed rejection; host directs user |
| Session offers no write rail (no signer, no `sendCalls`) | Typed rejection `no_write_rail` — distinct from "no wallet" and from "locked" |
```
