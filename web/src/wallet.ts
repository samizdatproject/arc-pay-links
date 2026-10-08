import {
  createPublicClient,
  createWalletClient,
  custom,
  http,
  type Address,
  type Chain,
  type EIP1193Provider,
  type PublicClient,
  type WalletClient,
} from 'viem';

declare global {
  interface Window {
    ethereum?: EIP1193Provider;
  }
}

const publicClients = new Map<number, PublicClient>();

export function publicClientFor(chain: Chain): PublicClient {
  let c = publicClients.get(chain.id);
  if (!c) {
    c = createPublicClient({ chain, transport: http() }) as PublicClient;
    publicClients.set(chain.id, c);
  }
  return c;
}

/** Connects the injected wallet (MetaMask, Rabby, ...) and makes sure it is on `chain`. */
export async function connectWallet(chain: Chain): Promise<{ wallet: WalletClient; account: Address }> {
  const provider = window.ethereum;
  if (!provider) throw new Error('No browser wallet found. Install MetaMask or Rabby, then reload.');
  const wallet = createWalletClient({ chain, transport: custom(provider) });
  const [account] = await wallet.requestAddresses();
  if (!account) throw new Error('The wallet did not share an account');
  if ((await wallet.getChainId()) !== chain.id) {
    try {
      await wallet.switchChain({ id: chain.id });
    } catch (e) {
      // 4902: the wallet does not know this chain yet.
      if ((e as { code?: number }).code === 4902 || /unrecognized|not added|4902/i.test(String(e))) {
        await wallet.addChain({ chain });
      } else {
        throw e;
      }
    }
  }
  return { wallet, account };
}
