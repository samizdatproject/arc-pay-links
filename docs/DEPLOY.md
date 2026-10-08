# Deploying Arc Pay Links

Nothing in this repo has been deployed to Arc mainnet. Every step below that spends money, or publishes anything, needs the owner to carry it out.

## What it costs

These measurements come from `eth_estimateGas` against `https://rpc.mainnet.arc.io` on 2026-10-08, and from e2e runs.

| Action | Gas | Cost at 20 gwei (Arc's base-fee floor; mainnet was at 20 gwei on 2026-10-08) |
|---|---|---|
| Deploy `ArcPayLinks` | 402,326 | **≈ 0.0080 USDC** |
| Pay a link (`pay`) | ≈ 128,500 | **≈ 0.0026 USDC**, plus the amount being paid |

Arc gas is paid in native USDC with 18 decimals, so `gas × gasPrice` gives the cost in USDC directly. The mempool drops any transaction whose `maxFeePerGas` is below 20 gwei.

**What to fund:** **1 USDC on Arc mainnet** covers one deploy, about ten demo payments of 0.05 USDC and a wide margin. The demo payments are not lost: they go to the merchant address, which can be one of your own.

How to get USDC onto Arc mainnet:
- withdraw from an exchange that supports Arc, or
- bridge from another chain with Circle CCTP. On Arc, CCTP uses domain 26 and TokenMessengerV2 `0x28b5a0e9C621a5BadaA536219b3a228C8168cf5d`.

Send it to a **fresh deployer address** that holds nothing else.

Do not send USDC to the contract itself, and never use its ERC-20 interface (`0x3600…0000`) to transfer to it: the contract has no owner and no rescue function, so such funds are lost.

## Option A (recommended): deploy with Foundry from an encrypted keystore

Private keys are never typed on a command line or exported into the shell: both would leave them in `ps` output or shell history.

```bash
# 1. Make a fresh key, or use one you already hold, and import it into an encrypted keystore.
#    `--interactive` prompts for the key and a password; nothing lands in shell history.
cast wallet new                                   # only if you need a fresh key; store the output offline
cast wallet import arc-deployer --interactive     # writes ~/.foundry/keystores/arc-deployer
cast wallet address --account arc-deployer        # the address to fund

# 2. Fund that address with about 1 USDC on Arc mainnet (see above), then:
scripts/deploy.sh mainnet
#    Checks the RPC's chain id and the balance (without integer overflow), prints the gas estimate,
#    asks you to type "deploy mainnet", then signs with the keystore. You are asked for the
#    keystore password twice: once to derive the address, once to sign.
```

Rehearse first with `scripts/deploy.sh testnet`. It needs about 0.1 testnet USDC from https://faucet.circle.com: choose "Arc Testnet", paste the address and solve the reCAPTCHA. No account is needed. `DRY_RUN=1 scripts/deploy.sh mainnet` runs every check without broadcasting. `scripts/test-deploy.sh` tests the script itself against anvil.

## Option B: deploy from a browser wallet (dev build only)

The deploy page is left out of production builds, so it is only available from a local dev server:

1. `cd web && npm install && npm run dev`
2. Open `http://localhost:5173/#/deploy`, choose **Arc** and click **Deploy**. Confirm the transaction in MetaMask or Rabby; the key never leaves the wallet. The app adds the Arc network to the wallet if it is missing (chain 5042, RPC `https://rpc.mainnet.arc.io`).
3. Copy the contract address and the tx hash that the page shows.

## After deploying (either option)

1. **Verify the source code** on the explorer. No key is needed:
   ```bash
   cd contracts
   forge verify-contract <ADDRESS> src/ArcPayLinks.sol:ArcPayLinks \
     --chain-id 5042 --verifier blockscout --verifier-url https://explorer.arc.io/api/
   ```
   The compiler settings are pinned in `contracts/foundry.toml`: solc 0.8.28, optimizer 10,000 runs, `evm_version = cancun` and `bytecode_hash = none`.
2. **Point the app at the contract.** In `web/src/chains.ts`, set `deployments[5042] = '<ADDRESS>'`. Deploy only once: links are bound to this address, so a redeploy invalidates every link already shared.
3. **Make one real payment** so that the receipt page has something to show:
   - open the app and create a link for 0.05 USDC to an address you control, with a memo such as "Arc Pay Links: first mainnet payment";
   - pay it from a second wallet, or from the same wallet;
   - keep the tx hash. The submission form asks for "a contract address or a transaction hash we can verify".
4. **Optional:** run the e2e test against mainnet with the deployed contract. It spends about 0.003 USDC in gas plus the payment, which goes to a random throwaway merchant address and cannot be recovered. The e2e test reads its settings from the gitignored `.env` file; edit that file in an editor rather than putting a key on the command line:
   ```
   E2E_RPC_URL=https://rpc.mainnet.arc.io
   E2E_PRIVATE_KEY=<a separate, lightly funded key>
   E2E_PAYLINKS=<ADDRESS>
   E2E_AMOUNT=0.000001
   ```
   Then run `cd web && npm run e2e`.
5. **Publish the site.** See [HOSTING.md](HOSTING.md).
