// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

contract Router {
    address public owner;
    uint256 public fee = 30;

    constructor() {
        owner = msg.sender;
    }

    function setFee(uint256 newFee) external {
        require(msg.sender == owner, "not owner");
        require(newFee <= 100, "fee too high");
        fee = newFee;
    }

    function run(address module, bytes calldata data) external returns (bytes memory) {
        (bool ok, bytes memory out) = module.delegatecall(data);
        require(ok, "module failed");
        return out;
    }
}
