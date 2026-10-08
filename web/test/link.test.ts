import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { arcPayLinksAbi, arcPayLinksBytecode } from '../src/contract';
import { decodeLink, encodeLink, formatUsdc, invoiceIdOf, parseUsdc, randomNonce, type PayLink } from '../src/link';

const merchant = '0x000000000000000000000000000000000000bEEF';
const nonce1 = `0x${'0'.repeat(63)}1` as const;

describe('invoiceIdOf', () => {
  it('matches the Solidity known vector (contracts/test test_InvoiceIdKnownVector)', () => {
    expect(invoiceIdOf({ merchant, amount: 1_500_000_000_000_000_000n, nonce: nonce1, memo: 'Invoice #7' })).toBe(
      '0x97cb530360c187e7f7c1ed2b307bf9a6082de8de15f3c775355eda1feda6fa8a',
    );
  });

  it('changes when any field changes', () => {
    const base = { merchant, amount: 10n ** 18n, nonce: nonce1, memo: 'a' } as const;
    const id = invoiceIdOf(base);
    expect(invoiceIdOf({ ...base, amount: 2n * 10n ** 18n })).not.toBe(id);
    expect(invoiceIdOf({ ...base, memo: 'b' })).not.toBe(id);
    expect(invoiceIdOf({ ...base, merchant: '0x000000000000000000000000000000000000dEaD' })).not.toBe(id);
    expect(invoiceIdOf({ ...base, nonce: `0x${'0'.repeat(63)}2` })).not.toBe(id);
  });

  it('hashes the memo as UTF-8', () => {
    const a = invoiceIdOf({ merchant, amount: 1n, nonce: nonce1, memo: 'café ☕' });
    expect(a).toMatch(/^0x[0-9a-f]{64}$/);
  });
});

describe('amounts', () => {
  it('parses human USDC into 18-decimal native units', () => {
    expect(parseUsdc('12.5')).toBe(12_500_000_000_000_000_000n);
    expect(parseUsdc('0.000001')).toBe(10n ** 12n);
    expect(formatUsdc(parseUsdc('12.50'))).toBe('12.5');
  });
  it.each(['', '0', '0.0', '-1', '1e3', 'abc', '1.0000001', '1,5'])('rejects %j', (bad) => {
    expect(() => parseUsdc(bad)).toThrow();
  });
});

describe('link encoding', () => {
  const link: PayLink = { chainId: 5042, merchant, amount: parseUsdc('25'), nonce: randomNonce(), memo: 'Logo & design #42 ?=' };

  it('round-trips', () => {
    const back = decodeLink(encodeLink(link));
    expect(back).toEqual({ ...link, merchant: '0x000000000000000000000000000000000000bEEF' });
    expect(invoiceIdOf(back)).toBe(invoiceIdOf(link));
  });

  it('checksums the merchant address', () => {
    const q = encodeLink({ ...link, merchant: merchant.toLowerCase() as `0x${string}` });
    expect(decodeLink(q).merchant).toBe(merchant);
  });

  it('rejects broken links', () => {
    const q = new URLSearchParams(encodeLink(link));
    for (const [k, v] of [['to', '0x123'], ['to', '0x0000000000000000000000000000000000000000'], ['amt', '0'], ['n', '0x12'], ['c', 'x']]) {
      const p = new URLSearchParams(q);
      p.set(k!, v!);
      expect(() => decodeLink(p.toString()), `${k}=${v}`).toThrow();
    }
    const p = new URLSearchParams(q);
    p.delete('to');
    expect(() => decodeLink(p.toString())).toThrow(/missing "to"/);
    expect(() => decodeLink(new URLSearchParams({ ...Object.fromEntries(q), m: 'x'.repeat(141) }).toString())).toThrow(/Memo/);
  });

  it('allows an empty memo', () => {
    expect(decodeLink(encodeLink({ ...link, memo: '' })).memo).toBe('');
  });
});

describe('generated contract module', () => {
  const art = fileURLToPath(new URL('../../contracts/out/ArcPayLinks.sol/ArcPayLinks.json', import.meta.url));
  it('is in sync with the Foundry build (run forge build first)', () => {
    expect(existsSync(art)).toBe(true);
    const j = JSON.parse(readFileSync(art, 'utf8'));
    expect(arcPayLinksBytecode).toBe(j.bytecode.object);
    expect(arcPayLinksAbi).toEqual(j.abi);
  });
});
