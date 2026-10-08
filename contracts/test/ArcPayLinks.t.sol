// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {ArcPayLinks} from "../src/ArcPayLinks.sol";

contract RejectingMerchant {
    receive() external payable {
        revert("no");
    }
}

contract ReentrantMerchant {
    ArcPayLinks immutable links;
    bytes32 nonce;
    bool tried;
    bool public reentryReverted;

    constructor(ArcPayLinks l) {
        links = l;
    }

    function arm(bytes32 n) external payable {
        nonce = n;
    }

    receive() external payable {
        if (tried) return;
        tried = true;
        // Try to pay the same link again from inside the merchant callback.
        try links.pay{value: msg.value}(payable(address(this)), nonce, "memo") {}
        catch {
            reentryReverted = true;
        }
    }
}

contract ArcPayLinksTest is Test {
    ArcPayLinks links;
    address payable merchant = payable(makeAddr("merchant"));
    address payer = makeAddr("payer");

    event Paid(
        bytes32 indexed invoiceId,
        address indexed merchant,
        address indexed payer,
        uint256 amount,
        bytes32 nonce,
        string memo
    );

    function setUp() public {
        links = new ArcPayLinks();
        vm.deal(payer, 1_000 ether);
    }

    function test_PayForwardsFundsAndRecordsReceipt() public {
        bytes32 nonce = keccak256("n1");
        uint256 amount = 12.5 ether; // 12.5 USDC (18-decimal native)
        bytes32 id = links.invoiceIdOf(merchant, amount, nonce, "Coffee x2");

        vm.expectEmit(true, true, true, true);
        emit Paid(id, merchant, payer, amount, nonce, "Coffee x2");
        vm.prank(payer);
        bytes32 got = links.pay{value: amount}(merchant, nonce, "Coffee x2");

        assertEq(got, id);
        assertEq(merchant.balance, amount);
        assertEq(address(links).balance, 0);
        (address p, uint64 paidAt, address m, uint64 bn, uint256 a) = links.receipts(id);
        assertEq(bn, block.number);
        assertEq(p, payer);
        assertEq(m, merchant);
        assertEq(a, amount);
        assertEq(paidAt, block.timestamp);
    }

    function test_InvoiceIdMatchesOffchainFormula() public view {
        bytes32 nonce = bytes32(uint256(42));
        bytes32 expected = keccak256(abi.encode(merchant, uint256(1e18), nonce, keccak256(bytes("hi"))));
        assertEq(links.invoiceIdOf(merchant, 1e18, nonce, "hi"), expected);
    }

    /// Fixed vector shared with the web app test (web/test/link.test.ts).
    function test_InvoiceIdKnownVector() public view {
        bytes32 id = links.invoiceIdOf(
            payable(0x000000000000000000000000000000000000bEEF), 1.5 ether, bytes32(uint256(1)), "Invoice #7"
        );
        assertEq(id, 0x97cb530360c187e7f7c1ed2b307bf9a6082de8de15f3c775355eda1feda6fa8a);
    }

    function test_RevertWhen_PaidTwice() public {
        bytes32 nonce = keccak256("n");
        vm.startPrank(payer);
        bytes32 id = links.pay{value: 1 ether}(merchant, nonce, "m");
        vm.expectRevert(abi.encodeWithSelector(ArcPayLinks.AlreadyPaid.selector, id));
        links.pay{value: 1 ether}(merchant, nonce, "m");
        vm.stopPrank();
        assertEq(merchant.balance, 1 ether);
    }

    function test_DifferentAmountIsDifferentInvoice() public {
        bytes32 nonce = keccak256("n");
        vm.startPrank(payer);
        bytes32 a = links.pay{value: 1 ether}(merchant, nonce, "m");
        bytes32 b = links.pay{value: 2 ether}(merchant, nonce, "m");
        vm.stopPrank();
        assertTrue(a != b);
        assertEq(merchant.balance, 3 ether);
    }

    function test_RevertWhen_ZeroAmount() public {
        vm.prank(payer);
        vm.expectRevert(ArcPayLinks.ZeroAmount.selector);
        links.pay(merchant, bytes32(0), "m");
    }

    function test_RevertWhen_ZeroMerchant() public {
        vm.prank(payer);
        vm.expectRevert(ArcPayLinks.ZeroMerchant.selector);
        links.pay{value: 1}(payable(address(0)), bytes32(0), "m");
    }

    function test_RevertWhen_MerchantRejects() public {
        RejectingMerchant r = new RejectingMerchant();
        vm.prank(payer);
        vm.expectRevert(ArcPayLinks.TransferFailed.selector);
        links.pay{value: 1 ether}(payable(address(r)), bytes32(0), "m");
        assertEq(payer.balance, 1_000 ether);
    }

    function test_ReentrantSamePaymentReverts() public {
        ReentrantMerchant r = new ReentrantMerchant(links);
        bytes32 nonce = keccak256("re");
        r.arm(nonce);
        vm.prank(payer);
        bytes32 id = links.pay{value: 1 ether}(payable(address(r)), nonce, "memo");
        assertTrue(r.reentryReverted());
        (address p,,,,) = links.receipts(id);
        assertEq(p, payer);
        assertEq(address(r).balance, 1 ether);
    }

    function testFuzz_Pay(uint96 amount, bytes32 nonce, string calldata memo) public {
        vm.assume(amount > 0);
        vm.deal(payer, amount);
        vm.prank(payer);
        bytes32 id = links.pay{value: amount}(merchant, nonce, memo);
        assertEq(id, links.invoiceIdOf(merchant, amount, nonce, memo));
        assertEq(merchant.balance, amount);
        assertEq(address(links).balance, 0);
    }
}
