// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "../access/MembershipVoucher.sol";
import "../access/MembershipManager.sol";
import "../mocks/MockERC20.sol";
import "../interfaces/IMembershipManager.sol";
import {ERC1967Proxy} from "@openzeppelin/contracts/proxy/ERC1967/ERC1967Proxy.sol";

/// @title MembershipVoucherFuzzTest
/// @notice Medusa fuzz test contract for MembershipVoucher invariants (spec 026).
/// @dev    Deploys the membership proxy + immutable voucher in the constructor, mints one voucher that this
///         harness holds and never redeems, and exposes `fuzzMint*` actions Medusa can drive. Invariants hold
///         across arbitrary tx sequences.
contract MembershipVoucherFuzzTest {
    MembershipManager public membership;
    MembershipVoucher public voucher;
    MockERC20 public token;

    bytes32 public constant WAGER_PARTICIPANT_ROLE = keccak256("WAGER_PARTICIPANT_ROLE");
    address public constant TREASURY = address(0x40000);
    address public immutable deployer;

    uint256 public trackedMintPaid; // sum of mint prices paid by THIS harness (Medusa-driven via fuzzMint*)
    uint256 public heldTokenId;     // a voucher this harness holds and never redeems

    constructor() {
        deployer = address(this);

        token = new MockERC20("FuzzCoin", "FUZZ", 1e30);

        // Membership proxy (spec 027) + immutable voucher (spec 026).
        MembershipManager impl = new MembershipManager();
        bytes memory init = abi.encodeCall(MembershipManager.initialize, (deployer, address(token), TREASURY));
        membership = MembershipManager(address(new ERC1967Proxy(address(impl), init)));

        voucher = new MembershipVoucher(deployer, address(membership));
        membership.setVoucher(address(voucher));

        IMembershipManager.Limits memory limits = IMembershipManager.Limits({monthlyMarketCreation: 1000, maxConcurrentMarkets: 100});
        membership.setTier(WAGER_PARTICIPANT_ROLE, IMembershipManager.Tier.Bronze, 1e6, 30, limits, true);

        // Fund + approve so this harness can mint.
        token.approve(address(voucher), type(uint256).max);

        // Mint one voucher the harness holds and NEVER redeems (basis for the "held != membership" invariant).
        heldTokenId = voucher.mint(WAGER_PARTICIPANT_ROLE, IMembershipManager.Tier.Bronze);
        trackedMintPaid = 1e6;
    }

    // ---------- Medusa-driven actions ----------

    /// @dev Mint a Bronze voucher to the harness; tracks paid. Medusa calls this in random sequences.
    function fuzzMintBronze() public {
        uint256 priceBefore = membership.getTierConfig(WAGER_PARTICIPANT_ROLE, IMembershipManager.Tier.Bronze).priceUSDC;
        voucher.mint(WAGER_PARTICIPANT_ROLE, IMembershipManager.Tier.Bronze);
        trackedMintPaid += priceBefore;
    }

    /// @dev Try to set a royalty; cap is enforced by the contract (reverts above 5%).
    function fuzzSetRoyalty(uint96 bps) public {
        try voucher.setRoyaltyBps(bps) {} catch {}
    }

    // ================================================================
    //  PROPERTY 1: Royalty never exceeds the 5% hard ceiling
    // ================================================================
    function property_royalty_within_cap() public view returns (bool) {
        return voucher.royaltyBps() <= voucher.MAX_ROYALTY_BPS();
    }

    // ================================================================
    //  PROPERTY 2: A held (never-redeemed) voucher confers NO membership
    //  The harness holds heldTokenId and never redeems it; address(this)
    //  is never a Medusa sender, so it cannot acquire a membership.
    // ================================================================
    function property_held_voucher_confers_no_membership() public view returns (bool) {
        return voucher.ownerOf(heldTokenId) == address(this)
            && !membership.hasActiveRole(address(this), WAGER_PARTICIPANT_ROLE);
    }

    // ================================================================
    //  PROPERTY 3: Treasury balance covers all mint proceeds tracked by
    //  this harness (vouchers pay the tier price to the treasury at mint
    //  and the voucher contract never custodies funds).
    // ================================================================
    function property_treasury_covers_tracked_mints() public view returns (bool) {
        return token.balanceOf(TREASURY) >= trackedMintPaid;
    }

    // ================================================================
    //  PROPERTY 4: The voucher contract never holds payment-token balance
    //  (USDC is forwarded to the treasury within mint).
    // ================================================================
    function property_voucher_holds_no_funds() public view returns (bool) {
        return token.balanceOf(address(voucher)) == 0;
    }
}
