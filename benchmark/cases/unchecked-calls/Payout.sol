// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

contract Payout {
    address public owner;
    mapping(address => uint256) public owed;

    constructor() payable {
        owner = msg.sender;
    }

    function credit(address user, uint256 amount) external {
        require(msg.sender == owner, "not owner");
        owed[user] += amount;
    }

    function claim() external {
        uint256 amount = owed[msg.sender];
        owed[msg.sender] = 0;
        payable(msg.sender).send(amount);
    }

    function forward(address target, uint256 amount) external {
        require(msg.sender == owner, "not owner");
        target.call{value: amount}("");
    }
}
