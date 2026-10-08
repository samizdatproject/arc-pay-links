# Arc Pay Links

USDC payment links with onchain receipts, on [Arc](https://arc.io).

A merchant fills in an address, an amount and a memo, and gets a link. The payer opens it, connects a browser wallet and pays in **one transaction**. The payment is made in USDC, and so is the gas, because USDC is Arc's native gas token. Anyone holding the link can then open a receipt page that is read straight from the chain. There is no backend, no account and no database.

- **Live app:** _(not deployed yet: see [docs/DEPLOY.md](docs/DEPLOY.md))_
- **Contract on Arc mainnet:** _(not deployed yet)_

## Why Arc

- **One transaction, no approval step.** On Arc, USDC is the native currency, so `pay()` takes it as `msg.value`. There is no ERC-20 `approve` followed by `transferFrom`, and the payer needs no second token for gas.
- **Receipts you can act on at once.** Arc finalizes on inclusion, in under a second, so the receipt page is final as soon as it renders.
- **Fees too small to matter.** Paying a link costs about 128k gas. At Arc's 20 gwei base-fee floor, that is roughly **0.003 USDC**.

## How it works

```
merchant                          payer                               anyone with the link
--------                          -----                               --------------------
create link  ──(URL: to, amt,     open link ─► wallet ─► ArcPayLinks.pay{value: amt}(to, nonce, memo)
                memo, nonce)                              │  forwards USDC to merchant (same tx)
                                                          │  stores receipts[invoiceId]
                                                          └─ emits Paid(invoiceId, merchant, payer, amount, nonce, memo)
                                                                                      │
                                                         receipt page ◄── reads receipts[invoiceId] + Paid log
```

- `invoiceId = keccak256(abi.encode(chainId, contract, merchant, amount, nonce, keccak256(memo)))`. The id commits to every field of the link, to the chain and to the contract deployment:
  - if someone edits the amount or the address in a link, it becomes a different invoice, and the receipt page shows that it is unpaid;
  - a payment on testnet, or to another deployment, can never make a mainnet link show as paid.
- The invoice id protects **verification**: a merchant (or anyone holding the original link) can tell whether that exact invoice was paid. It does not stop someone sending a payer an edited link, so payers should check the address and amount on the payment page.
- Each invoice can be paid **once**. A second payment reverts with `AlreadyPaid`, which protects payers who click twice.
- The contract **never holds funds**. It forwards `msg.value` to the merchant in the same call, and it has no owner, no admin and no upgrade path.
- Each receipt stores its block number. The app can therefore fetch the `Paid` log, and with it the tx hash, through a one-block `eth_getLogs` call. This matters because Arc RPCs cap log ranges at about 5,000 blocks.
- Amounts are limited to 6 decimals, so the native view of USDC (18 decimals) and the ERC-20 view (6 decimals) always agree.

## Pages

| Route | What it does |
|---|---|
| `#/` | Create a payment link |
| `#/pay?c=…&to=…&amt=…&n=…&m=…` | Pay a link. If the link is already paid, this page shows its receipt |
| `#/receipt?…` | Receipt for a link, read from the chain |
| `#/tx/<hash>?c=<chainId>[&link=…]` | Every payment in a transaction. A payment is shown as verified only if it matches a link you supplied or created in this browser; otherwise it shows as "payment found, not matched to an invoice" |
| `#/links` | Links created in this browser, with their live paid or open status (stored in localStorage only) |
| `#/deploy` | Dev builds only (`npm run dev`): deploys the contract from a browser wallet |

## Repository layout

```
contracts/   Foundry project: src/ArcPayLinks.sol, tests, deploy script
web/         Vite + TypeScript + viem static site (no framework)
  src/link.ts      link encoding and invoice id (mirrors the contract)
  src/receipt.ts   reads receipts by link or by tx hash
  e2e/             end-to-end test against any RPC (anvil, arc-anvil, Arc testnet)
scripts/deploy.sh       guarded deploy (encrypted keystore, chain guard, balance check)
scripts/test-deploy.sh  tests for deploy.sh against anvil
docs/        deploy guide, demo script, submission text, hosting plan
```

## Run it

```bash
# contracts (Foundry; Arc Foundry's arc-forge also works)
cd contracts && forge test
arc-forge test --network arc     # same tests with Arc's runtime rules

# web
cd web && npm install
npm run sync-contract            # copy the ABI and bytecode from contracts/out
npm test                         # unit tests
npm run dev                      # http://localhost:5173

# end to end against a local Arc-flavoured node
arc-anvil --network arc &
cp ../.env.example ../.env       # set E2E_RPC_URL=http://127.0.0.1:8545 and anvil's first dev key in the file
npm run e2e

# deploy script checks (needs anvil, jq, python3)
cd .. && scripts/test-deploy.sh
```

## Tests

- **Contract (13 tests, including a 1,024-run fuzz test).** Covers payment forwarding and the stored receipt, the event, double-pay protection, zero amount and zero merchant, a merchant that rejects the payment, re-entrancy by the merchant, fixed invoice-id vectors, ids that differ across chains and deployments, and a testnet payment never verifying the mainnet link. They pass under both `forge test` and `arc-forge test --network arc`.
- **Web unit tests (36).** Cover the invoice id (checked against the same fixed vectors as Solidity, and across chains and contracts), amount parsing, link round-trips, rejection of bad links and of hidden or direction-changing characters in memos, and receipt reading and matching with a fake RPC client. They also check that `src/contract.ts` matches the Foundry build.
- **Deploy script (10 checks, `scripts/test-deploy.sh`).** Runs against anvil: the chain guard, a missing keystore, balance math above 2^63 wei, low and dust balances, a real local deploy from a keystore, and that the script never passes a private key on the command line.
- **End to end.** This test deploys the contract, creates a link and checks that the link reads as unpaid. It then pays the link and checks that the funds reached the merchant and that the contract holds nothing. Finally it checks that the receipt by link equals the receipt by tx hash, and that a second payment reverts. It has passed against `anvil`, against `arc-anvil --network arc` and against an anvil fork of Arc testnet.

## Limitations

- Links are bearer data. Anyone who has a link can see its memo, and the memo is stored onchain. Do not put private information in a memo.
- "My links" lives in your browser's localStorage. If you clear site data, the list is gone, although the links themselves still work.
- There is no refund flow. A refund is a normal transfer from the merchant back to the payer.
- The contract has no owner and no rescue function. USDC sent to the contract through the ERC-20 interface (`0x3600…0000`) is not forwarded and **cannot be recovered**. A direct `pay` call with a value different from the link's amount does not fail: it creates, and pays, a different invoice id, which the original link will not show as paid.
- Production builds offer Arc mainnet only. Testnet appears only in dev builds or builds made with `VITE_ENABLE_TESTNET=true`, and every page on a test network shows a red "TEST NETWORK — NO REAL MONEY" banner instead of a "verified" badge.
- Memos read from a transaction show hidden characters as `\u{…}`.
- **Redeploying the contract invalidates every outstanding link.** The invoice id includes the contract address, so after a redeploy, open links compute new ids and old receipts stop matching (the old payments stay visible on the explorer). Deploy once, and do not change `deployments[5042]` while links are in circulation.
- A receipt badge says where the matched link came from. "Verified: matches a link you created" means the link is in this browser's saved links. "Matches the link in this URL" only proves that the URL's link was paid: compare its invoice id with the one you got when you created the link.
- Memos with invisible, blank-looking or direction-changing characters are rejected (this includes the zero-width joiner, so joined emoji sequences such as family emoji are not allowed in memos).
- **Pushes to `main` publish the site.** Anyone who can push to `main` can change the page that payers see, so enable branch protection on `main` (require pull requests and the `ci / test` check) before sharing links.
- The contract is unaudited. It is about 70 lines, holds no funds and has no admin functions, but use it at your own risk.

## How this was built

This project was built with heavy AI assistance: an AI coding agent (Claude) wrote most of the code, the tests and the docs, under human direction and review. The contract is small on purpose, so that it is easy to audit by eye.

## License

MIT
