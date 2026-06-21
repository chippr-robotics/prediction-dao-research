// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {IERC721Receiver} from "@openzeppelin/contracts/token/ERC721/IERC721Receiver.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {IMembershipManager} from "../interfaces/IMembershipManager.sol";

/// @dev The slice of MembershipVoucher this helper drives. `mint` returns the new id and credits the caller
///      (this contract); we forward each token to the recipient in the same transaction.
interface IVoucherMint {
    function mint(bytes32 role, IMembershipManager.Tier tier) external returns (uint256 id);
    function transferFrom(address from, address to, uint256 tokenId) external;
    function membershipManager() external view returns (address);
}

/// @dev The MembershipVoucher reads its payment token from the authority via this getter (returns `address`,
///      unlike IMembershipManager.paymentToken which returns IERC20).
interface IManagerPaymentToken {
    function paymentToken() external view returns (address);
}

/// @title VoucherBatchMinter
/// @notice Buy a quantity of membership vouchers in a single transaction and send them to any address — the
///         frontend "buy N" / "gift to a friend" rail (spec 026). The immutable {MembershipVoucher} only mints
///         one token, to `msg.sender`; this helper batches the loop and the gift transfer so a member needs a
///         single USDC approval and one wallet confirmation instead of one per voucher.
/// @dev    Stateless and custody-free: it pulls exactly `quantity * price` USDC from the buyer, the voucher
///         pulls that USDC back out per mint to the treasury, and every freshly minted token is forwarded to
///         `recipient` within the same call — so the contract holds no funds and no NFTs at rest. Atomic: any
///         failing mint reverts the whole batch. Immutable, no admin, no withdrawal path, minimal surface,
///         matching the voucher's own design rationale.
contract VoucherBatchMinter is ReentrancyGuard, IERC721Receiver {
    using SafeERC20 for IERC20;

    /// @notice The voucher contract this helper mints from.
    IVoucherMint public immutable voucher;
    /// @notice The membership authority (config source: tier price).
    IMembershipManager public immutable manager;
    /// @notice The USDC-like token vouchers are priced in.
    IERC20 public immutable paymentToken;

    /// @notice Upper bound on a single batch to keep gas bounded and predictable.
    uint256 public constant MAX_QUANTITY = 50;

    event BatchMinted(
        address indexed buyer,
        address indexed recipient,
        bytes32 indexed role,
        IMembershipManager.Tier tier,
        uint256 quantity,
        uint256 totalPaid,
        uint256 firstId,
        uint256 lastId
    );

    error ZeroAddress();
    error InvalidQuantity();
    error TierInactive();
    error PriceZero();

    constructor(address voucher_) {
        if (voucher_ == address(0)) revert ZeroAddress();
        voucher = IVoucherMint(voucher_);
        address mgr = IVoucherMint(voucher_).membershipManager();
        if (mgr == address(0)) revert ZeroAddress();
        manager = IMembershipManager(mgr);
        paymentToken = IERC20(IManagerPaymentToken(mgr).paymentToken());
    }

    /// @notice Mint `quantity` vouchers of `(role, tier)` and send them all to `recipient`.
    /// @param  role      Membership role hash the vouchers claim.
    /// @param  tier      Tier the vouchers are minted at (must be active).
    /// @param  quantity  How many to mint (1..{MAX_QUANTITY}).
    /// @param  recipient Who receives the vouchers (the buyer, or a giftee — must be non-zero).
    /// @return firstId   Token id of the first voucher minted.
    /// @return lastId    Token id of the last voucher minted.
    function mintBatch(bytes32 role, IMembershipManager.Tier tier, uint256 quantity, address recipient)
        external
        nonReentrant
        returns (uint256 firstId, uint256 lastId)
    {
        if (recipient == address(0)) revert ZeroAddress();
        if (quantity == 0 || quantity > MAX_QUANTITY) revert InvalidQuantity();

        // Price the batch up front so the buyer is pulled exactly once for the full amount.
        IMembershipManager.TierConfig memory cfg = manager.getTierConfig(role, tier);
        if (!cfg.active) revert TierInactive();
        if (cfg.priceUSDC == 0) revert PriceZero();
        uint256 total = uint256(cfg.priceUSDC) * quantity;

        // Effects/interactions: take the buyer's USDC, then let the voucher pull it back per mint.
        paymentToken.safeTransferFrom(msg.sender, address(this), total);
        paymentToken.forceApprove(address(voucher), total);

        for (uint256 i = 0; i < quantity; ++i) {
            uint256 id = voucher.mint(role, tier); // mints to this contract; pulls `price` USDC to the treasury
            if (i == 0) firstId = id;
            lastId = id;
            voucher.transferFrom(address(this), recipient, id);
        }

        // The mints consume the full allowance; reset defensively so nothing lingers.
        paymentToken.forceApprove(address(voucher), 0);

        emit BatchMinted(msg.sender, recipient, role, tier, quantity, total, firstId, lastId);
    }

    /// @dev Accept the vouchers minted to this contract via {ERC721-_safeMint} before they're forwarded.
    function onERC721Received(address, address, uint256, bytes calldata) external pure returns (bytes4) {
        return IERC721Receiver.onERC721Received.selector;
    }
}
