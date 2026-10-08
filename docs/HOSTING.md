# Hosting plan

The app is a static site: `web/dist` after `npm run build`, about 300 kB of JavaScript. The page uses relative asset paths and hash routes, so it works from any static host and from any sub-path, with no server-side rewrites.

## Primary: GitHub Pages under `samizdatproject`

1. Create the **public** repo `samizdatproject/arc-pay-links`, then push `main`. Both steps need the owner's approval.
2. In the repo, set Settings → Pages → Source to **GitHub Actions**. `.github/workflows/pages.yml` then builds `web/` and publishes it on every push to `main`.
3. The live URL will be **https://samizdatproject.github.io/arc-pay-links/**.
4. After the mainnet deploy, commit the contract address in `web/src/chains.ts` and push. The site redeploys on its own.

`.github/workflows/test.yml` runs the Foundry tests, the unit tests and the build on every push.

## Fallbacks (no account beyond GitHub)

- **Cloudflare Pages** or **Netlify**, connected to the same repo: build command `cd web && npm ci && npm run build`, output directory `web/dist`.
- **IPFS**: pin `web/dist`. Hash routing makes it work through any gateway.

## Why no backend

Every page reads from the Arc RPC (`https://rpc.mainnet.arc.io`) in the visitor's browser, and every write goes through the visitor's own wallet. Nothing needs to be kept running, and the app keeps working for as long as some copy of the static files is reachable.
