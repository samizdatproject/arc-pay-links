# Deploying Arc Pay Links

Nothing in this repo has been deployed to Arc mainnet. Every step below that spends money, or publishes anything, needs the owner to carry it out.

## What it costs

These measurements come from `eth_estimateGas` against `https://rpc.mainnet.arc.io` on 2026-10-08, and from e2e runs.

| Action | Gas | Cost at 20 gwei (Arc's base-fee floor; mainnet was at 20 gwei on 2026-10-08) |
|---|---|---|
| Deploy `ArcPayLinks` | 398,616 | **≈ 0.0080 USDC** |
| Pay a link (`pay`) | ≈ 128,400 | **≈ 0.0026 USDC**, plus the amount being paid |

Arc gas is paid in native USDC with 18 decimals, so `gas × gasPrice` gives the cost in USDC directly. The mempool drops any transaction whose `maxFeePerGas` is below 20 gwei.

**What to fund:** **1 USDC on Arc mainnet** covers one deploy, about ten demo payments of 0.05 USDC and a wide margin. The demo payments are not lost: they go to the merchant address, which can be one of your own.

How to get USDC onto Arc mainnet:
- withdraw from an exchange that supports Arc, or
- bridge from another chain with Circle CCTP. On Arc, CCTP uses domain 26 and TokenMessengerV2 `0x28b5a0e9C621a5BadaA536219b3a228C8168cf5d`.

Send it to a **fresh deployer address** that holds nothing else.

## Option A: deploy from your browser wallet (no key ever leaves the wallet)

1. Build the site and serve it locally:
   ```bash
   cd web && npm install && npm run build && npx vite preview
   ```
2. Open `http://localhost:4173/#/deploy`, choose **Arc** and click **Deploy**. Confirm the transaction in MetaMask or Rabby. The app adds the Arc network to the wallet if it is missing (chain 5042, RPC `https://rpc.mainnet.arc.io`).
3. Copy the contract address and the tx hash that the page shows.

## Option B: deploy with Foundry from a fresh key

```bash
# 1. Make a fresh key. Keep it out of shell history and out of the repo.
cast wallet new

# 2. Fund that address with about 1 USDC on Arc mainnet (see above), then:
export DEPLOYER_PRIVATE_KEY=0x...      # or leave it unset and the script asks with hidden input
scripts/deploy.sh mainnet               # checks the chain id and balance, prints the gas estimate,
                                        # and asks you to type "deploy mainnet"
```

Run the same steps with `scripts/deploy.sh testnet` first if you want a rehearsal. It needs about 0.1 testnet USDC from https://faucet.circle.com: choose "Arc Testnet", paste the address and solve the reCAPTCHA. No account is needed.

## After deploying (either option)

1. **Verify the source code** on the explorer. No key is needed:
   ```bash
   cd contracts
   forge verify-contract <ADDRESS> src/ArcPayLinks.sol:ArcPayLinks \
     --chain-id 5042 --verifier blockscout --verifier-url https://explorer.arc.io/api/
   ```
   The compiler settings are pinned in `contracts/foundry.toml`: solc 0.8.28, optimizer 10,000 runs, `evm_version = cancun` and `bytecode_hash = none`.
2. **Point the app at the contract.** In `web/src/chains.ts`, set `deployments[5042] = '<ADDRESS>'`. Once that is set, mainnet becomes the default network for new links.
3. **Make one real payment** so that the receipt page has something to show:
   - open the app and create a link for 0.05 USDC to an address you control, with a memo such as "Arc Pay Links: first mainnet payment";
   - pay it from a second wallet, or from the same wallet;
   - keep the tx hash. The submission form asks for "a contract address or a transaction hash we can verify".
4. **Optional:** run the e2e test against mainnet with the deployed contract. It spends about 0.003 USDC in gas plus 0.01 USDC, which goes to a throwaway merchant address:
   ```bash
   E2E_RPC_URL=https://rpc.mainnet.arc.io E2E_PRIVATE_KEY=<funded key> E2E_PAYLINKS=<ADDRESS> npm run e2e
   ```
   The 0.01 USDC sent to the random merchant cannot be recovered. Set `E2E_AMOUNT=0.000001` to keep that loss negligible.
5. **Publish the site.** See [HOSTING.md](HOSTING.md).
