import {
  createPublicClient,
  custom,
  getAddress,
  type Address,
  type Hex,
  type EIP1193RequestFn,
} from 'viem';
import { CHAINS, type ChainKey } from './chains';
import { EXPLORER_V2_BASE } from './config';
import { decodeLog } from './abi';
import type { Candidate, EventDef, RoleAction } from './types';

export interface ScanResult {
  /** Net candidate per (role, account), keyed `${role}:${account}` lowercased. */
  candidates: Map<string, Candidate>;
  /** Number of explorer requests issued during discovery. */
  requests: number;
  /** Total matched role-change emissions before net replay. */
  matchedActions: number;
}

export interface ExplorerScanConfig {
  /** Etherscan V2 API key (one key works across all supported chains). */
  apiKey: string;
  chainKey: ChainKey;
  fromBlock: bigint;
  /** Upper bound (resolve "latest" before calling). */
  toBlock: bigint;
}

/** Etherscan V2 numeric chain id for a supported chain. */
export function chainId(chainKey: ChainKey): number {
  return CHAINS[chainKey].id;
}

// ---- Rate limiting -------------------------------------------------------
// Free Etherscan keys allow ~5 req/s. Serialize all explorer traffic and
// insert a small gap after each request so getLogs paging + the hasRole
// multicall never trip the limiter.
const MIN_INTERVAL_MS = 220;
let gate: Promise<unknown> = Promise.resolve();

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function schedule<T>(fn: () => Promise<T>): Promise<T> {
  const result = gate.then(fn);
  // Always wait the interval afterwards, whether or not the call succeeded.
  gate = result.then(
    () => sleep(MIN_INTERVAL_MS),
    () => sleep(MIN_INTERVAL_MS),
  );
  return result;
}

// ---- Raw API plumbing ----------------------------------------------------

interface ExplorerEnvelope {
  status?: '0' | '1';
  message?: string;
  jsonrpc?: string;
  result?: unknown;
  error?: { message?: string } | string;
}

function explorerUrl(chainKey: ChainKey, apiKey: string, params: Record<string, string>): string {
  const qs = new URLSearchParams({
    chainid: String(chainId(chainKey)),
    apikey: apiKey,
    ...params,
  });
  return `${EXPLORER_V2_BASE}?${qs.toString()}`;
}

/** GET an Etherscan V2 `module=logs` request and return the parsed envelope. */
async function getJson(url: string, signal: AbortSignal): Promise<ExplorerEnvelope> {
  const res = await schedule(() => fetch(url, { signal }));
  if (!res.ok) throw new Error(`Explorer HTTP ${res.status} ${res.statusText}`);
  return (await res.json()) as ExplorerEnvelope;
}

/** POST an Etherscan V2 `module=proxy` request (used for eth_call payloads). */
async function postJson(
  chainKey: ChainKey,
  apiKey: string,
  params: Record<string, string>,
  signal?: AbortSignal,
): Promise<ExplorerEnvelope> {
  const body = new URLSearchParams({
    chainid: String(chainId(chainKey)),
    apikey: apiKey,
    ...params,
  });
  const res = await schedule(() =>
    fetch(EXPLORER_V2_BASE, {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body,
      signal,
    }),
  );
  if (!res.ok) throw new Error(`Explorer HTTP ${res.status} ${res.statusText}`);
  return (await res.json()) as ExplorerEnvelope;
}

function envelopeError(env: ExplorerEnvelope): string | null {
  if (env.error) {
    return typeof env.error === 'string' ? env.error : (env.error.message ?? 'Explorer error');
  }
  // Proxy/logs failure: status '0' with the reason in `result` (string) or message.
  if (env.status === '0') {
    if (env.message === 'No records found') return null; // not an error — empty result
    if (typeof env.result === 'string' && env.result) return env.result;
    return env.message ?? 'Explorer returned an error';
  }
  return null;
}

// ---- getLogs discovery ---------------------------------------------------

interface RawLog {
  topics: Hex[];
  data: Hex;
  blockNumber: Hex;
  transactionHash: Hex;
  logIndex: Hex;
}

interface PendingAction extends Candidate {
  logIndex: number;
}

function actionOf(event: EventDef): RoleAction {
  if (event.isGrant && !event.isRevoke) return 'grant';
  if (event.isRevoke && !event.isGrant) return 'revoke';
  // Ambiguous (both flagged): prefer grant; hasRole is the final arbiter.
  return event.isGrant ? 'grant' : 'revoke';
}

const LOGS_PAGE_SIZE = 1000;

/**
 * Discover role-change candidates via the Etherscan V2 `getLogs` endpoint.
 *
 * One query per configured event topic0, block-windowed to beat the
 * 1000-record-per-call cap (re-include the boundary block and dedupe by
 * `${txHash}:${logIndex}`). Because the contract emits the event regardless of
 * how the call was routed (Safe, multiSend, internal/relayer), this captures
 * far more than a top-level transaction scan, in a handful of requests.
 */
export async function scanViaExplorer(
  contract: Address,
  events: EventDef[],
  cfg: ExplorerScanConfig,
  onProgress: (done: number, total: number) => void,
  signal: AbortSignal,
): Promise<ScanResult> {
  const usable = events.filter((e) => e.topic0 && e.abi && (e.isGrant || e.isRevoke));
  const actions: PendingAction[] = [];
  const seen = new Set<string>();
  let requests = 0;

  // Progress is approximate: at least one request per event, plus extra
  // windows when a query is truncated. Report against a moving total.
  let total = Math.max(1, usable.length);

  for (const event of usable) {
    if (signal.aborted) throw new DOMException('Scan cancelled', 'AbortError');
    let from = cfg.fromBlock;
    for (;;) {
      if (signal.aborted) throw new DOMException('Scan cancelled', 'AbortError');
      const url = explorerUrl(cfg.chainKey, cfg.apiKey, {
        module: 'logs',
        action: 'getLogs',
        address: contract,
        fromBlock: from.toString(),
        toBlock: cfg.toBlock.toString(),
        topic0: event.topic0!,
        page: '1',
        offset: String(LOGS_PAGE_SIZE),
      });
      const env = await getJson(url, signal);
      requests++;
      const err = envelopeError(env);
      if (err) throw new Error(err);

      const logs = (Array.isArray(env.result) ? env.result : []) as RawLog[];
      let maxBlock = from;
      for (const log of logs) {
        if (!log.topics || log.topics.length === 0) continue;
        const dedupeKey = `${log.transactionHash}:${log.logIndex}`;
        if (seen.has(dedupeKey)) continue;
        seen.add(dedupeKey);
        const decoded = decodeLog(usable, { topics: log.topics, data: log.data });
        if (!decoded || decoded.event !== event) continue;
        const blockNumber = BigInt(log.blockNumber);
        if (blockNumber > maxBlock) maxBlock = blockNumber;
        actions.push({
          role: decoded.role,
          account: getAddress(decoded.account),
          lastAction: actionOf(event),
          txHash: log.transactionHash,
          blockNumber,
          viaSafe: false,
          logIndex: Number(BigInt(log.logIndex)),
        });
      }

      onProgress(requests, total);

      // Window truncated at the page cap: continue from the last block seen.
      // Require strict block progress so a single block returning a full page
      // (astronomically unlikely for role events) can't spin forever.
      if (logs.length >= LOGS_PAGE_SIZE && maxBlock > from) {
        from = maxBlock; // re-include boundary block; dedupe guards repeats
        total += 1; // we know at least one more request is coming
        continue;
      }
      break;
    }
  }

  // Replay in chain order: later emissions overwrite earlier ones per pair.
  actions.sort((a, b) =>
    a.blockNumber === b.blockNumber
      ? a.logIndex - b.logIndex
      : a.blockNumber < b.blockNumber
        ? -1
        : 1,
  );

  const candidates = new Map<string, Candidate>();
  for (const a of actions) {
    const key = `${a.role.toLowerCase()}:${a.account.toLowerCase()}`;
    const { logIndex: _logIndex, ...candidate } = a;
    candidates.set(key, candidate);
  }

  return { candidates, requests, matchedActions: actions.length };
}

// ---- Explorer-backed viem client (for the hasRole multicall) -------------

/**
 * Build a read-only viem client whose transport is the Etherscan V2
 * `module=proxy` endpoint, so the authoritative `hasRole` confirmation runs
 * through the same API key — no separate RPC URL needed. viem's client-level
 * multicall batching collapses every hasRole read into a single `eth_call`
 * against multicall3, which we forward to the proxy via POST (POST avoids
 * URL-length limits on large batches).
 */
export function makeExplorerClient(chainKey: ChainKey, apiKey: string) {
  const request: EIP1193RequestFn = (async ({ method, params }) => {
    switch (method) {
      case 'eth_chainId':
        return `0x${chainId(chainKey).toString(16)}`;
      case 'eth_blockNumber': {
        const env = await postJson(chainKey, apiKey, {
          module: 'proxy',
          action: 'eth_blockNumber',
        });
        const err = envelopeError(env);
        if (err) throw new Error(err);
        return env.result as Hex;
      }
      case 'eth_call': {
        const [callObj, tag] = (params ?? []) as [
          { to?: string; data?: string },
          string | undefined,
        ];
        const env = await postJson(chainKey, apiKey, {
          module: 'proxy',
          action: 'eth_call',
          to: callObj?.to ?? '',
          data: callObj?.data ?? '0x',
          tag: typeof tag === 'string' ? tag : 'latest',
        });
        const err = envelopeError(env);
        if (err) throw new Error(err);
        return env.result as Hex;
      }
      default:
        throw new Error(`Method ${method} is not supported via the explorer proxy.`);
    }
  }) as EIP1193RequestFn;

  return createPublicClient({
    chain: CHAINS[chainKey],
    transport: custom({ request }),
    // Bounded batch so each proxied eth_call payload stays a sensible size.
    batch: { multicall: { batchSize: 200, wait: 16 } },
  });
}

/** The concrete public-client type produced by makeExplorerClient. */
export type ExplorerClient = ReturnType<typeof makeExplorerClient>;
