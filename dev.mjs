// Local dev server: bundle with the dev RPC injected, watch for changes, and
// serve dist/ over HTTP. Run with: DEV_RPC_URL=$BASE_RPC_URL npm run dev
import * as esbuild from 'esbuild';
import { cleanDist, copyStatic } from './build.mjs';

const devRpc = process.env.DEV_RPC_URL ?? '';

cleanDist();
copyStatic();

const ctx = await esbuild.context({
  entryPoints: ['src/main.ts'],
  bundle: true,
  format: 'iife',
  target: 'es2022',
  minify: false,
  sourcemap: true,
  outfile: 'dist/assets/main.js',
  logLevel: 'info',
  define: { __DEV_RPC_URL__: JSON.stringify(devRpc) },
  // Re-copy static assets whenever a rebuild happens (covers index.html/css edits).
  plugins: [
    {
      name: 'copy-static',
      setup(build) {
        build.onEnd(() => copyStatic());
      },
    },
  ],
});

await ctx.watch();
const { host, port } = await ctx.serve({ servedir: 'dist', port: 5173 });
console.log(`\nDev server running at http://${host === '0.0.0.0' ? 'localhost' : host}:${port}/`);
if (devRpc) console.log('RPC URL field will be prefilled from DEV_RPC_URL.');
else console.log('Tip: set DEV_RPC_URL=$BASE_RPC_URL to prefill the RPC field.');
