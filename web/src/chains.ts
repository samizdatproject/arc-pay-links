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

const env: Record<string, unknown> = import.meta.env ?? {};
/** Test networks are only offered in dev builds or when explicitly enabled at build time. */
export const TESTNETS_ENABLED: boolean = Boolean(env.DEV) || env.VITE_ENABLE_TESTNET === 'true';
/** A local anvil chain is only offered when a local contract address is supplied at build time. */
const LOCAL_PAYLINKS = env.VITE_LOCAL_PAYLINKS as Address | undefined;

export const chains: Record<number, Chain> = { [arcMainnet.id]: arcMainnet };
if (TESTNETS_ENABLED) chains[arcTestnet.id] = arcTestnet;
if (LOCAL_PAYLINKS) chains[localAnvil.id] = localAnvil;

/** Where ArcPayLinks is deployed. Fill in after deploying (see docs/DEPLOY.md). */
export const deployments: Record<number, Address | undefined> = {
  [arcMainnet.id]: undefined,
  [arcTestnet.id]: undefined,
  [localAnvil.id]: LOCAL_PAYLINKS,
};

/** Only Arc mainnet moves real money. Everything else gets a loud warning instead of a "verified" badge. */
export function isRealMoney(chainId: number): boolean {
  return chainId === arcMainnet.id;
}

/** The chain new links default to. */
export function defaultChainId(): number {
  return arcMainnet.id;
}

export function explorerTx(chainId: number, hash: string): string | undefined {
  const base = chains[chainId]?.blockExplorers?.default.url;
  return base ? `${base}/tx/${hash}` : undefined;
}

export function explorerAddress(chainId: number, addr: string): string | undefined {
  const base = chains[chainId]?.blockExplorers?.default.url;
  return base ? `${base}/address/${addr}` : undefined;
}
