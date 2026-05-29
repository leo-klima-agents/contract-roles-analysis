import { type Chain } from 'viem';
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
