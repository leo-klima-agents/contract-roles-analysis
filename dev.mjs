// Local dev server: bundle with the dev API key injected, watch for changes, and
// serve dist/ over HTTP. Run with: DEV_API_KEY=$ETHERSCAN_API_KEY npm run dev
import * as esbuild from 'esbuild';
import { cleanDist, copyStatic } from './build.mjs';

const devApiKey = process.env.DEV_API_KEY ?? '';

cleanDist();
copyStatic();

const ctx = await esbuild.context({
  entryPoints: ['src/main.ts'],
  bundle: true,
  format: 'esm',
  target: 'es2022',
  minify: false,
  sourcemap: true,
  outfile: 'dist/assets/main.js',
  logLevel: 'info',
  define: { __DEV_API_KEY__: JSON.stringify(devApiKey) },
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
if (devApiKey) console.log('API key field will be prefilled from DEV_API_KEY.');
else console.log('Tip: set DEV_API_KEY=$ETHERSCAN_API_KEY to prefill the API key field.');
