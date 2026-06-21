// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {ERC721} from "@openzeppelin/contracts/token/ERC721/ERC721.sol";
import {ERC2981} from "@openzeppelin/contracts/token/common/ERC2981.sol";
import {AccessControl} from "@openzeppelin/contracts/access/AccessControl.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {Strings} from "@openzeppelin/contracts/utils/Strings.sol";
import {Base64} from "@openzeppelin/contracts/utils/Base64.sol";
import {IMembershipManager} from "../interfaces/IMembershipManager.sol";
import {IMembershipVoucher} from "../interfaces/IMembershipVoucher.sol";

/// @dev Config reads from the membership authority. Declared locally (not via IMembershipManager) because the
///      authority's `paymentToken` getter returns `IERC20`, which would not match an interface `address` return
///      for inheritance conformance — but decodes fine across an external call.
interface IManagerConfig {
    function treasury() external view returns (address);
    function paymentToken() external view returns (address);
}

/// @title MembershipVoucher
/// @notice Transferable ERC-721 bearer claim on a `(role, tier)` membership (spec 026). Minted for USDC at the
///         tier's configured price (paid to the treasury at mint), it confers NO membership while held — it
///         exists to be held, gifted, or resold. Redeeming it (via {MembershipManager.redeemVoucher}) burns it
///         and writes a soulbound membership to the redeemer.
/// @dev    Intentionally **immutable** (not upgradeable): a tradable bearer asset's rules must not change after
///         purchase, and this minimizes the attack surface on a USDC-taking contract. The mutable redemption
///         logic (screening, Terms, grant) lives in the upgradeable MembershipManager.
contract MembershipVoucher is ERC721, ERC2981, AccessControl, ReentrancyGuard {
    using SafeERC20 for IERC20;

    /// @notice Best-effort EIP-2981 royalty, in basis points, capped at {MAX_ROYALTY_BPS}. Default 2.5%.
    uint96 public royaltyBps = 250;
    uint96 public constant MAX_ROYALTY_BPS = 500; // 5% hard ceiling (spec 026 FR-021a)

    /// @notice The membership authority: config source (price, treasury) and the sole redemption-burner.
    address public immutable membershipManager;

    mapping(uint256 => IMembershipVoucher.VoucherInfo) private _info;
    uint256 private _nextId;

    event VoucherMinted(
        uint256 indexed id,
        address indexed minter,
        bytes32 indexed role,
        IMembershipManager.Tier tier,
        uint32 durationDays,
        uint128 priceUSDC
    );
    event RoyaltyUpdated(uint96 bps);

    error TierInactive();
    error PriceZero();
    error NotManagerOrOwner();
    error RoyaltyTooHigh();
    error ZeroAddress();

    constructor(address admin, address membershipManager_)
        ERC721("FairWins Membership Voucher", "FWMV")
    {
        if (admin == address(0) || membershipManager_ == address(0)) revert ZeroAddress();
        membershipManager = membershipManager_;
        _grantRole(DEFAULT_ADMIN_ROLE, admin);
    }

    // ---------- Mint ----------

    /// @notice Mint a voucher for an active `(role, tier)`, paying that tier's USDC price to the treasury.
    ///         The minter is NOT sanctions-screened (spec 026 FR-014) — screening happens at redemption.
    function mint(bytes32 role, IMembershipManager.Tier tier) external nonReentrant returns (uint256 id) {
        IMembershipManager.TierConfig memory cfg = IMembershipManager(membershipManager).getTierConfig(role, tier);
        if (!cfg.active) revert TierInactive();
        if (cfg.priceUSDC == 0) revert PriceZero();

        address treasury_ = IManagerConfig(membershipManager).treasury();
        IERC20 token = IERC20(IManagerConfig(membershipManager).paymentToken());

        id = ++_nextId;
        // Snapshot at mint so the voucher is a self-contained bearer claim, immune to later config drift (D7).
        _info[id] = IMembershipVoucher.VoucherInfo({role: role, tier: tier, durationDays: cfg.durationDays});

        token.safeTransferFrom(msg.sender, treasury_, cfg.priceUSDC); // recognized at mint (no escrow — D3)
        _safeMint(msg.sender, id);

        emit VoucherMinted(id, msg.sender, role, tier, cfg.durationDays, cfg.priceUSDC);
    }

    // ---------- Burn (manager redemption or owner self-burn) ----------

    function burn(uint256 tokenId) external {
        address owner = _requireOwned(tokenId);
        if (msg.sender != membershipManager && !_isAuthorized(owner, msg.sender, tokenId)) {
            revert NotManagerOrOwner();
        }
        _burn(tokenId);
        delete _info[tokenId];
    }

    // ---------- Views ----------

    function voucherInfo(uint256 tokenId) external view returns (IMembershipVoucher.VoucherInfo memory) {
        _requireOwned(tokenId);
        return _info[tokenId];
    }

    function tokenURI(uint256 tokenId) public view override returns (string memory) {
        _requireOwned(tokenId);
        IMembershipVoucher.VoucherInfo memory info = _info[tokenId];
        string memory tierName = _tierName(info.tier);
        string memory idStr = Strings.toString(tokenId);

        string memory svg = string(abi.encodePacked(
            "<svg xmlns='http://www.w3.org/2000/svg' width='350' height='350'>",
            "<rect width='100%' height='100%' fill='#0b1020'/>",
            "<text x='24' y='56' fill='#ffffff' font-size='22' font-family='monospace'>FairWins Voucher</text>",
            "<text x='24' y='118' fill='#8ab4ff' font-size='40' font-family='monospace'>", tierName, "</text>",
            "<text x='24' y='158' fill='#9aa6b2' font-size='15' font-family='monospace'>Redeemable membership claim</text>",
            "<text x='24' y='322' fill='#556070' font-size='12' font-family='monospace'>#", idStr, "</text>",
            "</svg>"
        ));

        string memory json = string(abi.encodePacked(
            '{"name":"FairWins Membership Voucher #', idStr,
            '","description":"A transferable, redeemable claim on a FairWins ', tierName,
            ' membership. Redeem it to mint a soulbound membership. Utility access token, not an investment.",',
            '"attributes":[{"trait_type":"Tier","value":"', tierName, '"}],',
            '"image":"data:image/svg+xml;base64,', Base64.encode(bytes(svg)), '"}'
        ));

        return string(abi.encodePacked("data:application/json;base64,", Base64.encode(bytes(json))));
    }

    /// @notice EIP-2981: best-effort royalty to the current treasury. Computed dynamically so it follows a
    ///         treasury change in the authority. Not enforced on-chain (FR-021).
    function royaltyInfo(uint256, uint256 salePrice)
        public
        view
        override
        returns (address receiver, uint256 royaltyAmount)
    {
        receiver = IManagerConfig(membershipManager).treasury();
        royaltyAmount = (salePrice * royaltyBps) / 10_000;
    }

    // ---------- Admin ----------

    function setRoyaltyBps(uint96 bps) external onlyRole(DEFAULT_ADMIN_ROLE) {
        if (bps > MAX_ROYALTY_BPS) revert RoyaltyTooHigh();
        royaltyBps = bps;
        emit RoyaltyUpdated(bps);
    }

    // ---------- Internal ----------

    function _tierName(IMembershipManager.Tier tier) internal pure returns (string memory) {
        if (tier == IMembershipManager.Tier.Bronze) return "Bronze";
        if (tier == IMembershipManager.Tier.Silver) return "Silver";
        if (tier == IMembershipManager.Tier.Gold) return "Gold";
        if (tier == IMembershipManager.Tier.Platinum) return "Platinum";
        return "None";
    }

    function supportsInterface(bytes4 interfaceId)
        public
        view
        override(ERC721, ERC2981, AccessControl)
        returns (bool)
    {
        return super.supportsInterface(interfaceId);
    }
}
