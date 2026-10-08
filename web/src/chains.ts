import { defineChain, type Address, type Chain } from 'viem';

// Values from https://docs.arc.io/arc/references/connect-to-arc
export const arcMainnet = defineChain({
  id: 5042,
  name: 'Arc',
  nativeCurrency: { name: 'USDC', symbol: 'USDC', decimals: 18 },
  rpcUrls: { default: { http: ['https://rpc.mainnet.arc.io'] } },
  blockExplorers: { default: { name: 'Arc Explorer', url: 'https://explorer.arc.io' } },
});

export const arcTestnet = defineChain({
  id: 5042002,
  name: 'Arc Testnet',
  nativeCurrency: { name: 'USDC', symbol: 'USDC', decimals: 18 },
  rpcUrls: { default: { http: ['https://rpc.testnet.arc.io'] } },
  blockExplorers: { default: { name: 'Arc Testnet Explorer', url: 'https://explorer.testnet.arc.io' } },
  testnet: true,
});

/** Local anvil, for development and the e2e script. */
export const localAnvil = defineChain({
  id: 31337,
  name: 'Local (anvil)',
  nativeCurrency: { name: 'USDC', symbol: 'USDC', decimals: 18 },
  rpcUrls: { default: { http: ['http://127.0.0.1:8545'] } },
  testnet: true,
});

export const chains: Record<number, Chain> = {
  [arcMainnet.id]: arcMainnet,
  [arcTestnet.id]: arcTestnet,
  [localAnvil.id]: localAnvil,
};

/**
 * Where ArcPayLinks is deployed. Fill in after deploying (see DEPLOY.md).
 * A local address can also be supplied at build time with VITE_LOCAL_PAYLINKS.
 */
export const deployments: Record<number, Address | undefined> = {
  [arcMainnet.id]: undefined,
  [arcTestnet.id]: undefined,
  [localAnvil.id]: (import.meta.env?.VITE_LOCAL_PAYLINKS as Address | undefined) ?? undefined,
};

/** The chain new links default to: mainnet once deployed there, else testnet. */
export function defaultChainId(): number {
  return deployments[arcMainnet.id] ? arcMainnet.id : arcTestnet.id;
}

export function explorerTx(chainId: number, hash: string): string | undefined {
  const base = chains[chainId]?.blockExplorers?.default.url;
  return base ? `${base}/tx/${hash}` : undefined;
}

export function explorerAddress(chainId: number, addr: string): string | undefined {
  const base = chains[chainId]?.blockExplorers?.default.url;
  return base ? `${base}/address/${addr}` : undefined;
}
