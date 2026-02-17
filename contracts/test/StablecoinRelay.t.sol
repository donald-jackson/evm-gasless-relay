// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {StablecoinRelay} from "../src/StablecoinRelay.sol";
import {MockERC20Permit} from "./mocks/MockERC20Permit.sol";

contract StablecoinRelayTest is Test {
    StablecoinRelay public relay;
    MockERC20Permit public token;

    address public owner;
    uint256 public userPrivateKey;
    address public user;
    address public recipient;
    address public relayer;

    uint256 constant INITIAL_BALANCE = 10_000e6; // 10,000 USDC (6 decimals)
    uint256 constant AMOUNT = 1_000e6; // 1,000 USDC
    uint256 constant FEE = 50e6; // 50 USDC

    function setUp() public {
        owner = address(this);
        userPrivateKey = 0xA11CE;
        user = vm.addr(userPrivateKey);
        recipient = makeAddr("recipient");
        relayer = makeAddr("relayer");

        // Deploy with a dummy permit2 address (not used in permit tests)
        relay = new StablecoinRelay(address(0));
        token = new MockERC20Permit("USD Coin", "USDC", 6);

        token.mint(user, INITIAL_BALANCE);
    }

    function test_relayWithPermit_happyPath() public {
        uint256 deadline = block.timestamp + 1 hours;
        uint256 permitAmount = AMOUNT + FEE;

        // Sign permit: user approves relay contract to spend amount + fee
        bytes32 permitHash = _getPermitHash(
            address(token),
            user,
            address(relay),
            permitAmount,
            token.nonces(user),
            deadline
        );
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(userPrivateKey, permitHash);

        // Relayer calls relayWithPermit
        vm.prank(relayer);
        relay.relayWithPermit(
            address(token),
            user,
            recipient,
            AMOUNT,
            FEE,
            deadline,
            v,
            r,
            s
        );

        // Verify balances
        assertEq(token.balanceOf(user), INITIAL_BALANCE - AMOUNT - FEE);
        assertEq(token.balanceOf(recipient), AMOUNT);
        assertEq(token.balanceOf(relayer), FEE);
        assertEq(token.balanceOf(address(relay)), 0);
    }

    function test_relayWithPermit_emitsEvent() public {
        uint256 deadline = block.timestamp + 1 hours;
        uint256 permitAmount = AMOUNT + FEE;

        bytes32 permitHash = _getPermitHash(
            address(token),
            user,
            address(relay),
            permitAmount,
            token.nonces(user),
            deadline
        );
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(userPrivateKey, permitHash);

        vm.expectEmit(true, true, true, true);
        emit StablecoinRelay.Relayed(address(token), user, recipient, AMOUNT, FEE, relayer);

        vm.prank(relayer);
        relay.relayWithPermit(
            address(token),
            user,
            recipient,
            AMOUNT,
            FEE,
            deadline,
            v,
            r,
            s
        );
    }

    function test_relayWithPermit_zeroFee() public {
        uint256 deadline = block.timestamp + 1 hours;
        uint256 fee = 0;

        bytes32 permitHash = _getPermitHash(
            address(token),
            user,
            address(relay),
            AMOUNT + fee,
            token.nonces(user),
            deadline
        );
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(userPrivateKey, permitHash);

        vm.prank(relayer);
        relay.relayWithPermit(
            address(token),
            user,
            recipient,
            AMOUNT,
            fee,
            deadline,
            v,
            r,
            s
        );

        assertEq(token.balanceOf(user), INITIAL_BALANCE - AMOUNT);
        assertEq(token.balanceOf(recipient), AMOUNT);
        assertEq(token.balanceOf(relayer), 0);
    }

    // --- Edge case tests (2.5) ---

    function test_relayWithPermit_revert_expiredDeadline() public {
        uint256 deadline = block.timestamp - 1; // already expired
        uint256 permitAmount = AMOUNT + FEE;

        bytes32 permitHash = _getPermitHash(
            address(token), user, address(relay), permitAmount, token.nonces(user), deadline
        );
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(userPrivateKey, permitHash);

        vm.prank(relayer);
        vm.expectRevert();
        relay.relayWithPermit(address(token), user, recipient, AMOUNT, FEE, deadline, v, r, s);
    }

    function test_relayWithPermit_revert_invalidSignature() public {
        uint256 deadline = block.timestamp + 1 hours;
        uint256 permitAmount = AMOUNT + FEE;

        // Sign with wrong private key
        uint256 wrongKey = 0xBEEF;
        bytes32 permitHash = _getPermitHash(
            address(token), user, address(relay), permitAmount, token.nonces(user), deadline
        );
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(wrongKey, permitHash);

        vm.prank(relayer);
        vm.expectRevert();
        relay.relayWithPermit(address(token), user, recipient, AMOUNT, FEE, deadline, v, r, s);
    }

    function test_relayWithPermit_revert_whenPaused() public {
        uint256 deadline = block.timestamp + 1 hours;
        uint256 permitAmount = AMOUNT + FEE;

        bytes32 permitHash = _getPermitHash(
            address(token), user, address(relay), permitAmount, token.nonces(user), deadline
        );
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(userPrivateKey, permitHash);

        // Owner pauses the contract
        relay.pause();

        vm.prank(relayer);
        vm.expectRevert();
        relay.relayWithPermit(address(token), user, recipient, AMOUNT, FEE, deadline, v, r, s);
    }

    function test_relayWithPermit_revert_insufficientBalance() public {
        uint256 deadline = block.timestamp + 1 hours;
        uint256 bigAmount = INITIAL_BALANCE; // amount + fee > balance
        uint256 fee = 1e6;
        uint256 permitAmount = bigAmount + fee;

        bytes32 permitHash = _getPermitHash(
            address(token), user, address(relay), permitAmount, token.nonces(user), deadline
        );
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(userPrivateKey, permitHash);

        vm.prank(relayer);
        vm.expectRevert();
        relay.relayWithPermit(address(token), user, recipient, bigAmount, fee, deadline, v, r, s);
    }

    function test_withdrawFees_onlyOwner() public {
        // Non-owner cannot withdraw
        vm.prank(relayer);
        vm.expectRevert();
        relay.withdrawFees(address(token), relayer);
    }

    function test_pause_onlyOwner() public {
        vm.prank(relayer);
        vm.expectRevert();
        relay.pause();
    }

    function test_unpause_afterPause() public {
        relay.pause();
        relay.unpause();

        // Should work after unpause
        uint256 deadline = block.timestamp + 1 hours;
        uint256 permitAmount = AMOUNT + FEE;

        bytes32 permitHash = _getPermitHash(
            address(token), user, address(relay), permitAmount, token.nonces(user), deadline
        );
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(userPrivateKey, permitHash);

        vm.prank(relayer);
        relay.relayWithPermit(address(token), user, recipient, AMOUNT, FEE, deadline, v, r, s);

        assertEq(token.balanceOf(recipient), AMOUNT);
    }

    // Helper to build the EIP-2612 permit digest
    function _getPermitHash(
        address tokenAddr,
        address ownerAddr,
        address spender,
        uint256 value,
        uint256 nonce,
        uint256 deadline
    ) internal view returns (bytes32) {
        bytes32 PERMIT_TYPEHASH = keccak256(
            "Permit(address owner,address spender,uint256 value,uint256 nonce,uint256 deadline)"
        );
        bytes32 structHash = keccak256(
            abi.encode(PERMIT_TYPEHASH, ownerAddr, spender, value, nonce, deadline)
        );
        bytes32 domainSeparator = MockERC20Permit(tokenAddr).DOMAIN_SEPARATOR();
        return keccak256(abi.encodePacked("\x19\x01", domainSeparator, structHash));
    }
}
