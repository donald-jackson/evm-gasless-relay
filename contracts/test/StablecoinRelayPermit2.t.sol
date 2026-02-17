// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {StablecoinRelay} from "../src/StablecoinRelay.sol";
import {MockERC20Permit} from "./mocks/MockERC20Permit.sol";
import {ISignatureTransfer} from "permit2/src/interfaces/ISignatureTransfer.sol";
import {DeployPermit2} from "./mocks/DeployPermit2.sol";

contract StablecoinRelayPermit2Test is Test {
    StablecoinRelay public relay;
    MockERC20Permit public token;
    address public permit2;

    uint256 public userPrivateKey;
    address public user;
    address public recipient;
    address public relayer;

    uint256 constant INITIAL_BALANCE = 10_000e6;
    uint256 constant AMOUNT = 1_000e6;
    uint256 constant FEE = 50e6;

    bytes32 constant TOKEN_PERMISSIONS_TYPEHASH = keccak256("TokenPermissions(address token,uint256 amount)");
    bytes32 constant PERMIT_TRANSFER_FROM_TYPEHASH = keccak256(
        "PermitTransferFrom(TokenPermissions permitted,address spender,uint256 nonce,uint256 deadline)TokenPermissions(address token,uint256 amount)"
    );

    function setUp() public {
        userPrivateKey = 0xA11CE;
        user = vm.addr(userPrivateKey);
        recipient = makeAddr("recipient");
        relayer = makeAddr("relayer");

        // Deploy actual Permit2
        permit2 = DeployPermit2.deploy();

        relay = new StablecoinRelay(permit2);
        token = new MockERC20Permit("USD Coin", "USDC", 6);

        token.mint(user, INITIAL_BALANCE);

        // User must approve Permit2 contract to spend their tokens
        vm.prank(user);
        token.approve(permit2, type(uint256).max);
    }

    function test_relayWithPermit2_happyPath() public {
        uint256 deadline = block.timestamp + 1 hours;
        uint256 nonce = 0;
        uint256 totalAmount = AMOUNT + FEE;

        bytes memory signature = _signPermit2(
            address(token), totalAmount, nonce, deadline, address(relay)
        );

        vm.prank(relayer);
        relay.relayWithPermit2(
            address(token), user, recipient, AMOUNT, FEE, nonce, deadline, signature
        );

        assertEq(token.balanceOf(user), INITIAL_BALANCE - AMOUNT - FEE);
        assertEq(token.balanceOf(recipient), AMOUNT);
        assertEq(token.balanceOf(relayer), FEE);
    }

    function test_relayWithPermit2_emitsEvent() public {
        uint256 deadline = block.timestamp + 1 hours;
        uint256 nonce = 0;

        bytes memory signature = _signPermit2(
            address(token), AMOUNT + FEE, nonce, deadline, address(relay)
        );

        vm.expectEmit(true, true, true, true);
        emit StablecoinRelay.Relayed(address(token), user, recipient, AMOUNT, FEE, relayer);

        vm.prank(relayer);
        relay.relayWithPermit2(
            address(token), user, recipient, AMOUNT, FEE, nonce, deadline, signature
        );
    }

    function test_relayWithPermit2_revert_expiredDeadline() public {
        uint256 deadline = block.timestamp - 1;
        uint256 nonce = 0;

        bytes memory signature = _signPermit2(
            address(token), AMOUNT + FEE, nonce, deadline, address(relay)
        );

        vm.prank(relayer);
        vm.expectRevert();
        relay.relayWithPermit2(
            address(token), user, recipient, AMOUNT, FEE, nonce, deadline, signature
        );
    }

    function test_relayWithPermit2_revert_invalidSignature() public {
        uint256 deadline = block.timestamp + 1 hours;
        uint256 nonce = 0;

        // Sign with wrong key
        uint256 wrongKey = 0xBEEF;
        bytes32 digest = _getPermit2Digest(
            address(token), AMOUNT + FEE, nonce, deadline, address(relay)
        );
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(wrongKey, digest);

        vm.prank(relayer);
        vm.expectRevert();
        relay.relayWithPermit2(
            address(token), user, recipient, AMOUNT, FEE, nonce, deadline, abi.encodePacked(r, s, v)
        );
    }

    function test_relayWithPermit2_revert_nonceReplay() public {
        uint256 deadline = block.timestamp + 1 hours;
        uint256 nonce = 0;

        bytes memory signature = _signPermit2(
            address(token), AMOUNT + FEE, nonce, deadline, address(relay)
        );

        vm.prank(relayer);
        relay.relayWithPermit2(
            address(token), user, recipient, AMOUNT, FEE, nonce, deadline, signature
        );

        // Replay same nonce should fail
        bytes memory signature2 = _signPermit2(
            address(token), AMOUNT + FEE, nonce, deadline, address(relay)
        );

        vm.prank(relayer);
        vm.expectRevert();
        relay.relayWithPermit2(
            address(token), user, recipient, AMOUNT, FEE, nonce, deadline, signature2
        );
    }

    // --- Helpers ---

    function _signPermit2(
        address tokenAddr,
        uint256 amount,
        uint256 nonce,
        uint256 deadline,
        address spender
    ) internal view returns (bytes memory) {
        bytes32 digest = _getPermit2Digest(tokenAddr, amount, nonce, deadline, spender);
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(userPrivateKey, digest);
        return abi.encodePacked(r, s, v);
    }

    function _getPermit2Digest(
        address tokenAddr,
        uint256 amount,
        uint256 nonce,
        uint256 deadline,
        address spender
    ) internal view returns (bytes32) {
        bytes32 tokenPermissions = keccak256(abi.encode(TOKEN_PERMISSIONS_TYPEHASH, tokenAddr, amount));
        bytes32 structHash = keccak256(
            abi.encode(PERMIT_TRANSFER_FROM_TYPEHASH, tokenPermissions, spender, nonce, deadline)
        );
        bytes32 domainSeparator = ISignatureTransfer(permit2).DOMAIN_SEPARATOR();
        return keccak256(abi.encodePacked("\x19\x01", domainSeparator, structHash));
    }
}
