import {
  encodeAbiParameters,
  getAddress,
  isAddress,
  keccak256,
  parseUnits,
  formatUnits,
  toHex,
  type Address,
  type Hex,
} from 'viem';

/** A payment link: everything needed to pay and to verify, carried in the URL. */
export type PayLink = {
  chainId: number;
  merchant: Address;
  /** Native USDC amount in wei (18 decimals on Arc). */
  amount: bigint;
  nonce: Hex; // bytes32
  memo: string;
};

export const MAX_MEMO_BYTES = 140;
/** Links are limited to 6 decimals so the native (18) and ERC-20 (6) views of USDC agree. */
export const MAX_DECIMALS = 6;

export function parseUsdc(input: string): bigint {
  const s = input.trim();
  if (!/^\d+(\.\d+)?$/.test(s)) throw new Error('Amount must be a number like 12.50');
  const decimals = s.split('.')[1]?.length ?? 0;
  if (decimals > MAX_DECIMALS) throw new Error(`Use at most ${MAX_DECIMALS} decimals`);
  const v = parseUnits(s, 18);
  if (v === 0n) throw new Error('Amount must be greater than zero');
  return v;
}

export function formatUsdc(wei: bigint): string {
  return formatUnits(wei, 18);
}

export function randomNonce(): Hex {
  const b = new Uint8Array(32);
  crypto.getRandomValues(b);
  return toHex(b);
}

/**
 * Same formula as ArcPayLinks.invoiceIdOf: binds the link to its chain and to one contract
 * deployment, so a payment on testnet (or on another deployment) never matches a mainnet link.
 */
export function invoiceIdOf(l: Pick<PayLink, 'chainId' | 'merchant' | 'amount' | 'nonce' | 'memo'>, contract: Address): Hex {
  return keccak256(
    encodeAbiParameters(
      [
        { type: 'uint256' },
        { type: 'address' },
        { type: 'address' },
        { type: 'uint256' },
        { type: 'bytes32' },
        { type: 'bytes32' },
      ],
      [BigInt(l.chainId), contract, l.merchant, l.amount, l.nonce, keccak256(new TextEncoder().encode(l.memo))],
    ),
  );
}

/**
 * Invisible, blank-looking and direction-changing characters, which can make a memo display
 * differently from what it says: soft hyphen, combining grapheme joiner, Arabic letter mark,
 * Hangul fillers, Mongolian vowel separator, zero-width and bidi marks/overrides/isolates,
 * word joiner and invisible operators, BOM, and Unicode tag characters.
 */
export const HIDDEN_CHARS =
  /[\u00AD\u034F\u061C\u115F\u1160\u180E\u200B-\u200F\u202A-\u202E\u2060-\u2069\u3164\uFEFF\u{E0000}-\u{E007F}]/u;
const HIDDEN_CHARS_G = new RegExp(HIDDEN_CHARS.source, 'gu');

/** Makes hidden characters visible, for memos that did not come through our own validation (e.g. read from a tx). */
export function revealHidden(s: string): string {
  return s.replace(HIDDEN_CHARS_G, (c) => `\\u{${c.codePointAt(0)!.toString(16).toUpperCase()}}`);
}

export function validateLink(l: PayLink): PayLink {
  if (!Number.isSafeInteger(l.chainId) || l.chainId <= 0) throw new Error('Bad chain id');
  if (!isAddress(l.merchant, { strict: false })) throw new Error('Bad merchant address');
  if (/^0x0{40}$/i.test(l.merchant)) throw new Error('Merchant cannot be the zero address');
  if (l.amount <= 0n) throw new Error('Amount must be greater than zero');
  if (l.amount % 10n ** 12n !== 0n) throw new Error(`Amount has more than ${MAX_DECIMALS} decimals`);
  if (!/^0x[0-9a-fA-F]{64}$/.test(l.nonce)) throw new Error('Bad nonce');
  if (HIDDEN_CHARS.test(l.memo)) throw new Error('Memo contains invisible or direction-changing characters');
  if (new TextEncoder().encode(l.memo).length > MAX_MEMO_BYTES)
    throw new Error(`Memo is longer than ${MAX_MEMO_BYTES} bytes`);
  return { ...l, merchant: getAddress(l.merchant), nonce: l.nonce.toLowerCase() as Hex };
}

/** Query string for a link (no leading '?'). Amount is written in human USDC units. */
export function encodeLink(l: PayLink): string {
  const v = validateLink(l);
  const p = new URLSearchParams({
    c: String(v.chainId),
    to: v.merchant,
    amt: formatUsdc(v.amount),
    n: v.nonce,
  });
  if (v.memo) p.set('m', v.memo);
  return p.toString();
}

export function decodeLink(query: string): PayLink {
  const p = new URLSearchParams(query);
  const need = (k: string) => {
    const v = p.get(k);
    if (v === null || v === '') throw new Error(`Link is missing "${k}"`);
    return v;
  };
  return validateLink({
    chainId: Number(need('c')),
    merchant: need('to') as Address,
    amount: parseUsdc(need('amt')),
    nonce: need('n') as Hex,
    memo: p.get('m') ?? '',
  });
}
