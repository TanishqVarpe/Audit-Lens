// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

contract Airdrop {
    address public owner;
    address[] public recipients;

    constructor() payable {
        owner = msg.sender;
    }

    function register() external {
        recipients.push(msg.sender);
    }

    function distribute(uint256 each) external {
        require(msg.sender == owner, "not owner");
        for (uint256 i = 0; i < recipients.length; i++) {
            (bool ok, ) = recipients[i].call{value: each}("");
            require(ok, "payment failed");
        }
    }
}
