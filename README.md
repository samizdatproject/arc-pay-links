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

- `invoiceId = keccak256(abi.encode(merchant, amount, nonce, keccak256(memo)))`. The id commits to every field of the link. If someone edits the amount or the address in a link, it becomes a different invoice, and the receipt page shows that it is unpaid.
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
| `#/tx/<hash>?c=<chainId>` | Receipt looked up by transaction hash |
| `#/links` | Links created in this browser, with their live paid or open status (stored in localStorage only) |
| `#/deploy` | Operator page that deploys the contract from a browser wallet |

## Repository layout

```
contracts/   Foundry project: src/ArcPayLinks.sol, tests, deploy script
web/         Vite + TypeScript + viem static site (no framework)
  src/link.ts      link encoding and invoice id (mirrors the contract)
  src/receipt.ts   reads receipts by link or by tx hash
  e2e/             end-to-end test against any RPC (anvil, arc-anvil, Arc testnet)
scripts/deploy.sh  guarded deploy for testnet and mainnet
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
E2E_RPC_URL=http://127.0.0.1:8545 E2E_PRIVATE_KEY=<anvil dev key> npm run e2e
```

## Tests

- **Contract (10 tests, including a 1,024-run fuzz test).** Covers payment forwarding and the stored receipt, the event, double-pay protection, zero amount and zero merchant, a merchant that rejects the payment, re-entrancy by the merchant, and a fixed invoice-id vector. They pass under both `forge test` and `arc-forge test --network arc`.
- **Web unit tests (17).** Cover the invoice id (checked against the same fixed vector as Solidity), amount parsing, link round-trips and rejection of bad links. They also check that `src/contract.ts` matches the Foundry build.
- **End to end.** This test deploys the contract, creates a link and checks that the link reads as unpaid. It then pays the link and checks that the funds reached the merchant and that the contract holds nothing. Finally it checks that the receipt by link equals the receipt by tx hash, and that a second payment reverts. It has passed against `anvil`, against `arc-anvil --network arc` and against an anvil fork of Arc testnet.

## Limitations

- Links are bearer data. Anyone who has a link can see its memo, and the memo is stored onchain. Do not put private information in a memo.
- "My links" lives in your browser's localStorage. If you clear site data, the list is gone, although the links themselves still work.
- There is no refund flow. A refund is a normal transfer from the merchant back to the payer.
- The contract is unaudited. It is about 70 lines, holds no funds and has no admin functions, but use it at your own risk.

## How this was built

This project was built with heavy AI assistance: an AI coding agent (Claude) wrote most of the code, the tests and the docs, under human direction and review. The contract is small on purpose, so that it is easy to audit by eye.

## License

MIT
