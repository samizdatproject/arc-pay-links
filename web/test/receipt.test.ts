import { encodeAbiParameters, encodeEventTopics, type Address, type Hex } from 'viem';
import { describe, expect, it } from 'vitest';
import { arcPayLinksAbi } from '../src/contract';
import { invoiceIdOf, parseUsdc, type PayLink } from '../src/link';
import { fetchPaymentsInTx, fetchReceipt, matchLink, type ReceiptClient } from '../src/receipt';

const contract: Address = '0x00000000000000000000000000000000c0ffee00';
const other: Address = '0x00000000000000000000000000000000c0ffee01';
const payer: Address = '0x1111111111111111111111111111111111111111';
const merchant: Address = '0x2222222222222222222222222222222222222222';
const txHash: Hex = `0x${'ab'.repeat(32)}`;

const mainnetLink: PayLink = { chainId: 5042, merchant, amount: parseUsdc('5'), nonce: `0x${'00'.repeat(31)}01`, memo: 'Invoice #1' };
const testnetLink: PayLink = { ...mainnetLink, chainId: 5042002 };

function paidLog(address: Address, link: PayLink, invoiceId = invoiceIdOf(link, contract)) {
  return {
    address,
    topics: encodeEventTopics({ abi: arcPayLinksAbi, eventName: 'Paid', args: { invoiceId, merchant: link.merchant, payer } }),
    data: encodeAbiParameters([{ type: 'uint256' }, { type: 'bytes32' }, { type: 'string' }], [link.amount, link.nonce, link.memo]),
    transactionHash: txHash,
  };
}

/** Fake chain: `paid` maps invoice id -> receipt tuple; `logs` are the tx's logs. */
function fakeClient(opts: { chainId: number; paid?: Record<Hex, true>; logs?: ReturnType<typeof paidLog>[]; status?: 'success' | 'reverted' }): ReceiptClient {
  return {
    getChainId: async () => opts.chainId,
    readContract: (async ({ args }: { args: [Hex] }) =>
      opts.paid?.[args[0]] ? [payer, 1_700_000_000n, merchant, 42n, mainnetLink.amount] : ['0x0000000000000000000000000000000000000000', 0n, '0x0000000000000000000000000000000000000000', 0n, 0n]) as never,
    getContractEvents: (async () => [{ transactionHash: txHash }]) as never,
    getTransactionReceipt: (async () => ({ status: opts.status ?? 'success', blockNumber: 42n, logs: opts.logs ?? [] })) as never,
    getBlock: (async () => ({ timestamp: 1_700_000_000n })) as never,
  };
}

describe('fetchReceipt', () => {
  it('returns null for an unpaid link', async () => {
    expect(await fetchReceipt(fakeClient({ chainId: 5042 }), contract, mainnetLink)).toBeNull();
  });

  it('returns the receipt for a paid link', async () => {
    const id = invoiceIdOf(mainnetLink, contract);
    const r = await fetchReceipt(fakeClient({ chainId: 5042, paid: { [id]: true } }), contract, mainnetLink);
    expect(r).toMatchObject({ chainId: 5042, invoiceId: id, payer, merchant, blockNumber: 42n, txHash });
    expect(r!.paidAt.getTime()).toBe(1_700_000_000_000);
  });

  it('refuses to read a link from an RPC on another chain', async () => {
    await expect(fetchReceipt(fakeClient({ chainId: 5042002 }), contract, mainnetLink)).rejects.toThrow(/chain/);
  });

  it('a testnet payment never verifies the same mainnet link', async () => {
    // The identical link paid on testnet is recorded under the testnet id only.
    const testnetId = invoiceIdOf(testnetLink, contract);
    expect(testnetId).not.toBe(invoiceIdOf(mainnetLink, contract));
    const mainnetClient = fakeClient({ chainId: 5042, paid: { [testnetId]: true } });
    expect(await fetchReceipt(mainnetClient, contract, mainnetLink)).toBeNull();
  });
});

describe('fetchPaymentsInTx and matchLink', () => {
  it('returns every Paid log from the contract and ignores other contracts', async () => {
    const second: PayLink = { ...mainnetLink, memo: 'Invoice #2' };
    const client = fakeClient({ chainId: 5042, logs: [paidLog(contract, mainnetLink), paidLog(other, mainnetLink), paidLog(contract, second)] });
    const rs = await fetchPaymentsInTx(client, contract, txHash);
    expect(rs.map((r) => r.memo)).toEqual(['Invoice #1', 'Invoice #2']);
    expect(rs.every((r) => r.chainId === 5042 && r.txHash === txHash)).toBe(true);
  });

  it('throws when the tx has no payment or failed', async () => {
    await expect(fetchPaymentsInTx(fakeClient({ chainId: 5042, logs: [paidLog(other, mainnetLink)] }), contract, txHash)).rejects.toThrow(/No ArcPayLinks/);
    await expect(fetchPaymentsInTx(fakeClient({ chainId: 5042, status: 'reverted' }), contract, txHash)).rejects.toThrow(/failed/);
  });

  it('matches a payment only to the exact link it pays', async () => {
    const [r] = await fetchPaymentsInTx(fakeClient({ chainId: 5042, logs: [paidLog(contract, mainnetLink)] }), contract, txHash);
    expect(matchLink(r!, [mainnetLink], contract)).toEqual(mainnetLink);
    // An edited link (different amount) does not match.
    expect(matchLink(r!, [{ ...mainnetLink, amount: parseUsdc('500') }], contract)).toBeUndefined();
    // The same link on testnet does not match a mainnet payment.
    expect(matchLink(r!, [testnetLink], contract)).toBeUndefined();
    // No candidate links: found, but not verified.
    expect(matchLink(r!, [], contract)).toBeUndefined();
  });

  it('does not match a testnet payment to a mainnet link', async () => {
    const [r] = await fetchPaymentsInTx(
      fakeClient({ chainId: 5042002, logs: [paidLog(contract, testnetLink)] }),
      contract,
      txHash,
    );
    expect(matchLink(r!, [mainnetLink], contract)).toBeUndefined();
    expect(matchLink(r!, [testnetLink], contract)).toEqual(testnetLink);
  });
});
