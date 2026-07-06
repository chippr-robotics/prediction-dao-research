# Contract: Client-side Vault Transaction Encoders

These are **client library contracts** (function signatures the frontend implements in `frontend/src/lib/custody/`),
not Solidity. They wrap the external Safe v1.4.1 ABIs. Addresses come from `frontend/src/config/safeContracts.js`
(canonical Safe addresses) and `getContractAddressForChain('safeProposalHub', chainId)`.

## Safe v1.4.1 ABI surface used (hand-maintained in `frontend/src/abis/`)

**`Safe`** (read): `getOwners() → address[]`, `getThreshold() → uint256`, `nonce() → uint256`,
`isOwner(address) → bool`, `VERSION() → string`, `approvedHashes(address,bytes32) → uint256`,
`getTransactionHash(address,uint256,bytes,uint8,uint256,uint256,uint256,address,address,uint256) → bytes32`.
**`Safe`** (write): `approveHash(bytes32)`,
`execTransaction(address,uint256,bytes,uint8,uint256,uint256,uint256,address,address,bytes) → bool`,
governance: `addOwnerWithThreshold(address,uint256)`, `removeOwner(address,address,uint256)`,
`swapOwner(address,address,address)`, `changeThreshold(uint256)`.
Events: `ApproveHash(bytes32,address)`, `ExecutionSuccess(bytes32,uint256)`, `ExecutionFailure(bytes32,uint256)`.

**`SafeProxyFactory`**: `createProxyWithNonce(address,bytes,uint256) → address`, event
`ProxyCreation(address,address)`. **`Safe.setup`** initializer:
`setup(address[],uint256,address,bytes,address,address,uint256,address)`.

**`MultiSendCallOnly`**: `multiSend(bytes transactions)` where each inner tx is packed
`operation(1 byte=0x00) ‖ to(20) ‖ value(32) ‖ dataLength(32) ‖ data`.

## `safeVault.js`

```
createVault({ owners, threshold, saltNonce, chainId, signer }) → { predictedAddress, tx }
    // builds Safe.setup initializer (fallbackHandler = CompatibilityFallbackHandler, payment fields 0)
    // returns predicted CREATE2 address + the createProxyWithNonce tx
loadVault(address, chainId, provider) → Vault      // reads owners/threshold/nonce/version/balances; validates Safe
readVaultState(address, chainId, provider) → Vault // refresh
```

## `vaultTransaction.js`

```
buildSafeTx({ to, value, data, operation=0, nonce }) → SafeTx
computeSafeTxHash(safeAddress, safeTx, chainId, provider) → bytes32   // via Safe.getTransactionHash
buildPrevalidatedSignatures(approverAddresses) → bytes
    // 65 bytes/owner: r = left-padded owner (32) ‖ s = 0x00*32 ‖ v = 0x01; SORTED ascending by owner address
encodeMultiSend(innerTxs[]) → { to: MultiSendCallOnly, value: 0, data, operation: 1 }
    // batch e.g. [approve(registry, stake), createWager(...)] into one Safe transaction
encodeExecTransaction(safeTx, signatures) → txRequest    // Safe.execTransaction args
// Governance helpers → SafeTx targeting the Safe itself:
buildAddOwner(newOwner, newThreshold) | buildRemoveOwner(prevOwner, owner, newThreshold)
  | buildSwapOwner(prevOwner, oldOwner, newOwner) | buildChangeThreshold(newThreshold)
```

**Rules**: `s` bytes are ignored by the Safe for `v==1`; ordering by ascending owner address is **mandatory**
(the Safe's `checkNSignatures` loop requires `currentOwner > lastOwner`). `nonce` must equal `Safe.nonce()` at
execution or the call reverts.

## `proposalHub.js`

```
emitProposal({ hub, safe, safeTx, safeTxHash, signer }) → tx     // SafeProposalHub.propose(...)
readProposals(hub, safeAddress, provider) → Proposal[]           // decode Proposed logs, recompute+verify hash
cancelProposal({ hub, safe, safeTxHash, signer }) → tx
// Fallback (never-stranded, no hub required):
encodePayloadLink(safe, safeTx, chainId) → string                // signed EIP-712 SafeTx JSON → link/QR
parsePayloadLink(link) → { safe, safeTx, chainId }               // import; client recomputes+verifies hash
```

## `submitAsActiveAccount.js`

```
submitAsActiveAccount({ to, value, data, operation, batch }, ctx) → Result
    // ctx from CustodyContext: { mode, vaultAddress, chainId, signer, provider }
    // mode==='personal' → signer.sendTransaction / existing path; returns { kind:'sent', txHash }
    // mode==='vault'    → build SafeTx (batch via MultiSendCallOnly if provided), compute hash,
    //                     emitProposal + proposer approveHash; returns { kind:'proposed', safeTxHash }
```

## Wager / Membership routing when operating as a vault

- **Create wager (vault)**: MultiSend batch `[ERC20.approve(wagerRegistry, stake), wagerRegistry.createWager(...)]`
  as one Safe transaction (`operation = 1` to `MultiSendCallOnly`). Creator becomes the Safe address.
- **Accept wager (vault)**: batch `[approve, acceptWager(id)]`; the Safe must be the named `opponent`.
- **Claim payout (vault won)**: `execTransaction` calling `wagerRegistry.claimPayout(id)` **from the Safe** —
  threshold-gated (see research Decision 7; the registry binds `msg.sender == winner`).
- **Refund (vault)**: `wagerRegistry.claimRefund(id)` — caller-agnostic; any single owner may call it directly
  (no Safe transaction, no threshold) since funds route to the recorded participant.
- **Membership / Token Mint / ClearPath / Swap (vault)**: encode the target contract call as the SafeTx `data`
  (with a preceding `approve` in a MultiSend batch where the action pulls an ERC-20).
