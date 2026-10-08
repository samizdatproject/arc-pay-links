// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Script, console} from "forge-std/Script.sol";
import {ArcPayLinks} from "../src/ArcPayLinks.sol";

/// Usage (key read from the env, never passed on the command line):
///   forge script script/Deploy.s.sol --rpc-url arc_testnet --private-key "$DEPLOYER_PRIVATE_KEY" --broadcast
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
