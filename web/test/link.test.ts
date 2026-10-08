import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { arcPayLinksAbi, arcPayLinksBytecode } from '../src/contract';
import { decodeLink, encodeLink, formatUsdc, invoiceIdOf, parseUsdc, randomNonce, revealHidden, type PayLink } from '../src/link';

const merchant = '0x000000000000000000000000000000000000bEEF';
const nonce1 = `0x${'0'.repeat(63)}1` as const;

const contract = '0x00000000000000000000000000000000c0ffee00';

describe('invoiceIdOf', () => {
  const vector = { merchant, amount: 1_500_000_000_000_000_000n, nonce: nonce1, memo: 'Invoice #7' } as const;

  it('matches the Solidity known vectors (contracts/test test_InvoiceIdKnownVectors)', () => {
    expect(invoiceIdOf({ ...vector, chainId: 5042 }, contract)).toBe(
      '0xf45eea7981f89ee5addfb755ee6dc37081eb2f79dff961a404b9152949aa4045',
    );
    expect(invoiceIdOf({ ...vector, chainId: 5042002 }, contract)).toBe(
      '0x830d86cb87b1d2a71b40763d456869bb76ce65e3963853d394ed43dcd50fb526',
    );
  });

  it('differs across chain ids and contract addresses', () => {
    const id = invoiceIdOf({ ...vector, chainId: 5042 }, contract);
    expect(invoiceIdOf({ ...vector, chainId: 5042002 }, contract)).not.toBe(id);
    expect(invoiceIdOf({ ...vector, chainId: 5042 }, '0x00000000000000000000000000000000c0ffee01')).not.toBe(id);
  });

  it('changes when any field changes', () => {
    const base = { chainId: 5042, merchant, amount: 10n ** 18n, nonce: nonce1, memo: 'a' } as const;
    const id = invoiceIdOf(base, contract);
    expect(invoiceIdOf({ ...base, amount: 2n * 10n ** 18n }, contract)).not.toBe(id);
    expect(invoiceIdOf({ ...base, memo: 'b' }, contract)).not.toBe(id);
    expect(invoiceIdOf({ ...base, merchant: '0x000000000000000000000000000000000000dEaD' }, contract)).not.toBe(id);
    expect(invoiceIdOf({ ...base, nonce: `0x${'0'.repeat(63)}2` }, contract)).not.toBe(id);
  });

  it('hashes the memo as UTF-8', () => {
    expect(invoiceIdOf({ chainId: 5042, merchant, amount: 1n, nonce: nonce1, memo: 'café ☕' }, contract)).toMatch(/^0x[0-9a-f]{64}$/);
  });
});

describe('hidden characters in memos', () => {
  const base = { chainId: 5042, merchant, amount: parseUsdc('1'), nonce: nonce1 } as const;
  it.each(['\u202E', '\u202A', '\u2066', '\u2069', '\u200B', '\u200D', '\u200F', '\uFEFF', '\u2060'])(
    'rejects U+%s',
    (c) => {
      expect(() => encodeLink({ ...base, memo: `pay ${c}evil` })).toThrow(/invisible|direction/);
      const q = new URLSearchParams(encodeLink({ ...base, memo: 'ok' }));
      q.set('m', `pay ${c}evil`);
      expect(() => decodeLink(q.toString())).toThrow(/invisible|direction/);
    },
  );
  it('reveals hidden characters for display', () => {
    expect(revealHidden('a\u202Eb')).toBe('a\\u{202E}b');
    expect(revealHidden('plain ☕')).toBe('plain ☕');
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
    expect(invoiceIdOf(back, contract)).toBe(invoiceIdOf(link, contract));
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
