# Hosting plan

The app is a static site: `web/dist` after `npm run build`, about 300 kB of JavaScript. The page uses relative asset paths and hash routes, so it works from any static host and from any sub-path, with no server-side rewrites.

## Primary: GitHub Pages under `samizdatproject`

1. Create the **public** repo `samizdatproject/arc-pay-links`, then push `main`. Both steps need the owner's approval.
2. In the repo, set Settings → Pages → Source to **GitHub Actions**. `.github/workflows/ci.yml` then runs all tests and, only if they pass, builds `web/` and publishes it on every push to `main`. Every action is pinned to a commit SHA.
3. Enable branch protection on `main` (Settings → Branches): require a pull request and the `ci / test` status check. Every push to `main` republishes the page payers use.
4. The live URL will be **https://samizdatproject.github.io/arc-pay-links/**.
5. After the mainnet deploy, commit the contract address in `web/src/chains.ts` and merge it to `main` (through a pull request once branch protection is on). The site redeploys on its own.

The production build offers Arc mainnet only and carries a Content-Security-Policy (`default-src 'self'; connect-src https://rpc.mainnet.arc.io; img-src 'self' data:; base-uri 'none'; form-action 'none'; object-src 'none'`). The browser-wallet deploy page is not included.

## Fallbacks (no account beyond GitHub)

- **Cloudflare Pages** or **Netlify**, connected to the same repo: build command `cd web && npm ci && npm run build`, output directory `web/dist`.
- **IPFS**: pin `web/dist`. Hash routing makes it work through any gateway.

## Why no backend

Every page reads from the Arc RPC (`https://rpc.mainnet.arc.io`) in the visitor's browser, and every write goes through the visitor's own wallet. Nothing needs to be kept running, and the app keeps working for as long as some copy of the static files is reachable.
