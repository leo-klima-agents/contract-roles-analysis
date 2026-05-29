// Production/dev bundle step. esbuild bundles src/main.ts into dist/assets and
// copies the static files. The dev RPC URL is injected ONLY when run with
// --dev (and DEV_RPC_URL is set); production builds get an empty string.
import * as esbuild from 'esbuild';
import { cpSync, mkdirSync, rmSync } from 'node:fs';

const dev = process.argv.includes('--dev');
const devRpc = dev ? (process.env.DEV_RPC_URL ?? '') : '';

export const buildOptions = {
  entryPoints: ['src/main.ts'],
  bundle: true,
  format: 'esm',
  target: 'es2022',
  minify: !dev,
  sourcemap: true,
  outfile: 'dist/assets/main.js',
  logLevel: 'info',
  define: {
    __DEV_RPC_URL__: JSON.stringify(devRpc),
  },
};

export function copyStatic() {
  cpSync('index.html', 'dist/index.html');
  cpSync('src/styles.css', 'dist/assets/styles.css');
  cpSync('public/favicon.svg', 'dist/favicon.svg');
}

export function cleanDist() {
  rmSync('dist', { recursive: true, force: true });
  mkdirSync('dist/assets', { recursive: true });
}

// Only run the one-shot build when executed directly (not when imported by dev.mjs).
if (import.meta.url === `file://${process.argv[1]}`) {
  cleanDist();
  await esbuild.build(buildOptions);
  copyStatic();
  console.log(`Built dist/ (${dev ? 'dev' : 'production'} mode).`);
}
