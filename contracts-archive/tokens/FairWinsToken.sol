// SPDX-License-Identifier: Apache-2.0
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "@openzeppelin/contracts/token/ERC20/extensions/ERC20Burnable.sol";
import "@openzeppelin/contracts/token/ERC20/extensions/ERC20Permit.sol";
import "@openzeppelin/contracts/token/ERC20/extensions/ERC20Votes.sol";
import "@openzeppelin/contracts/access/Ownable.sol";

/**
 * @title FairWinsToken
 * @notice Governance token for FairWins DAO with voting capabilities
 * @dev ERC20 token with:
 *   - ERC20Votes for on-chain governance voting power
 *   - ERC20Permit for gasless approvals (EIP-2612)
 *   - ERC20Burnable for deflationary mechanisms
 *   - Ownable for minting control
 * 
 * Token is used for:
 *   - Governance voting in FutarchyGovernor
 *   - Ragequit redemptions from TreasuryVault
 *   - Proposal creation thresholds
 */
contract FairWinsToken is ERC20, ERC20Burnable, ERC20Permit, ERC20Votes, Ownable {
    
    /// @notice Maximum supply cap (100 million tokens with 18 decimals)
    uint256 public constant MAX_SUPPLY = 100_000_000 * 10**18;
    
    /// @notice Initial supply minted to deployer (10 million tokens)
    uint256 public constant INITIAL_SUPPLY = 10_000_000 * 10**18;

    /// @notice Emitted when tokens are minted
    event TokensMinted(address indexed to, uint256 amount);

    /**
     * @notice Constructor deploys the governance token
     * @param initialOwner Address that will own the token contract and receive initial supply
     */
    constructor(address initialOwner) 
        ERC20("FairWins Governance Token", "FWGT")
        ERC20Permit("FairWins Governance Token")
        Ownable(initialOwner)
    {
        require(initialOwner != address(0), "Invalid owner");
        _mint(initialOwner, INITIAL_SUPPLY);
        emit TokensMinted(initialOwner, INITIAL_SUPPLY);
    }

    /**
     * @notice Mint new tokens (only owner)
     * @param to Address to receive the minted tokens
     * @param amount Amount of tokens to mint
     * @dev Reverts if minting would exceed MAX_SUPPLY
     */
    function mint(address to, uint256 amount) external onlyOwner {
        require(to != address(0), "Cannot mint to zero address");
        require(totalSupply() + amount <= MAX_SUPPLY, "Exceeds max supply");
        _mint(to, amount);
        emit TokensMinted(to, amount);
    }

    /**
     * @notice Get the current voting power of an account
     * @param account Address to check
     * @return Current voting power (after delegation)
     */
    function votingPower(address account) external view returns (uint256) {
        return getVotes(account);
    }

    // ========== Required Overrides ==========

    function _update(address from, address to, uint256 value)
        internal
        override(ERC20, ERC20Votes)
    {
        super._update(from, to, value);
    }

    function nonces(address owner)
        public
        view
        override(ERC20Permit, Nonces)
        returns (uint256)
    {
        return super.nonces(owner);
    }
}
