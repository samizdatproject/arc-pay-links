// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @title ArcPayLinks
/// @notice Pay a USDC payment link on Arc in one transaction and leave an onchain receipt.
/// @dev On Arc, USDC is the native gas token (18 decimals), so `msg.value` is a USDC amount.
///      A link is (merchant, amount, nonce, memo). Its invoice id commits to all four fields,
///      so editing any field of a link produces a different id, and each id can be paid once.
///      The contract never holds funds: the payment is forwarded to the merchant in the same call.
contract ArcPayLinks {
    struct Receipt {
        address payer;
        uint64 paidAt;
        address merchant;
        uint64 blockNumber;
        uint256 amount;
    }

    /// @notice invoiceId => receipt. `paidAt == 0` means unpaid.
    mapping(bytes32 => Receipt) public receipts;

    event Paid(
        bytes32 indexed invoiceId,
        address indexed merchant,
        address indexed payer,
        uint256 amount,
        bytes32 nonce,
        string memo
    );

    error ZeroMerchant();
    error ZeroAmount();
    error AlreadyPaid(bytes32 invoiceId);
    error TransferFailed();

    /// @notice Deterministic id of a payment link. Mirrored in the web app (src/link.ts).
    function invoiceIdOf(address merchant, uint256 amount, bytes32 nonce, string calldata memo)
        public
        pure
        returns (bytes32)
    {
        return keccak256(abi.encode(merchant, amount, nonce, keccak256(bytes(memo))));
    }

    /// @notice Pay a link. Send exactly the link amount as native USDC.
    function pay(address payable merchant, bytes32 nonce, string calldata memo)
        external
        payable
        returns (bytes32 invoiceId)
    {
        if (merchant == address(0)) revert ZeroMerchant();
        if (msg.value == 0) revert ZeroAmount();

        invoiceId = invoiceIdOf(merchant, msg.value, nonce, memo);
        if (receipts[invoiceId].paidAt != 0) revert AlreadyPaid(invoiceId);

        // uint64 holds timestamps and block numbers for far longer than this contract will matter.
        // forge-lint: disable-next-line(unsafe-typecast)
        uint64 paidAt = uint64(block.timestamp);
        // forge-lint: disable-next-line(unsafe-typecast)
        uint64 blockNumber = uint64(block.number);
        // The block number lets a client fetch the Paid log (and tx hash) with one narrow eth_getLogs call.
        receipts[invoiceId] = Receipt({
            payer: msg.sender, paidAt: paidAt, merchant: merchant, blockNumber: blockNumber, amount: msg.value
        });
        emit Paid(invoiceId, merchant, msg.sender, msg.value, nonce, memo);

        // Forwarding to a payer-chosen merchant is the point of the contract; nothing is held here.
        // forge-lint: disable-next-line(arbitrary-send-eth)
        (bool ok,) = merchant.call{value: msg.value}("");
        if (!ok) revert TransferFailed();
    }
}
