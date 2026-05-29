import { createPublicClient, http, type Chain } from 'viem';
import { mainnet, base, polygon, arbitrum } from 'viem/chains';

export const CHAINS = {
  mainnet,
  base,
  polygon,
  arbitrum,
} as const satisfies Record<string, Chain>;

export type ChainKey = keyof typeof CHAINS;

export const CHAIN_LABELS: Record<ChainKey, string> = {
  mainnet: 'Ethereum',
  base: 'Base',
  polygon: 'Polygon',
  arbitrum: 'Arbitrum One',
};

export const CHAIN_ORDER: ChainKey[] = ['mainnet', 'base', 'polygon', 'arbitrum'];

export function isChainKey(value: string): value is ChainKey {
  return value in CHAINS;
}

/**
 * Build a read-only client for the selected chain and RPC URL.
 *
 * Two batching layers keep RPC volume down:
 *  - transport-level JSON-RPC batching: many getBlock/call requests collapse
 *    into one HTTP POST (helps the block scan's fan-out).
 *  - client-level multicall batching: readContract/multicall calls are
 *    aggregated through multicall3 (helps the hasRole verification phase).
 */
export function makeClient(chainKey: ChainKey, rpcUrl: string) {
  const chain = CHAINS[chainKey];
  return createPublicClient({
    chain,
    transport: http(rpcUrl, {
      batch: { batchSize: 100, wait: 16 },
      retryCount: 2,
      retryDelay: 250,
      timeout: 20_000,
    }),
    batch: {
      multicall: { batchSize: 1024, wait: 16 },
    },
  });
}

/** The concrete public-client type produced by makeClient (chain-aware). */
export type RoleClient = ReturnType<typeof makeClient>;

/** Block-explorer base URL for the chain (without trailing slash), if known. */
export function explorerBaseUrl(chainKey: ChainKey): string | undefined {
  return CHAINS[chainKey].blockExplorers?.default.url?.replace(/\/$/, '');
}

export function txUrl(chainKey: ChainKey, txHash: string): string | undefined {
  const base = explorerBaseUrl(chainKey);
  return base ? `${base}/tx/${txHash}` : undefined;
}

export function addressUrl(chainKey: ChainKey, address: string): string | undefined {
  const base = explorerBaseUrl(chainKey);
  return base ? `${base}/address/${address}` : undefined;
}
