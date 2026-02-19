// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {StablecoinRelay} from "../src/StablecoinRelay.sol";
import {MockERC3009} from "./mocks/MockERC3009.sol";

contract StablecoinRelayTest is Test {
    StablecoinRelay public relay;
    MockERC3009 public token;

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

        relay = new StablecoinRelay();
        token = new MockERC3009("USD Coin", "USDC", 6);

        token.mint(user, INITIAL_BALANCE);
    }

    // --- Core helpers ---

    function _randomNonce(uint256 seed) internal pure returns (bytes32) {
        return keccak256(abi.encode("test-nonce", seed));
    }

    struct AuthParams {
        uint256 validAfter;
        uint256 validBefore;
        bytes32 nonce;
        uint8 v;
        bytes32 r;
        bytes32 s;
    }

    function _signAuth(uint256 value, uint256 validAfter, uint256 validBefore, bytes32 nonce)
        internal
        view
        returns (AuthParams memory)
    {
        bytes32 digest = _getReceiveAuthorizationHash(
            address(token), user, address(relay), value, validAfter, validBefore, nonce
        );
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(userPrivateKey, digest);
        return AuthParams(validAfter, validBefore, nonce, v, r, s);
    }

    function _signAuthWrongKey(uint256 value, uint256 validAfter, uint256 validBefore, bytes32 nonce, uint256 wrongKey)
        internal
        view
        returns (AuthParams memory)
    {
        bytes32 digest = _getReceiveAuthorizationHash(
            address(token), user, address(relay), value, validAfter, validBefore, nonce
        );
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(wrongKey, digest);
        return AuthParams(validAfter, validBefore, nonce, v, r, s);
    }

    function _doRelay(uint256 amount, uint256 fee, AuthParams memory p) internal {
        relay.relayWithAuthorization(
            address(token), user, recipient, amount, fee,
            p.validAfter, p.validBefore, p.nonce, p.v, p.r, p.s
        );
    }

    /// @dev Build the EIP-712 digest for ReceiveWithAuthorization
    function _getReceiveAuthorizationHash(
        address tokenAddr,
        address from,
        address to,
        uint256 value,
        uint256 validAfter,
        uint256 validBefore,
        bytes32 nonce
    ) internal view returns (bytes32) {
        bytes32 RECEIVE_TYPEHASH = keccak256(
            "ReceiveWithAuthorization(address from,address to,uint256 value,uint256 validAfter,uint256 validBefore,bytes32 nonce)"
        );
        bytes32 structHash = keccak256(
            abi.encode(RECEIVE_TYPEHASH, from, to, value, validAfter, validBefore, nonce)
        );
        bytes32 domainSeparator = MockERC3009(tokenAddr).DOMAIN_SEPARATOR();
        return keccak256(abi.encodePacked("\x19\x01", domainSeparator, structHash));
    }

    // --- Tests ---

    function test_relayWithAuthorization_happyPath() public {
        AuthParams memory p = _signAuth(AMOUNT + FEE, 0, block.timestamp + 1 hours, _randomNonce(1));

        vm.prank(relayer);
        _doRelay(AMOUNT, FEE, p);

        assertEq(token.balanceOf(user), INITIAL_BALANCE - AMOUNT - FEE);
        assertEq(token.balanceOf(recipient), AMOUNT);
        assertEq(token.balanceOf(relayer), FEE);
        assertEq(token.balanceOf(address(relay)), 0);
    }

    function test_relayWithAuthorization_emitsEvent() public {
        AuthParams memory p = _signAuth(AMOUNT + FEE, 0, block.timestamp + 1 hours, _randomNonce(2));

        vm.expectEmit(true, true, true, true);
        emit StablecoinRelay.Relayed(address(token), user, recipient, AMOUNT, FEE, relayer);

        vm.prank(relayer);
        _doRelay(AMOUNT, FEE, p);
    }

    function test_relayWithAuthorization_zeroFee() public {
        AuthParams memory p = _signAuth(AMOUNT, 0, block.timestamp + 1 hours, _randomNonce(3));

        vm.prank(relayer);
        _doRelay(AMOUNT, 0, p);

        assertEq(token.balanceOf(user), INITIAL_BALANCE - AMOUNT);
        assertEq(token.balanceOf(recipient), AMOUNT);
        assertEq(token.balanceOf(relayer), 0);
    }

    function test_revert_validBeforeInPast() public {
        AuthParams memory p = _signAuth(AMOUNT + FEE, 0, block.timestamp - 1, _randomNonce(4));

        vm.prank(relayer);
        vm.expectRevert("ERC3009: authorization expired");
        _doRelay(AMOUNT, FEE, p);
    }

    function test_revert_nonceAlreadyUsed() public {
        bytes32 nonce = _randomNonce(5);
        AuthParams memory p = _signAuth(AMOUNT + FEE, 0, block.timestamp + 1 hours, nonce);

        // First relay succeeds
        vm.prank(relayer);
        _doRelay(AMOUNT, FEE, p);

        // Mint more tokens so balance isn't the issue
        token.mint(user, AMOUNT + FEE);

        // Second relay with same nonce reverts
        vm.prank(relayer);
        vm.expectRevert("ERC3009: authorization already used");
        _doRelay(AMOUNT, FEE, p);
    }

    function test_revert_invalidSignature() public {
        AuthParams memory p = _signAuthWrongKey(AMOUNT + FEE, 0, block.timestamp + 1 hours, _randomNonce(6), 0xBEEF);

        vm.prank(relayer);
        vm.expectRevert("ERC3009: invalid signature");
        _doRelay(AMOUNT, FEE, p);
    }

    function test_revert_whenPaused() public {
        AuthParams memory p = _signAuth(AMOUNT + FEE, 0, block.timestamp + 1 hours, _randomNonce(7));

        relay.pause();

        vm.prank(relayer);
        vm.expectRevert();
        _doRelay(AMOUNT, FEE, p);
    }

    function test_revert_insufficientBalance() public {
        uint256 bigAmount = INITIAL_BALANCE;
        uint256 fee = 1e6;
        AuthParams memory p = _signAuth(bigAmount + fee, 0, block.timestamp + 1 hours, _randomNonce(8));

        vm.prank(relayer);
        vm.expectRevert();
        _doRelay(bigAmount, fee, p);
    }

    function test_withdrawFees_onlyOwner() public {
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

        AuthParams memory p = _signAuth(AMOUNT + FEE, 0, block.timestamp + 1 hours, _randomNonce(9));

        vm.prank(relayer);
        _doRelay(AMOUNT, FEE, p);

        assertEq(token.balanceOf(recipient), AMOUNT);
    }
}
