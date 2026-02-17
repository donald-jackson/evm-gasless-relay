// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {IERC20Permit} from "@openzeppelin/contracts/token/ERC20/extensions/IERC20Permit.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {Pausable} from "@openzeppelin/contracts/utils/Pausable.sol";
import {ISignatureTransfer} from "permit2/src/interfaces/ISignatureTransfer.sol";

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

    address public immutable PERMIT2;

    constructor(address _permit2) Ownable(msg.sender) {
        PERMIT2 = _permit2;
    }

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

    /// @notice Relay using Permit2 for tokens without native EIP-2612 support
    /// @dev The user must have approved the Permit2 contract for the token.
    ///      The user signs a PermitBatchTransferFrom allowing this contract to move amount+fee.
    ///      We use batch transfer to send amount to recipient and fee to relayer in one signature.
    function relayWithPermit2(
        address token,
        address from,
        address to,
        uint256 amount,
        uint256 fee,
        uint256 nonce,
        uint256 deadline,
        bytes calldata signature
    ) external whenNotPaused {
        ISignatureTransfer.PermitTransferFrom memory permitMsg = ISignatureTransfer.PermitTransferFrom({
            permitted: ISignatureTransfer.TokenPermissions({token: token, amount: amount + fee}),
            nonce: nonce,
            deadline: deadline
        });

        // Transfer amount + fee to this contract first, then distribute
        ISignatureTransfer.SignatureTransferDetails memory transferDetails = ISignatureTransfer
            .SignatureTransferDetails({to: address(this), requestedAmount: amount + fee});

        ISignatureTransfer(PERMIT2).permitTransferFrom(permitMsg, transferDetails, from, signature);

        // Distribute: amount to recipient, fee to relayer
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
