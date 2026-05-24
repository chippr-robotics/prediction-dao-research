// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "../access/MembershipManager.sol";
import "../mocks/MockERC20.sol";
import "../interfaces/IMembershipManager.sol";

/// @title MembershipManagerFuzzTest
/// @notice Medusa fuzz test contract for MembershipManager invariants.
contract MembershipManagerFuzzTest {
    MembershipManager public membership;
    MockERC20 public token;

    bytes32 public constant WAGER_PARTICIPANT_ROLE = keccak256("WAGER_PARTICIPANT_ROLE");
    address public constant TREASURY = address(0x40000);
    address public constant USER_A = address(0x10000);
    address public constant USER_B = address(0x20000);

    address public immutable deployer;

    // Track total payments sent to the contract
    uint256 public totalPayments;

    constructor() {
        deployer = address(this);

        token = new MockERC20("FuzzCoin", "FUZZ", 1e30);
        membership = new MembershipManager(deployer, address(token), TREASURY);

        // Configure all four tiers with increasing prices
        IMembershipManager.Limits memory bronzeLimits = IMembershipManager.Limits({
            monthlyMarketCreation: 5,
            maxConcurrentMarkets: 2
        });
        IMembershipManager.Limits memory silverLimits = IMembershipManager.Limits({
            monthlyMarketCreation: 20,
            maxConcurrentMarkets: 5
        });
        IMembershipManager.Limits memory goldLimits = IMembershipManager.Limits({
            monthlyMarketCreation: 50,
            maxConcurrentMarkets: 15
        });
        IMembershipManager.Limits memory platLimits = IMembershipManager.Limits({
            monthlyMarketCreation: 200,
            maxConcurrentMarkets: 50
        });

        membership.setTier(WAGER_PARTICIPANT_ROLE, IMembershipManager.Tier.Bronze,   50e6,  30, bronzeLimits, true);
        membership.setTier(WAGER_PARTICIPANT_ROLE, IMembershipManager.Tier.Silver,  100e6,  30, silverLimits, true);
        membership.setTier(WAGER_PARTICIPANT_ROLE, IMembershipManager.Tier.Gold,    200e6,  30, goldLimits,   true);
        membership.setTier(WAGER_PARTICIPANT_ROLE, IMembershipManager.Tier.Platinum, 500e6, 30, platLimits,   true);

        // Fund test users and approve
        token.mint(USER_A, 1e30);
        token.mint(USER_B, 1e30);

        totalPayments = 0;
    }

    // ================================================================
    //  PROPERTY 1: Tier IDs are bounded (None=0, Bronze=1..Platinum=4)
    //  Any membership's tier must be in [0..4].
    // ================================================================

    function property_tier_ids_bounded() public view returns (bool) {
        address[3] memory users = [USER_A, USER_B, deployer];
        for (uint8 i = 0; i < 3; i++) {
            IMembershipManager.Membership memory m = membership.getMembership(users[i], WAGER_PARTICIPANT_ROLE);
            uint8 t = uint8(m.tier);
            // tier must be 0 (None) or 1-4 (Bronze-Platinum)
            if (t > 4) return false;
        }
        return true;
    }

    // ================================================================
    //  PROPERTY 2: Active membership expiry is in the future
    //  If hasActiveRole returns true, then expiresAt > block.timestamp.
    // ================================================================

    function property_active_membership_expiry_future() public view returns (bool) {
        address[3] memory users = [USER_A, USER_B, deployer];
        for (uint8 i = 0; i < 3; i++) {
            address user = users[i];
            IMembershipManager.Membership memory m = membership.getMembership(user, WAGER_PARTICIPANT_ROLE);
            if (m.tier != IMembershipManager.Tier.None && membership.hasActiveRole(user, WAGER_PARTICIPANT_ROLE)) {
                if (m.expiresAt <= block.timestamp) return false;
            }
        }
        return true;
    }

    // ================================================================
    //  PROPERTY 3: Upgrade only increases tier, never decreases
    //  We test this by attempting downgrades from Gold and verifying
    //  they revert with NotUpgrade.
    // ================================================================

    function property_upgrade_never_decreases() public returns (bool) {
        // Grant deployer a Gold membership
        membership.grantMembership(deployer, WAGER_PARTICIPANT_ROLE, IMembershipManager.Tier.Gold, 30);

        // Attempting to "upgrade" to Bronze (lower price) should revert
        token.approve(address(membership), type(uint256).max);
        try membership.upgradeTier(WAGER_PARTICIPANT_ROLE, IMembershipManager.Tier.Bronze) {
            return false; // Should have reverted
        } catch {
            // Expected: NotUpgrade revert
        }

        // Attempting to "upgrade" to Silver (still lower price) should also revert
        try membership.upgradeTier(WAGER_PARTICIPANT_ROLE, IMembershipManager.Tier.Silver) {
            return false;
        } catch {
            // Expected: NotUpgrade revert
        }

        return true;
    }

    // ================================================================
    //  PROPERTY 4: Monthly and concurrent limits match tier config
    //  The tier config's limits must be what was set during construction.
    // ================================================================

    function property_limits_match_tier_config() public view returns (bool) {
        IMembershipManager.TierConfig memory bronze = membership.getTierConfig(WAGER_PARTICIPANT_ROLE, IMembershipManager.Tier.Bronze);
        IMembershipManager.TierConfig memory silver = membership.getTierConfig(WAGER_PARTICIPANT_ROLE, IMembershipManager.Tier.Silver);
        IMembershipManager.TierConfig memory gold   = membership.getTierConfig(WAGER_PARTICIPANT_ROLE, IMembershipManager.Tier.Gold);
        IMembershipManager.TierConfig memory plat   = membership.getTierConfig(WAGER_PARTICIPANT_ROLE, IMembershipManager.Tier.Platinum);

        // Bronze: 5 monthly, 2 concurrent
        if (bronze.limits.monthlyMarketCreation != 5) return false;
        if (bronze.limits.maxConcurrentMarkets != 2) return false;

        // Silver: 20 monthly, 5 concurrent
        if (silver.limits.monthlyMarketCreation != 20) return false;
        if (silver.limits.maxConcurrentMarkets != 5) return false;

        // Gold: 50 monthly, 15 concurrent
        if (gold.limits.monthlyMarketCreation != 50) return false;
        if (gold.limits.maxConcurrentMarkets != 15) return false;

        // Platinum: 200 monthly, 50 concurrent
        if (plat.limits.monthlyMarketCreation != 200) return false;
        if (plat.limits.maxConcurrentMarkets != 50) return false;

        return true;
    }

    // ================================================================
    //  PROPERTY 5: Accrued fees never exceed contract's token balance
    //  The accruedFees counter tracks payments in, minus withdrawals.
    //  It must never exceed the actual token balance held.
    // ================================================================

    function property_accrued_fees_within_balance() public view returns (bool) {
        uint256 balance = token.balanceOf(address(membership));
        uint128 fees = membership.accruedFees();
        return fees <= balance;
    }

    // ================================================================
    //  PROPERTY 6: Non-admin cannot configure tiers or withdraw
    //  USER_A and USER_B must not have DEFAULT_ADMIN_ROLE.
    // ================================================================

    function property_non_admin_cannot_configure() public view returns (bool) {
        bytes32 adminRole = membership.DEFAULT_ADMIN_ROLE();

        // Deployer must be admin
        if (!membership.hasRole(adminRole, deployer)) return false;

        // USER_A and USER_B must NOT be admin
        if (membership.hasRole(adminRole, USER_A)) return false;
        if (membership.hasRole(adminRole, USER_B)) return false;

        return true;
    }

    // ================================================================
    //  PROPERTY 7: Tier prices are monotonically increasing
    //  Bronze < Silver < Gold < Platinum
    // ================================================================

    function property_tier_prices_increase() public view returns (bool) {
        IMembershipManager.TierConfig memory bronze = membership.getTierConfig(WAGER_PARTICIPANT_ROLE, IMembershipManager.Tier.Bronze);
        IMembershipManager.TierConfig memory silver = membership.getTierConfig(WAGER_PARTICIPANT_ROLE, IMembershipManager.Tier.Silver);
        IMembershipManager.TierConfig memory gold   = membership.getTierConfig(WAGER_PARTICIPANT_ROLE, IMembershipManager.Tier.Gold);
        IMembershipManager.TierConfig memory plat   = membership.getTierConfig(WAGER_PARTICIPANT_ROLE, IMembershipManager.Tier.Platinum);

        return bronze.priceUSDC < silver.priceUSDC
            && silver.priceUSDC < gold.priceUSDC
            && gold.priceUSDC < plat.priceUSDC;
    }

    // ================================================================
    //  PROPERTY 8: grantMembership by admin always results in active membership
    // ================================================================

    function property_grant_produces_active_membership() public returns (bool) {
        membership.grantMembership(USER_A, WAGER_PARTICIPANT_ROLE, IMembershipManager.Tier.Silver, 30);
        bool active = membership.hasActiveRole(USER_A, WAGER_PARTICIPANT_ROLE);
        IMembershipManager.Tier tier = membership.getActiveTier(USER_A, WAGER_PARTICIPANT_ROLE);
        return active && tier == IMembershipManager.Tier.Silver;
    }

    // ================================================================
    //  PROPERTY 9: Limits increase with tier level
    //  Higher tiers must have >= limits than lower tiers.
    // ================================================================

    function property_limits_increase_with_tier() public view returns (bool) {
        IMembershipManager.TierConfig memory bronze = membership.getTierConfig(WAGER_PARTICIPANT_ROLE, IMembershipManager.Tier.Bronze);
        IMembershipManager.TierConfig memory silver = membership.getTierConfig(WAGER_PARTICIPANT_ROLE, IMembershipManager.Tier.Silver);
        IMembershipManager.TierConfig memory gold   = membership.getTierConfig(WAGER_PARTICIPANT_ROLE, IMembershipManager.Tier.Gold);
        IMembershipManager.TierConfig memory plat   = membership.getTierConfig(WAGER_PARTICIPANT_ROLE, IMembershipManager.Tier.Platinum);

        // Monthly creation limits must increase
        if (bronze.limits.monthlyMarketCreation > silver.limits.monthlyMarketCreation) return false;
        if (silver.limits.monthlyMarketCreation > gold.limits.monthlyMarketCreation) return false;
        if (gold.limits.monthlyMarketCreation > plat.limits.monthlyMarketCreation) return false;

        // Concurrent market limits must increase
        if (bronze.limits.maxConcurrentMarkets > silver.limits.maxConcurrentMarkets) return false;
        if (silver.limits.maxConcurrentMarkets > gold.limits.maxConcurrentMarkets) return false;
        if (gold.limits.maxConcurrentMarkets > plat.limits.maxConcurrentMarkets) return false;

        return true;
    }
}
