// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {ISignatureTransfer} from "permit2/src/interfaces/ISignatureTransfer.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {ECDSA} from "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";
import {EIP712} from "@openzeppelin/contracts/utils/cryptography/EIP712.sol";

/// @notice Minimal mock of Permit2's SignatureTransfer for testing
contract MockPermit2 is EIP712 {
    using SafeERC20 for IERC20;

    bytes32 constant TOKEN_PERMISSIONS_TYPEHASH = keccak256("TokenPermissions(address token,uint256 amount)");
    bytes32 constant PERMIT_TRANSFER_FROM_TYPEHASH = keccak256(
        "PermitTransferFrom(TokenPermissions permitted,address spender,uint256 nonce,uint256 deadline)TokenPermissions(address token,uint256 amount)"
    );

    mapping(address => mapping(uint256 => bool)) public nonceBitmap;

    error SignatureExpired(uint256 deadline);
    error InvalidNonce();
    error InvalidSigner();

    constructor() EIP712("Permit2", "1") {}

    function DOMAIN_SEPARATOR() external view returns (bytes32) {
        return _domainSeparatorV4();
    }

    function permitTransferFrom(
        ISignatureTransfer.PermitTransferFrom memory permit,
        ISignatureTransfer.SignatureTransferDetails calldata transferDetails,
        address owner,
        bytes calldata signature
    ) external {
        if (block.timestamp > permit.deadline) revert SignatureExpired(permit.deadline);

        // Check and set nonce
        if (nonceBitmap[owner][permit.nonce]) revert InvalidNonce();
        nonceBitmap[owner][permit.nonce] = true;

        // Build and verify signature
        bytes32 tokenPermissionsHash = keccak256(
            abi.encode(TOKEN_PERMISSIONS_TYPEHASH, permit.permitted.token, permit.permitted.amount)
        );
        bytes32 structHash = keccak256(
            abi.encode(PERMIT_TRANSFER_FROM_TYPEHASH, tokenPermissionsHash, msg.sender, permit.nonce, permit.deadline)
        );
        bytes32 digest = _hashTypedDataV4(structHash);

        address signer = ECDSA.recover(digest, signature);
        if (signer != owner) revert InvalidSigner();

        // Transfer tokens from owner to the specified recipient
        IERC20(permit.permitted.token).safeTransferFrom(
            owner, transferDetails.to, transferDetails.requestedAmount
        );
    }
}
