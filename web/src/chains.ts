import { defineChain, type Address, type Chain } from 'viem';

// Values from https://docs.arc.io/arc/references/connect-to-arc
export const arcMainnet = defineChain({
  id: 5042,
  name: 'Arc',
  nativeCurrency: { name: 'USDC', symbol: 'USDC', decimals: 18 },
  rpcUrls: { default: { http: ['https://rpc.mainnet.arc.io'] } },
  blockExplorers: { default: { name: 'Arc Explorer', url: 'https://explorer.arc.io' } },
});

/**
 * Test networks are only offered in dev builds or when explicitly enabled at build time.
 * These are literal `import.meta.env.*` reads so Vite replaces them at build time and the
 * testnet / localhost definitions below are dropped from production bundles entirely.
 */
export const TESTNETS_ENABLED: boolean = import.meta.env.DEV || import.meta.env.VITE_ENABLE_TESTNET === 'true';
/** A local anvil chain is only offered when a local contract address is supplied at build time. */
const LOCAL_PAYLINKS = import.meta.env.VITE_LOCAL_PAYLINKS as Address | undefined;

export const chains: Record<number, Chain> = { [arcMainnet.id]: arcMainnet };
if (import.meta.env.DEV || import.meta.env.VITE_ENABLE_TESTNET === 'true') {
  chains[5042002] = defineChain({
    id: 5042002,
    name: 'Arc Testnet',
    nativeCurrency: { name: 'USDC', symbol: 'USDC', decimals: 18 },
    rpcUrls: { default: { http: ['https://rpc.testnet.arc.io'] } },
    blockExplorers: { default: { name: 'Arc Testnet Explorer', url: 'https://explorer.testnet.arc.io' } },
    testnet: true,
  });
}
if (import.meta.env.VITE_LOCAL_PAYLINKS) {
  // Local anvil, for development and the browser smoke test.
  chains[31337] = defineChain({
    id: 31337,
    name: 'Local (anvil)',
    nativeCurrency: { name: 'USDC', symbol: 'USDC', decimals: 18 },
    rpcUrls: { default: { http: ['http://127.0.0.1:8545'] } },
    testnet: true,
  });
}

/** Where ArcPayLinks is deployed. Fill in after deploying (see docs/DEPLOY.md). */
export const deployments: Record<number, Address | undefined> = {
  [arcMainnet.id]: undefined,
};
if (import.meta.env.DEV || import.meta.env.VITE_ENABLE_TESTNET === 'true') deployments[5042002] = undefined; // testnet address
if (LOCAL_PAYLINKS) deployments[31337] = LOCAL_PAYLINKS;

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
