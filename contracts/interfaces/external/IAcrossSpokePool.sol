// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/// @title IAcrossSpokePool
/// @notice Minimal local view of Across Protocol V3's SpokePool — only the deposit entry point
///         `BridgeRouter` calls. Declared locally rather than vendoring the upstream
///         across-protocol contracts package, to keep the dependency and audit surface small
///         (spec 067 plan).
///
/// @dev THE `depositor` PARAMETER IS SAFETY-CRITICAL.
///
///      Across refunds a deposit that no relayer fills by `fillDeadline` to the **`depositor`
///      address on the origin chain** (roughly 90 minutes past the deadline: ~30 min for the next
///      root-bundle proposal plus ~60 min liveness). `depositor` is an ordinary parameter and is
///      independent of `msg.sender` — which is what makes Across's own SwapAndBridge periphery
///      contract possible, and what lets `BridgeRouter` supply the tokens while the member remains
///      the refund recipient.
///
///      A wrapper that passes its own address as `depositor` therefore sends every unfilled bridge
///      into a contract with no per-member accounting and no withdrawal path. That failure is
///      silent: it only manifests on the unhappy path, in production, with real money. See
///      `specs/067-bridge-pool-liquidity/research.md` R2 and the merge-blocking fork test T038.
interface IAcrossSpokePool {
    /// @param depositor Refund recipient on THIS (origin) chain if the deposit expires unfilled.
    ///        MUST be the member, never the calling contract.
    /// @param recipient Delivery recipient on the destination chain.
    /// @param inputToken Token pulled on this chain. Pulled from `msg.sender`, not from `depositor`.
    /// @param outputToken Token delivered on `destinationChainId`.
    /// @param inputAmount Amount pulled on this chain.
    /// @param outputAmount Amount delivered on the destination. The spread between input and output
    ///        IS Across's fee (LP + relayer) — there is no separate fee argument.
    /// @param destinationChainId Target EVM chain.
    /// @param exclusiveRelayer Relayer granted first refusal, or address(0) to disable exclusivity.
    /// @param quoteTimestamp Timestamp of the quote the amounts were derived from.
    /// @param fillDeadline After this, the deposit can no longer be filled and is refunded to
    ///        `depositor` on this chain.
    /// @param exclusivityDeadline End of the exclusive-relayer window.
    /// @param message Arbitrary cross-chain message. Empty in spec 067 v1.
    function depositV3(
        address depositor,
        address recipient,
        address inputToken,
        address outputToken,
        uint256 inputAmount,
        uint256 outputAmount,
        uint256 destinationChainId,
        address exclusiveRelayer,
        uint32 quoteTimestamp,
        uint32 fillDeadline,
        uint32 exclusivityDeadline,
        bytes calldata message
    ) external payable;
}
