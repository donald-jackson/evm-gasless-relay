// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {Pausable} from "@openzeppelin/contracts/utils/Pausable.sol";

interface IERC3009 {
    function receiveWithAuthorization(
        address from,
        address to,
        uint256 value,
        uint256 validAfter,
        uint256 validBefore,
        bytes32 nonce,
        uint8 v,
        bytes32 r,
        bytes32 s
    ) external;
}

contract StablecoinRelay is Ownable, Pausable {
    using SafeERC20 for IERC20;

    event Relayed(
        address indexed token,
        address indexed from,
        address indexed to,
        uint256 amount,
        uint256 fee,
        address relayer
    );

    constructor() Ownable(msg.sender) {}

    /// @notice Relay a token transfer using EIP-3009 receiveWithAuthorization
    /// @dev Calls receiveWithAuthorization() to pull amount+fee into this contract,
    ///      then safeTransfer() amount to recipient and fee to relayer (msg.sender)
    function relayWithAuthorization(
        address token,
        address from,
        address to,
        uint256 amount,
        uint256 fee,
        uint256 validAfter,
        uint256 validBefore,
        bytes32 nonce,
        uint8 v,
        bytes32 r,
        bytes32 s
    ) external whenNotPaused {
        IERC3009(token).receiveWithAuthorization(from, address(this), amount + fee, validAfter, validBefore, nonce, v, r, s);

        IERC20(token).safeTransfer(to, amount);
        IERC20(token).safeTransfer(msg.sender, fee);

        emit Relayed(token, from, to, amount, fee, msg.sender);
    }

    function withdrawFees(address token, address to) external onlyOwner {
        uint256 balance = IERC20(token).balanceOf(address(this));
        IERC20(token).safeTransfer(to, balance);
    }

    function pause() external onlyOwner {
        _pause();
    }

    function unpause() external onlyOwner {
        _unpause();
    }
}
