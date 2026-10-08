import { defineConfig, loadEnv, type Plugin } from 'vite';

/**
 * Content-Security-Policy for production builds (dev needs inline HMR scripts and websockets).
 * connect-src lists only the RPCs this build can talk to.
 */
function csp(env: Record<string, string>): Plugin {
  const rpcs = ['https://rpc.mainnet.arc.io'];
  if (env.VITE_ENABLE_TESTNET === 'true') rpcs.push('https://rpc.testnet.arc.io');
  if (env.VITE_LOCAL_PAYLINKS) rpcs.push('http://127.0.0.1:8545');
  const policy = [
    "default-src 'self'",
    `connect-src ${rpcs.join(' ')}`,
    "img-src 'self' data:",
    "base-uri 'none'",
    "form-action 'none'",
    "object-src 'none'",
  ].join('; ');
  return {
    name: 'csp',
    apply: 'build',
    transformIndexHtml: (html) =>
      html.replace('<meta charset="UTF-8" />', `<meta charset="UTF-8" />\n    <meta http-equiv="Content-Security-Policy" content="${policy}" />`),
  };
}

// Relative base so the build works from any static host path (e.g. GitHub Pages /arc-pay-links/).
export default defineConfig(({ mode }) => ({ base: './', plugins: [csp(loadEnv(mode, process.cwd(), 'VITE_'))] }));
