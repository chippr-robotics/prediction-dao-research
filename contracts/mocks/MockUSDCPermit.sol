// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import {ERC20Permit} from "@openzeppelin/contracts/token/ERC20/extensions/ERC20Permit.sol";
import {ECDSA} from "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";

/// @title MockUSDCPermit
/// @notice TEST-ONLY USDC double supporting both EIP-2612 `permit` (via OZ {ERC20Permit}) and EIP-3009
///         `receiveWithAuthorization` (the recommended gasless-join authorization, research.md §5/§7).
///         6 decimals like USDC. NEVER deploy in a production path (constitution III).
/// @dev    EIP-712 domain version is OZ's default "1" (the on-chain native USDC uses "2"); tests sign
///         against this mock's own domain, so the difference is immaterial here. The EIP-3009 nonce is a
///         caller-supplied random 32-byte value tracked in {authorizationState} (no replay, no ordering).
contract MockUSDCPermit is ERC20Permit {
    bytes32 public constant RECEIVE_WITH_AUTHORIZATION_TYPEHASH = keccak256(
        "ReceiveWithAuthorization(address from,address to,uint256 value,uint256 validAfter,uint256 validBefore,bytes32 nonce)"
    );

    /// @notice authorizer => nonce => used.
    mapping(address => mapping(bytes32 => bool)) public authorizationState;

    bytes32 public constant CANCEL_AUTHORIZATION_TYPEHASH =
        keccak256("CancelAuthorization(address authorizer,bytes32 nonce)");

    error AuthorizationExpired();
    error AuthorizationNotYetValid();
    error AuthorizationUsed();
    error InvalidSignature();
    error CallerNotPayee();

    event AuthorizationUsedEvent(address indexed authorizer, bytes32 indexed nonce);
    event AuthorizationCanceled(address indexed authorizer, bytes32 indexed nonce);

    constructor() ERC20("USD Coin", "USDC") ERC20Permit("USD Coin") {}

    function decimals() public pure override returns (uint8) {
        return 6;
    }

    function mint(address to, uint256 amount) external {
        _mint(to, amount);
    }

    /// @notice EIP-3009: pull `value` from `from` to the caller (`to == msg.sender`) against an off-chain
    ///         signature. Used by the gasless-join relayer path (P2).
    function receiveWithAuthorization(
        address from,
        address to,
        uint256 value,
        uint256 validAfter,
        uint256 validBefore,
        bytes32 nonce,
        uint8 v,
        bytes32 r,
        bytes32 s
    ) external {
        if (to != msg.sender) revert CallerNotPayee();
        if (block.timestamp <= validAfter) revert AuthorizationNotYetValid();
        if (block.timestamp >= validBefore) revert AuthorizationExpired();
        if (authorizationState[from][nonce]) revert AuthorizationUsed();

        bytes32 structHash = keccak256(
            abi.encode(RECEIVE_WITH_AUTHORIZATION_TYPEHASH, from, to, value, validAfter, validBefore, nonce)
        );
        address signer = ECDSA.recover(_hashTypedDataV4(structHash), v, r, s);
        if (signer != from) revert InvalidSignature();

        authorizationState[from][nonce] = true;
        emit AuthorizationUsedEvent(from, nonce);
        _transfer(from, to, value);
    }

    /// @notice EIP-3009: cancel an unused authorization so it can never be consumed (spec 035 FR-006 —
    ///         payment-leg invalidation). Anyone may submit the authorizer-signed cancellation.
    function cancelAuthorization(address authorizer, bytes32 nonce, uint8 v, bytes32 r, bytes32 s) external {
        if (authorizationState[authorizer][nonce]) revert AuthorizationUsed();

        bytes32 structHash = keccak256(abi.encode(CANCEL_AUTHORIZATION_TYPEHASH, authorizer, nonce));
        address signer = ECDSA.recover(_hashTypedDataV4(structHash), v, r, s);
        if (signer != authorizer) revert InvalidSignature();

        authorizationState[authorizer][nonce] = true;
        emit AuthorizationCanceled(authorizer, nonce);
    }
}
