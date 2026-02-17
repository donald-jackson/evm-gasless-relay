// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {IERC20Permit} from "@openzeppelin/contracts/token/ERC20/extensions/IERC20Permit.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {Pausable} from "@openzeppelin/contracts/utils/Pausable.sol";

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

    /// @notice Relay a token transfer using EIP-2612 permit
    /// @dev Calls permit() then transferFrom() twice: amount to recipient, fee to relayer
    function relayWithPermit(
        address token,
        address from,
        address to,
        uint256 amount,
        uint256 fee,
        uint256 deadline,
        uint8 v,
        bytes32 r,
        bytes32 s
    ) external whenNotPaused {
        IERC20Permit(token).permit(from, address(this), amount + fee, deadline, v, r, s);

        IERC20(token).safeTransferFrom(from, to, amount);
        IERC20(token).safeTransferFrom(from, msg.sender, fee);

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
