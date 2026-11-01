// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

contract Points {
    mapping(address => uint256) public points;
    address public admin;

    constructor() {
        admin = msg.sender;
    }

    function grant(address user, uint256 amount) external {
        require(msg.sender == admin, "not admin");
        points[user] += amount;
    }

    function spend(uint256 amount) external {
        unchecked {
            points[msg.sender] -= amount;
        }
    }
}
