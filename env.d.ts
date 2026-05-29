// Replaced at build time by esbuild's `define`. Holds an RPC URL only during
// local development (`DEV_RPC_URL=... npm run dev`); always an empty string in
// production builds so no secret is baked into the published bundle.
declare const __DEV_RPC_URL__: string;
