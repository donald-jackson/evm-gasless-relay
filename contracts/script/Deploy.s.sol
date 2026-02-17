// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Script, console} from "forge-std/Script.sol";
import {StablecoinRelay} from "../src/StablecoinRelay.sol";

contract DeployScript is Script {
    // Permit2 canonical address (same on all chains)
    address constant PERMIT2 = 0x000000000022D473030F116dDEE9F6B43aC78BA3;

    function run() external {
        uint256 deployerPrivateKey = vm.envUint("DEPLOYER_PRIVATE_KEY");

        vm.startBroadcast(deployerPrivateKey);

        StablecoinRelay relay = new StablecoinRelay(PERMIT2);

        vm.stopBroadcast();

        console.log("StablecoinRelay deployed to:", address(relay));
        console.log("Permit2 address:", PERMIT2);
        console.log("Owner:", relay.owner());
    }
}
