// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

contract Treasury {
    address public owner;

    modifier onlyOwner() {
        require(msg.sender == owner, "not owner");
        _;
    }

    constructor() payable {
        owner = msg.sender;
    }

    function changeOwner(address newOwner) public {
        owner = newOwner;
    }

    function pay(address payable to, uint256 amount) external onlyOwner {
        to.transfer(amount);
    }

    function close() external {
        selfdestruct(payable(msg.sender));
    }
}
