// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {MockPermit2} from "./MockPermit2.sol";

library DeployPermit2 {
    function deploy() internal returns (address) {
        return address(new MockPermit2());
    }
}
