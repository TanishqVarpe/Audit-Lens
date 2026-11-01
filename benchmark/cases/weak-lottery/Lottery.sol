// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

contract Lottery {
    address[] public players;
    uint256 public constant TICKET = 0.01 ether;

    function enter() external payable {
        require(msg.value == TICKET, "wrong price");
        players.push(msg.sender);
    }

    function draw() external {
        require(players.length > 0, "no players");
        uint256 index = uint256(keccak256(abi.encodePacked(block.timestamp, block.prevrandao, players.length))) % players.length;
        address winner = players[index];
        delete players;
        (bool ok, ) = winner.call{value: address(this).balance}("");
        require(ok, "payout failed");
    }
}
