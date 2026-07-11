// SPDX-License-Identifier: MIT
pragma solidity 0.8.23;

/**
 * @title MockEntryPointStake
 * @notice Test-only minimal EntryPoint deposit/stake surface for FairWinsVerifyingPaymaster unit
 *         tests (spec 050). NOT for deployment. Implements the subset the paymaster calls.
 */
contract MockEntryPointStake {
    mapping(address => uint256) public balanceOf;
    mapping(address => uint256) public stakeOf;

    function depositTo(address account) external payable {
        balanceOf[account] += msg.value;
    }

    function withdrawTo(address payable withdrawAddress, uint256 withdrawAmount) external {
        require(balanceOf[msg.sender] >= withdrawAmount, "insufficient deposit");
        balanceOf[msg.sender] -= withdrawAmount;
        (bool ok,) = withdrawAddress.call{value: withdrawAmount}("");
        require(ok, "withdraw failed");
    }

    function addStake(uint32) external payable {
        stakeOf[msg.sender] += msg.value;
    }

    function unlockStake() external {}

    function withdrawStake(address payable withdrawAddress) external {
        uint256 amount = stakeOf[msg.sender];
        stakeOf[msg.sender] = 0;
        (bool ok,) = withdrawAddress.call{value: amount}("");
        require(ok, "withdraw failed");
    }
}
