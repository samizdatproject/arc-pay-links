// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Script, console} from "forge-std/Script.sol";
import {ArcPayLinks} from "../src/ArcPayLinks.sol";

/// Usage: run through scripts/deploy.sh, which signs with an encrypted Foundry keystore:
///   forge script script/Deploy.s.sol --rpc-url arc_testnet --keystore <file> --sender <address> --broadcast
contract Deploy is Script {
    function run() external returns (ArcPayLinks links) {
        vm.startBroadcast();
        links = new ArcPayLinks();
        vm.stopBroadcast();
        console.log("ArcPayLinks deployed at", address(links));
        console.log("chain id", block.chainid);
        console.log("block", block.number);
    }
}
