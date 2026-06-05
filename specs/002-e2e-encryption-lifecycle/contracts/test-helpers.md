# Phase 1 Contracts: new test-helper interface + per-spec assertion contracts

Builds on the 001 helpers (`mockWeb3Provider`, `connectAs`, `createAndAcceptWager`,
`createWagerViaUI`, `attemptCreateWager`, `chainTx` task, `advanceTime`,
`waitForWagerId`, `restoreGlobalState`). New/changed pieces below.

## Changed: per-account mock signing (`frontend/cypress/support/commands.js`)

`mockWeb3Provider`'s `request` handler MUST return a deterministic, **account-
specific** value for signature methods so derived encryption keys differ per
account:

```text
personal_sign / eth_sign / eth_signTypedData* :
  -> keccak256(connectedAccount + ':' + paramsDigest) expanded to a 65-byte hex
  (pure function of the account; same account → same signature → same key)
```

## New shared commands (`frontend/cypress/support/commands.js`)

```text
cy.interceptIpfs({ failFetch?: boolean })
  // cy.intercept POST **/pinJSONToIPFS -> store body under a deterministic cid,
  //   reply { IpfsHash: cid }
  // cy.intercept GET **/ipfs/* -> reply stored blob (or 500 when failFetch)
  // Call before cy.visit. Yields a handle to assert upload happened.

cy.registerEncryptionKeyViaUI()
  // From the connected wallet, drive the WalletPage register-key flow; wait until
  // the on-chain KeyRegistry reports a key for the account. Idempotent.

cy.hasRegisteredKey(address) -> Chainable<boolean>
  // Read KeyRegistry (via a chainTx 'hasKey' action) for assertions.

cy.createPrivateWagerViaUI({ opponent, stake })
  // Like createWagerViaUI but LEAVES the Private Wager toggle ON; both parties
  // must have registered keys + interceptIpfs active. Confirms the wager landed
  // (waitForWagerId) and that metadataUri is an encrypted:ipfs reference.
```

## New chainTx action (`cypress.config.js`)

```text
action 'hasKey'   -> KeyRegistry read: returns { ok, registered: boolean } for args.address
(optional) 'declareWinner' already exists; reuse for E2E-01/E2E-05 setup.
```

## Per-spec assertion contract (what "implemented" means)

- **03-encryption-chain**: assert registration status is `false` before and `true`
  after the register flow, and KeyRegistry returns a non-empty key. ≥1 assertion
  that fails on a wrong outcome (not body-visible).
- **16-privacy-encryption**: assert (a) a private wager is created with an
  `encrypted:ipfs` `metadataUri` and visible public fields; (b) a participant
  decrypts and renders details (no decrypt-error); (c) a non-participant sees
  public fields but a decrypt-error; (d) IPFS-unreachable yields a graceful retry
  error, not a hang.
- **23-lifecycle-e2e**: each of the five journeys asserts its terminal `wagerInfo`
  status/winner plus a user-visible signal; the arbitrator/challenge journey is
  absent.

## Cleanup / isolation contract

- Specs that `advanceTime` or freeze/pause MUST follow 001's isolation rules
  (`restoreGlobalState` in `afterEach`; `createWagerViaUI` keeps its far-future end
  date). The suite is validated on a fresh node.

## Out of scope

- No production changes to `encryption.js`, `ipfsService.js`, `keyRegistryService.js`,
  or any component. No real IPFS. No re-introduction of the removed dispute feature.
