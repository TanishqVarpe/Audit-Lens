// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/// @title VulnerableVault
/// @notice DELIBERATELY VULNERABLE. For AuditLens demos only. Do not deploy.
contract VulnerableVault {
    address public owner;
    mapping(address => uint256) public balances;
    uint256 public feeBps = 50;

    event Deposit(address indexed user, uint256 amount);
    event Withdraw(address indexed user, uint256 amount);

    constructor() {
        owner = msg.sender;
    }

    function deposit() external payable {
        require(msg.value > 0, "zero deposit");
        balances[msg.sender] += msg.value;
        emit Deposit(msg.sender, msg.value);
    }

    // BUG 1: reentrancy. ETH is sent before the balance is updated.
    function withdraw(uint256 amount) external {
        require(balances[msg.sender] >= amount, "insufficient balance");
        (bool ok, ) = msg.sender.call{value: amount}("");
        require(ok, "transfer failed");
        balances[msg.sender] -= amount;
        emit Withdraw(msg.sender, amount);
    }

    // BUG 2: tx.origin authentication. A phishing contract can act as the owner.
    function emergencyWithdraw(address payable to) external {
        require(tx.origin == owner, "not owner");
        to.transfer(address(this).balance);
    }

    // BUG 3: missing access control. Anyone can become the owner.
    function setOwner(address newOwner) external {
        owner = newOwner;
    }

    // BUG 4: unchecked return value of send().
    function payFee(address payable collector, uint256 amount) external {
        require(msg.sender == owner, "not owner");
        collector.send((amount * feeBps) / 10000);
    }

    // BUG 5: arbitrary delegatecall. The owner check can be bypassed via setOwner.
    function execute(address target, bytes calldata data) external {
        require(msg.sender == owner, "not owner");
        (bool ok, ) = target.delegatecall(data);
        require(ok, "delegatecall failed");
    }

    function totalAssets() external view returns (uint256) {
        return address(this).balance;
    }
}
