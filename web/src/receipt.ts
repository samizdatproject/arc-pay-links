import { decodeEventLog, type Address, type Hex, type PublicClient } from 'viem';
import { arcPayLinksAbi } from './contract';
import { invoiceIdOf, type PayLink } from './link';

export type Receipt = {
  invoiceId: Hex;
  payer: Address;
  merchant: Address;
  amount: bigint;
  paidAt: Date;
  blockNumber: bigint;
  txHash?: Hex;
  nonce?: Hex;
  memo?: string;
};

/** Reads the onchain receipt for a link. Returns null when the link is unpaid. */
export async function fetchReceipt(
  client: PublicClient,
  contract: Address,
  link: PayLink,
): Promise<Receipt | null> {
  const invoiceId = invoiceIdOf(link);
  const [payer, paidAt, merchant, blockNumber, amount] = await client.readContract({
    address: contract,
    abi: arcPayLinksAbi,
    functionName: 'receipts',
    args: [invoiceId],
  });
  if (paidAt === 0n) return null;
  // The stored block number makes this a one-block log query, which every RPC allows.
  const logs = await client.getContractEvents({
    address: contract,
    abi: arcPayLinksAbi,
    eventName: 'Paid',
    args: { invoiceId },
    fromBlock: blockNumber,
    toBlock: blockNumber,
  });
  return {
    invoiceId,
    payer,
    merchant,
    amount,
    paidAt: new Date(Number(paidAt) * 1000),
    blockNumber,
    txHash: logs[0]?.transactionHash ?? undefined,
    nonce: link.nonce,
    memo: link.memo,
  };
}

/** Reads a receipt from a transaction hash (for people who only have the hash). */
export async function fetchReceiptByTx(client: PublicClient, contract: Address, hash: Hex): Promise<Receipt> {
  const tx = await client.getTransactionReceipt({ hash });
  if (tx.status !== 'success') throw new Error('That transaction failed onchain');
  for (const log of tx.logs) {
    if (log.address.toLowerCase() !== contract.toLowerCase()) continue;
    try {
      const ev = decodeEventLog({ abi: arcPayLinksAbi, data: log.data, topics: log.topics, eventName: 'Paid' });
      const block = await client.getBlock({ blockNumber: tx.blockNumber });
      return {
        invoiceId: ev.args.invoiceId,
        payer: ev.args.payer,
        merchant: ev.args.merchant,
        amount: ev.args.amount,
        paidAt: new Date(Number(block.timestamp) * 1000),
        blockNumber: tx.blockNumber,
        txHash: hash,
        nonce: ev.args.nonce,
        memo: ev.args.memo,
      };
    } catch {
      // not a Paid log
    }
  }
  throw new Error('No ArcPayLinks payment in that transaction');
}
