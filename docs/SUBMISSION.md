# DoraHacks submission text: Arc Microgrants

These are draft answers to the 12 fields of the Arc Microgrants submission form, which were read from the hackathon page on 2026-10-08. Fill in the `<…>` placeholders after the mainnet deploy. **Do not submit without the owner's approval.**

**1. Project name**
Arc Pay Links

**2. Your name, alias, or team name**
samizdatproject

**3. Contact email**
`<owner to fill in: an email the owner is willing to use for payout verification>`

**4. Public builder profiles (GitHub, X, Farcaster)**
https://github.com/samizdatproject

**5. Link to your live deployment on Arc mainnet**
https://samizdatproject.github.io/arc-pay-links/
(A paid example receipt: `https://samizdatproject.github.io/arc-pay-links/#/tx/<PAY_TX_HASH>?c=5042`)

**6. Arc mainnet contract address or a transaction hash we can verify**
Contract `ArcPayLinks`: `<CONTRACT_ADDRESS>` (https://explorer.arc.io/address/<CONTRACT_ADDRESS>)
Example payment: `<PAY_TX_HASH>`

**7. Public repo**
https://github.com/samizdatproject/arc-pay-links

**8. In two sentences, what does your project do?**
Arc Pay Links lets anyone request USDC with a shareable link: the payer pays it in one transaction from a browser wallet, and both sides get a receipt read directly from Arc. Each link's invoice id commits to its address, amount, memo and nonce, so a link cannot be tampered with or paid twice, and the whole app is a static site plus a 70-line contract with no backend.

**9. What does it use Arc for?**
It uses USDC as Arc's native currency: `pay()` takes the payment as `msg.value` and forwards it to the merchant in the same call. That removes the ERC-20 approve step, and the payer needs nothing but USDC, including for gas (about 0.003 USDC per payment). Arc's sub-second deterministic finality means the receipt is final as soon as it is shown. The contract stores each receipt onchain (payer, merchant, amount, time and block), so verification needs nothing but an Arc RPC.

**10. Had you deployed to Arc before this project?**
`<owner to choose. Truthful answer as of 2026-10-08: "No" for mainnet; no testnet deployment was made for this project either>`

**11. Have you received a Circle or Arc grant, bounty, or prize for this project?**
No

**12. Anything else we should see?**
- Tests: 10 Foundry tests, including a fuzz test, a re-entrancy test and a fixed vector shared with the frontend; they pass under `forge test` and `arc-forge test --network arc`. There are also 17 frontend unit tests and an end-to-end test (deploy, pay, verify the receipt, double-pay reverts), run against `arc-anvil --network arc`.
- Built with heavy AI assistance (Claude as coding agent) under human direction; disclosed in the README.
- Demo video: `<optional link>`
- Next steps if funded: QR codes for in-person payments; ERC-20 path for other stablecoins (EURC); CCTP "pay from any chain" so payers on other chains can settle links on Arc; a webhook-free merchant feed built on the `Paid` event.
