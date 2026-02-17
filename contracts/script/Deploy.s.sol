// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Script, console} from "forge-std/Script.sol";
import {StablecoinRelay} from "../src/StablecoinRelay.sol";

contract DeployScript is Script {
    function run() external {
        uint256 deployerPrivateKey = vm.envUint("DEPLOYER_PRIVATE_KEY");

        vm.startBroadcast(deployerPrivateKey);

        StablecoinRelay relay = new StablecoinRelay();

        vm.stopBroadcast();

        console.log("StablecoinRelay deployed to:", address(relay));
        console.log("Owner:", relay.owner());
    }
}
