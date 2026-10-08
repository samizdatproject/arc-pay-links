# Demo video script (about 2 minutes)

A video is not required by the Arc Microgrants submission form: the `mandatoryVideoLink` field is `false`. It is still useful under "Anything else we should see?".

**Setup**
- Record the screen only. No face and no voice are needed: the captions carry the story, and an optional voice-over can read them.
- Use two browser profiles. The **merchant** profile can be any browser. The **payer** profile needs MetaMask or Rabby holding about 0.2 USDC on Arc mainnet.
- Use the live site, with the mainnet contract set in `web/src/chains.ts`.

| Time | Screen | Caption |
|---|---|---|
| 0:00–0:10 | Title card: "Arc Pay Links: USDC payment links with onchain receipts" | *Request USDC with a link. Get a receipt anyone can verify. On Arc.* |
| 0:10–0:30 | Merchant profile, `#/`. Click "Use my wallet" (or paste an address), type amount `0.10` and memo `Invoice #42: logo design`. Network: Arc. Click **Create payment link**. | *The merchant fills in an address, an amount and a memo. No signup, no server.* |
| 0:30–0:40 | Zoom in on the generated link and the invoice id. Click **Copy link**. | *The link carries the whole request. Its invoice id commits to every field, so a tampered link is a different invoice.* |
| 0:40–1:05 | Payer profile: paste the link. The payment page shows 0.10 USDC, the memo, the recipient and "Not paid yet". Click **Pay 0.10 USDC**. The wallet pops up on Arc; confirm. | *The payer pays in one transaction. On Arc, USDC is the gas token: no approve step, no second token for fees.* |
| 1:05–1:20 | The page switches to the receipt after about a second: "Paid · verified onchain", with the amount, from, to, memo, time, block and tx. | *Arc finalizes in under a second. The receipt is read straight from the chain.* |
| 1:20–1:35 | Click the tx link and show the Arc explorer: the `Paid` event, and USDC moving from payer to merchant. | *Anyone can check it on the Arc explorer. The contract forwards the USDC in the same call and never holds funds.* |
| 1:35–1:45 | Back in the payer profile, reopen the same link: it shows the receipt again, with no Pay button. | *Each invoice can be paid once. Double clicks cannot double charge.* |
| 1:45–1:55 | Merchant profile, `#/links`: the link shows a green "paid" badge. | *The merchant sees live status for the links they created.* |
| 1:55–2:00 | End card: repo URL, live URL, contract address. | *Open source. About 70 lines of Solidity and a static site. Built on Arc.* |

**Notes for recording**
- Before recording, open the wallet once and add the Arc network, so that the network prompt does not take up screen time.
- Gas for the payment is about 0.003 USDC. Say so if a voice-over is used.
- Do not show seed phrases or private keys. Show addresses only, or blur them.
- The video discloses nothing about identity. Use the `samizdatproject` handle only.
