// End-to-end test against a real JSON-RPC node: deploys (or reuses) ArcPayLinks, pays a link,
// and reads the receipt back with the same code the web app uses.
//
// Env (read from ../.env if present; the key is never printed):
//   E2E_RPC_URL       e.g. http://127.0.0.1:8545 or https://rpc.testnet.arc.io
//   E2E_PRIVATE_KEY   funded key that deploys and pays
//   E2E_PAYLINKS      optional: existing contract address to reuse
//   E2E_AMOUNT        optional: USDC to pay (default 0.01)
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { createPublicClient, createWalletClient, defineChain, http, type Address, type Hex, type PublicClient } from 'viem';
import { generatePrivateKey, privateKeyToAccount } from 'viem/accounts';
import { describe, expect, it } from 'vitest';
import { arcPayLinksAbi, arcPayLinksBytecode } from '../src/contract';
import { decodeLink, encodeLink, formatUsdc, invoiceIdOf, parseUsdc, randomNonce, type PayLink } from '../src/link';
import { fetchReceipt, fetchReceiptByTx } from '../src/receipt';

const envFile = fileURLToPath(new URL('../../.env', import.meta.url));
if (existsSync(envFile)) process.loadEnvFile(envFile);

function need(k: string): string {
  const v = process.env[k];
  if (!v) throw new Error(`Set ${k} (see .env.example)`);
  return v;
}

describe('ArcPayLinks end to end', () => {
  it('deploys, pays a link once, and verifies the receipt', async () => {
    const rpc = need('E2E_RPC_URL');
    const account = privateKeyToAccount(need('E2E_PRIVATE_KEY') as Hex);
    const probe = createPublicClient({ transport: http(rpc) });
    const chainId = await probe.getChainId();
    const chain = defineChain({
      id: chainId,
      name: `chain ${chainId}`,
      nativeCurrency: { name: 'USDC', symbol: 'USDC', decimals: 18 },
      rpcUrls: { default: { http: [rpc] } },
    });
    const client = createPublicClient({ chain, transport: http(rpc) }) as PublicClient;
    const wallet = createWalletClient({ chain, account, transport: http(rpc) });
    const log: Record<string, unknown> = { chainId, rpc, payer: account.address };

    const startBal = await client.getBalance({ address: account.address });
    log.payerStartBalance = formatUsdc(startBal);
    expect(startBal, `payer ${account.address} has no USDC on chain ${chainId}`).toBeGreaterThan(0n);

    // 1. Deploy, unless reusing.
    let contract = process.env.E2E_PAYLINKS as Address | undefined;
    if (!contract) {
      const hash = await wallet.deployContract({ abi: arcPayLinksAbi, bytecode: arcPayLinksBytecode });
      const r = await client.waitForTransactionReceipt({ hash });
      expect(r.status).toBe('success');
      contract = r.contractAddress!;
      Object.assign(log, { deployTx: hash, deployGas: r.gasUsed, deployGasPrice: r.effectiveGasPrice, deployCost: formatUsdc(r.gasUsed * r.effectiveGasPrice) });
    }
    log.contract = contract;

    // 2. Merchant creates a link (fresh random merchant address, so its balance starts at 0).
    const merchant = privateKeyToAccount(generatePrivateKey()).address;
    const link: PayLink = decodeLink(
      encodeLink({ chainId, merchant, amount: parseUsdc(process.env.E2E_AMOUNT ?? '0.01'), nonce: randomNonce(), memo: 'e2e: Invoice #1 ☕' }),
    );
    log.link = `#/pay?${encodeLink(link)}`;
    expect(await fetchReceipt(client, contract, link)).toBeNull();

    // 3. Payer pays it, the same way the web app does.
    const { request } = await client.simulateContract({
      account,
      address: contract,
      abi: arcPayLinksAbi,
      functionName: 'pay',
      args: [link.merchant, link.nonce, link.memo],
      value: link.amount,
    });
    const payHash = await wallet.writeContract(request);
    const payR = await client.waitForTransactionReceipt({ hash: payHash });
    expect(payR.status).toBe('success');
    Object.assign(log, { payTx: payHash, payGas: payR.gasUsed, payGasPrice: payR.effectiveGasPrice, payCost: formatUsdc(payR.gasUsed * payR.effectiveGasPrice) });

    // 4. Funds reached the merchant; the contract holds nothing.
    expect(await client.getBalance({ address: merchant })).toBe(link.amount);
    expect(await client.getBalance({ address: contract })).toBe(0n);

    // 5. Receipt by link and by tx hash agree.
    const byLink = await fetchReceipt(client, contract, link);
    expect(byLink).not.toBeNull();
    expect(byLink!.invoiceId).toBe(invoiceIdOf(link));
    expect(byLink!.payer).toBe(account.address);
    expect(byLink!.merchant).toBe(link.merchant);
    expect(byLink!.amount).toBe(link.amount);
    expect(byLink!.txHash).toBe(payHash);
    const byTx = await fetchReceiptByTx(client, contract, payHash);
    expect(byTx.invoiceId).toBe(byLink!.invoiceId);
    expect(byTx.memo).toBe(link.memo);
    expect(byTx.paidAt.getTime()).toBe(byLink!.paidAt.getTime());

    // 6. Paying the same link twice is refused.
    await expect(
      client.simulateContract({ account, address: contract, abi: arcPayLinksAbi, functionName: 'pay', args: [link.merchant, link.nonce, link.memo], value: link.amount }),
    ).rejects.toThrow(/AlreadyPaid/);

    log.payerEndBalance = formatUsdc(await client.getBalance({ address: account.address }));
    const outDir = fileURLToPath(new URL('../../e2e-results/', import.meta.url));
    mkdirSync(outDir, { recursive: true });
    const json = JSON.stringify(log, (_k, v) => (typeof v === 'bigint' ? v.toString() : v), 2);
    writeFileSync(`${outDir}/chain-${chainId}.json`, json + '\n');
    console.log(json);
  });
});
