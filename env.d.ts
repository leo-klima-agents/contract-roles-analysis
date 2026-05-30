// Replaced at build time by esbuild's `define`. Holds an Etherscan V2 API key
// only during local development (`DEV_API_KEY=... npm run dev`); always an empty
// string in production builds so no secret is baked into the published bundle.
declare const __DEV_API_KEY__: string;
