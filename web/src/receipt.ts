import { decodeEventLog, type Address, type Hex, type PublicClient } from 'viem';
import { arcPayLinksAbi } from './contract';
import { invoiceIdOf, type PayLink } from './link';

export type Receipt = {
  chainId: number;
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

/** The subset of viem's PublicClient used here (keeps the module easy to test with a fake). */
export type ReceiptClient = Pick<
  PublicClient,
  'getChainId' | 'readContract' | 'getContractEvents' | 'getTransactionReceipt' | 'getBlock'
>;

/** Reads the onchain receipt for a link. Returns null when the link is unpaid. */
export async function fetchReceipt(client: ReceiptClient, contract: Address, link: PayLink): Promise<Receipt | null> {
  const chainId = await client.getChainId();
  if (chainId !== link.chainId) throw new Error(`This link is for chain ${link.chainId}, but the RPC is chain ${chainId}`);
  const invoiceId = invoiceIdOf(link, contract);
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
    chainId,
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

/** Every ArcPayLinks payment in a transaction. These are facts about the chain, not yet matched to any invoice. */
export async function fetchPaymentsInTx(client: ReceiptClient, contract: Address, hash: Hex): Promise<Receipt[]> {
  const chainId = await client.getChainId();
  const tx = await client.getTransactionReceipt({ hash });
  if (tx.status !== 'success') throw new Error('That transaction failed onchain');
  const out: Receipt[] = [];
  let paidAt: Date | undefined;
  for (const log of tx.logs) {
    if (log.address.toLowerCase() !== contract.toLowerCase()) continue;
    let ev;
    try {
      ev = decodeEventLog({ abi: arcPayLinksAbi, data: log.data, topics: log.topics, eventName: 'Paid' });
    } catch {
      continue; // not a Paid log
    }
    paidAt ??= new Date(Number((await client.getBlock({ blockNumber: tx.blockNumber })).timestamp) * 1000);
    out.push({
      chainId,
      invoiceId: ev.args.invoiceId,
      payer: ev.args.payer,
      merchant: ev.args.merchant,
      amount: ev.args.amount,
      paidAt,
      blockNumber: tx.blockNumber,
      txHash: hash,
      nonce: ev.args.nonce,
      memo: ev.args.memo,
    });
  }
  if (!out.length) throw new Error('No ArcPayLinks payment in that transaction');
  return out;
}

/**
 * Pairs a payment with the link it pays, if the viewer holds that link. A payment only counts as
 * "verified" when its invoice id equals the id recomputed from a link the viewer supplied or saved.
 */
export function matchLink(r: Receipt, candidates: PayLink[], contract: Address): PayLink | undefined {
  return candidates.find((l) => l.chainId === r.chainId && invoiceIdOf(l, contract) === r.invoiceId);
}
