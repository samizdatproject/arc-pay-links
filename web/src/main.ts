import './style.css';
import { BaseError, isAddress, type Address, type Hex } from 'viem';
import { chains, defaultChainId, deployments, explorerAddress, explorerTx, arcMainnet, arcTestnet, isRealMoney } from './chains';
import { arcPayLinksAbi, arcPayLinksBytecode } from './contract';
import { decodeLink, encodeLink, formatUsdc, invoiceIdOf, MAX_MEMO_BYTES, parseUsdc, randomNonce, revealHidden, type PayLink } from './link';
import { fetchPaymentsInTx, fetchReceipt, matchLink, type Receipt } from './receipt';
import { connectWallet, publicClientFor } from './wallet';

// ---------- tiny DOM helpers (textContent only, so link data can never inject HTML) ----------
type Child = Node | string | null | undefined | false;
function h<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  props: Record<string, string | ((e: Event) => void)> = {},
  ...children: Child[]
): HTMLElementTagNameMap[K] {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(props)) {
    if (typeof v === 'function') el.addEventListener(k.replace(/^on/, ''), v);
    else el.setAttribute(k, v);
  }
  for (const c of children) if (c) el.append(c);
  return el;
}
const app = document.getElementById('app')!;
function render(...nodes: Child[]) {
  app.replaceChildren(...(nodes.filter(Boolean) as (Node | string)[]));
}
function errText(e: unknown): string {
  if (e instanceof BaseError) return e.shortMessage;
  return e instanceof Error ? e.message : String(e);
}
function short(a: string) {
  return `${a.slice(0, 6)}…${a.slice(-4)}`;
}
function extLink(href: string | undefined, text: string) {
  return href ? h('a', { href, target: '_blank', rel: 'noopener' }, text) : h('span', {}, text);
}
function row(label: string, value: Child) {
  return h('div', { class: 'row' }, h('span', { class: 'label' }, label), h('span', { class: 'value' }, value));
}
function contractFor(chainId: number): Address {
  const a = deployments[chainId];
  if (!a) throw new Error(`ArcPayLinks is not deployed on ${chains[chainId]?.name ?? `chain ${chainId}`} yet.`);
  return a;
}
function chainOf(chainId: number) {
  const c = chains[chainId];
  if (!c) throw new Error(`Unsupported chain ${chainId}`);
  return c;
}
/** Loud warning shown on every page about a chain other than Arc mainnet. */
function testBanner(chainId: number) {
  return isRealMoney(chainId)
    ? null
    : h('div', { class: 'testnet-banner', role: 'alert' }, `TEST NETWORK (${chains[chainId]?.name ?? `chain ${chainId}`}) — NO REAL MONEY`);
}
function idOrDash(link: PayLink) {
  const c = deployments[link.chainId];
  return c ? h('code', {}, invoiceIdOf(link, c)) : '—';
}
function baseUrl() {
  return `${location.origin}${location.pathname}`;
}

// ---------- "my links" (this browser only) ----------
const STORE = 'arc-pay-links:v1';
function savedLinks(): string[] {
  try {
    return JSON.parse(localStorage.getItem(STORE) ?? '[]');
  } catch {
    return [];
  }
}
function saveLink(q: string) {
  try {
    localStorage.setItem(STORE, JSON.stringify([q, ...savedLinks().filter((x) => x !== q)].slice(0, 100)));
  } catch {
    // storage unavailable: the link still works, it just is not remembered
  }
}

// ---------- views ----------
function viewCreate() {
  const status = h('p', { class: 'status' });
  const merchant = h('input', { id: 'merchant', placeholder: '0x… address that receives USDC', autocomplete: 'off' });
  const amount = h('input', { id: 'amount', placeholder: '25.00', inputmode: 'decimal' });
  const memo = h('input', { id: 'memo', placeholder: 'Invoice #42 — logo design', maxlength: String(MAX_MEMO_BYTES) });
  const network = h('select', { id: 'network' });
  for (const c of Object.values(chains)) {
    const opt = h('option', { value: String(c.id) }, `${c.name}${deployments[c.id] ? '' : ' (not deployed yet)'}`);
    if (c.id === defaultChainId()) opt.selected = true;
    network.append(opt);
  }
  const out = h('div', { class: 'out' });

  const useWallet = h('button', { type: 'button', class: 'ghost', onclick: async () => {
    try {
      const { account } = await connectWallet(chainOf(Number(network.value)));
      merchant.value = account;
    } catch (e) {
      status.textContent = errText(e);
    }
  } }, 'Use my wallet');

  const form = h('form', { onsubmit: (e: Event) => {
    e.preventDefault();
    status.textContent = '';
    out.replaceChildren();
    try {
      if (!isAddress(merchant.value.trim())) throw new Error('Enter a valid 0x address');
      const link: PayLink = {
        chainId: Number(network.value),
        merchant: merchant.value.trim() as Address,
        amount: parseUsdc(amount.value),
        nonce: randomNonce(),
        memo: memo.value.trim(),
      };
      const q = encodeLink(link);
      saveLink(q);
      const url = `${baseUrl()}#/pay?${q}`;
      const input = h('input', { readonly: '', value: url, class: 'mono' });
      out.append(
        h('h3', {}, 'Your payment link'),
        input,
        h('div', { class: 'actions' },
          h('button', { type: 'button', onclick: async () => {
            await navigator.clipboard?.writeText(url).catch(() => input.select());
            status.textContent = 'Copied.';
          } }, 'Copy link'),
          h('a', { class: 'button ghost', href: `#/pay?${q}` }, 'Open it'),
        ),
        testBanner(link.chainId) ?? '',
        row('Invoice id', idOrDash(link)),
        h('p', { class: 'hint' }, 'Keep this link: it is how you verify the payment later. The invoice id commits to the network, the contract, the address, the amount, the memo and a random nonce, so a payment for an edited link can never show up as a payment of yours. It does not stop someone sending a payer an edited link, so payers should check the address and amount before paying.'),
      );
    } catch (err) {
      status.textContent = errText(err);
    }
  } },
    h('label', { for: 'merchant' }, 'Pay to'), h('div', { class: 'inline' }, merchant, useWallet),
    h('label', { for: 'amount' }, 'Amount (USDC)'), amount,
    h('label', { for: 'memo' }, 'Memo (shown to the payer and stored onchain)'), memo,
    h('label', { for: 'network' }, 'Network'), network,
    h('button', { type: 'submit' }, 'Create payment link'),
  );
  render(
    h('section', { class: 'card' }, h('h2', {}, 'Request a USDC payment'), form, status, out),
    h('section', { class: 'explain' },
      h('p', {}, 'No server, no account. The link carries the request; the payer pays in one transaction on Arc, where USDC is the gas token, and the receipt lives onchain where anyone with the link can check it.'),
    ),
  );
}

function receiptCard(chainId: number, r: Receipt) {
  return h('section', { class: 'card receipt' },
    testBanner(chainId),
    h('h2', {}, 'Paid ', isRealMoney(chainId) ? h('span', { class: 'badge ok' }, 'verified onchain') : null),
    row('Amount', `${formatUsdc(r.amount)} USDC`),
    row('To', extLink(explorerAddress(chainId, r.merchant), r.merchant)),
    row('From', extLink(explorerAddress(chainId, r.payer), r.payer)),
    r.memo ? row('Memo', revealHidden(r.memo)) : null,
    row('Paid at', r.paidAt.toISOString().replace('T', ' ').replace(/\.\d+Z$/, ' UTC')),
    row('Network', chainOf(chainId).name),
    row('Block', String(r.blockNumber)),
    r.txHash ? row('Transaction', extLink(explorerTx(chainId, r.txHash), short(r.txHash))) : null,
    row('Invoice id', h('code', {}, r.invoiceId)),
    h('p', { class: 'hint' }, `Read from ArcPayLinks at ${contractFor(chainId)}. Nothing on this page comes from a server.`),
  );
}

async function viewPay(query: string) {
  let link: PayLink;
  try {
    link = decodeLink(query);
  } catch (e) {
    return render(h('section', { class: 'card' }, h('h2', {}, 'This link is broken'), h('p', {}, errText(e))));
  }
  const chain = chainOf(link.chainId);
  const status = h('p', { class: 'status' }, 'Checking whether this link is already paid…');
  const payBtn = h('button', { type: 'button', disabled: '' }, `Pay ${formatUsdc(link.amount)} USDC`);
  render(
    h('section', { class: 'card' },
      testBanner(link.chainId),
      h('h2', {}, 'Payment request'),
      h('p', { class: 'amount' }, `${formatUsdc(link.amount)} `, h('small', {}, 'USDC')),
      link.memo ? row('For', link.memo) : null,
      row('Pay to', extLink(explorerAddress(link.chainId, link.merchant), link.merchant)),
      row('Network', chain.name),
      row('Invoice id', idOrDash(link)),
      h('div', { class: 'actions' }, payBtn),
      status,
      h('p', { class: 'hint' }, 'You pay with USDC; network fees are also paid in USDC and are a fraction of a cent.'),
    ),
  );

  let contract: Address;
  try {
    contract = contractFor(link.chainId);
    const existing = await fetchReceipt(publicClientFor(chain), contract, link);
    if (existing) return render(receiptCard(link.chainId, existing));
    status.textContent = 'Not paid yet.';
    payBtn.removeAttribute('disabled');
  } catch (e) {
    status.textContent = errText(e);
    return;
  }

  payBtn.addEventListener('click', async () => {
    payBtn.setAttribute('disabled', '');
    try {
      status.textContent = 'Connecting wallet…';
      const { wallet, account } = await connectWallet(chain);
      const client = publicClientFor(chain);
      const balance = await client.getBalance({ address: account });
      if (balance < link.amount) throw new Error(`This wallet holds ${formatUsdc(balance)} USDC on ${chain.name}, which is not enough.`);
      const { request } = await client.simulateContract({
        account,
        address: contract,
        abi: arcPayLinksAbi,
        functionName: 'pay',
        args: [link.merchant, link.nonce, link.memo],
        value: link.amount,
      });
      status.textContent = 'Confirm the payment in your wallet…';
      const hash = await wallet.writeContract(request);
      status.textContent = `Sent ${short(hash)}. Waiting for Arc to finalize…`;
      const tx = await client.waitForTransactionReceipt({ hash });
      if (tx.status !== 'success') throw new Error('The transaction reverted');
      location.hash = `#/receipt?${encodeLink(link)}`;
    } catch (e) {
      status.textContent = errText(e);
      payBtn.removeAttribute('disabled');
    }
  });
}

async function viewReceipt(query: string) {
  render(h('section', { class: 'card' }, h('p', {}, 'Reading the receipt from Arc…')));
  try {
    const link = decodeLink(query);
    const r = await fetchReceipt(publicClientFor(chainOf(link.chainId)), contractFor(link.chainId), link);
    if (!r)
      return render(h('section', { class: 'card' }, h('h2', {}, 'Not paid yet'),
        h('p', {}, 'No payment for this exact link is recorded onchain.'),
        h('a', { class: 'button', href: `#/pay?${query}` }, 'Go to payment page')));
    render(receiptCard(link.chainId, r));
  } catch (e) {
    render(h('section', { class: 'card' }, h('h2', {}, 'Could not read the receipt'), h('p', {}, errText(e))));
  }
}

function unmatchedCard(chainId: number, r: Receipt) {
  return h('section', { class: 'card receipt' },
    testBanner(chainId),
    h('h2', {}, 'Payment found ', h('span', { class: 'badge open' }, 'not matched to an invoice')),
    h('p', { class: 'hint' }, 'This is a real ArcPayLinks payment, but it is not verified against an invoice: paste the payment link below (or open this page in the browser that created the link) to check that it pays that exact invoice.'),
    row('Amount', `${formatUsdc(r.amount)} USDC`),
    row('To', extLink(explorerAddress(chainId, r.merchant), r.merchant)),
    row('From', extLink(explorerAddress(chainId, r.payer), r.payer)),
    r.memo ? row('Memo (as sent)', revealHidden(r.memo)) : null,
    row('Paid at', r.paidAt.toISOString().replace('T', ' ').replace(/\.\d+Z$/, ' UTC')),
    r.txHash ? row('Transaction', extLink(explorerTx(chainId, r.txHash), short(r.txHash))) : null,
    row('Invoice id', h('code', {}, r.invoiceId)),
  );
}

async function viewTx(hash: string, query: string) {
  const params = new URLSearchParams(query);
  const chainId = Number(params.get('c') ?? defaultChainId());
  render(h('section', { class: 'card' }, h('p', {}, 'Reading the transaction from Arc…')));
  try {
    const contract = contractFor(chainId);
    const candidates: PayLink[] = [];
    for (const q of [params.get('link') ?? '', ...savedLinks()]) {
      try {
        if (q) candidates.push(decodeLink(q.replace(/^.*?\?/, '')));
      } catch {
        // ignore malformed candidates
      }
    }
    const payments = await fetchPaymentsInTx(publicClientFor(chainOf(chainId)), contract, hash as Hex);
    render(...payments.map((r) => {
      const link = matchLink(r, candidates, contract);
      return link ? receiptCard(chainId, { ...r, memo: link.memo }) : unmatchedCard(chainId, r);
    }));
  } catch (e) {
    render(h('section', { class: 'card' }, h('h2', {}, 'No receipt found'), h('p', {}, errText(e))));
  }
}

async function viewLinks() {
  const list = h('div', { class: 'links' });
  render(h('section', { class: 'card' }, h('h2', {}, 'Links created in this browser'), list,
    h('p', { class: 'hint' }, 'Kept in this browser only. Status is read live from Arc.')));
  const qs = savedLinks();
  if (!qs.length) return list.append(h('p', {}, 'None yet. ', h('a', { href: '#/' }, 'Create one.')));
  for (const q of qs) {
    let link: PayLink;
    try {
      link = decodeLink(q);
    } catch {
      continue;
    }
    const state = h('span', { class: 'badge' }, '…');
    list.append(h('div', { class: 'linkrow' },
      h('a', { href: `#/receipt?${q}` }, `${formatUsdc(link.amount)} USDC${link.memo ? ` · ${link.memo}` : ''}`),
      h('span', { class: 'muted' }, chains[link.chainId]?.name ?? String(link.chainId)), state));
    const contract = deployments[link.chainId];
    if (!contract) {
      state.textContent = 'not deployed';
      continue;
    }
    fetchReceipt(publicClientFor(chainOf(link.chainId)), contract, link)
      .then((r) => {
        state.textContent = r ? 'paid' : 'open';
        state.classList.add(r ? 'ok' : 'open');
      })
      .catch(() => (state.textContent = 'error'));
  }
}

function viewLookup() {
  const hash = h('input', { placeholder: '0x… transaction hash', class: 'mono' });
  const link = h('input', { placeholder: 'Payment link (optional, needed to verify the invoice)', class: 'mono' });
  const network = h('select', {});
  for (const c of Object.values(chains)) if (deployments[c.id]) network.append(h('option', { value: String(c.id) }, c.name));
  render(h('section', { class: 'card' }, h('h2', {}, 'Verify a payment by transaction hash'),
    h('form', { onsubmit: (e: Event) => {
      e.preventDefault();
      const p = new URLSearchParams({ c: network.value });
      if (link.value.trim()) p.set('link', link.value.trim());
      location.hash = `#/tx/${hash.value.trim()}?${p}`;
    } }, h('label', {}, 'Transaction hash'), hash, h('label', {}, 'Payment link'), link,
      h('label', {}, 'Network'), network, h('button', { type: 'submit' }, 'Verify'))));
}

function viewDeploy() {
  const network = h('select', {});
  for (const c of [arcTestnet, arcMainnet]) network.append(h('option', { value: String(c.id) }, c.name));
  const status = h('p', { class: 'status' });
  render(h('section', { class: 'card' }, h('h2', {}, 'Deploy ArcPayLinks from your wallet'),
    h('p', {}, 'For operators. Deploys the contract from the connected browser wallet; the key never leaves the wallet. Expected cost: about 0.01 USDC in gas.'),
    network,
    h('button', { type: 'button', onclick: async () => {
      try {
        const chain = chainOf(Number(network.value));
        const { wallet, account } = await connectWallet(chain);
        status.textContent = 'Confirm the deployment in your wallet…';
        const hash = await wallet.deployContract({ abi: arcPayLinksAbi, bytecode: arcPayLinksBytecode, account, chain });
        status.textContent = `Sent ${hash}. Waiting…`;
        const tx = await publicClientFor(chain).waitForTransactionReceipt({ hash });
        status.textContent = `Deployed at ${tx.contractAddress} in block ${tx.blockNumber} (tx ${hash}). Put this address in web/src/chains.ts.`;
      } catch (e) {
        status.textContent = errText(e);
      }
    } }, 'Deploy'),
    status));
}

// ---------- router ----------
function route() {
  const [path, query = ''] = location.hash.replace(/^#/, '').split('?');
  if (path === '/pay') return void viewPay(query);
  if (path === '/receipt') return void viewReceipt(query);
  if (path?.startsWith('/tx/')) return void viewTx(path.slice(4), query);
  if (path === '/links') return void viewLinks();
  if (path === '/verify') return viewLookup();
  if (path === '/deploy' && import.meta.env.DEV) return viewDeploy();
  return viewCreate();
}
if (import.meta.env.DEV) {
  document.querySelector('footer')?.append(' · ', h('a', { href: '#/deploy' }, 'deploy (dev only)'));
}
window.addEventListener('hashchange', route);
route();
