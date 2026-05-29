import { getAddress, type Address, type Hex } from 'viem';
import { decodeCall } from './abi';
import { flattenCalls } from './safe';
import type { RoleClient } from './chains';
import type { Candidate, MethodDef, RoleAction, ScanConfig } from './types';

export interface ScanResult {
  /** Net candidate per (role, account), keyed `${role}:${account}` lowercased. */
  candidates: Map<string, Candidate>;
  scannedBlocks: number;
  totalBlocks: number;
  matchedActions: number;
}

interface PendingAction extends Candidate {
  txIndex: number;
}

function actionOf(method: MethodDef): RoleAction {
  // A method flagged as both grant and revoke is ambiguous; treat presence of
  // grant as grant (the hasRole verify step is what determines final truth).
  if (method.isGrant && !method.isRevoke) return 'grant';
  if (method.isRevoke && !method.isGrant) return 'revoke';
  return method.isGrant ? 'grant' : 'revoke';
}

/**
 * Bounded block-range scan. Walks [fromBlock, toBlock] with a fixed worker
 * pool, fetching each block with full transactions, flattening Safe wrappers,
 * decoding configured role methods, and replaying actions in chain order so
 * the last action per (role, account) wins.
 */
export async function scanRange(
  client: RoleClient,
  contract: Address,
  methods: MethodDef[],
  cfg: ScanConfig,
  onProgress: (done: number, total: number) => void,
  signal: AbortSignal,
): Promise<ScanResult> {
  const contractLc = contract.toLowerCase();
  const decodable = methods.filter((m) => m.selector && m.abi && (m.isGrant || m.isRevoke));

  const blocks: bigint[] = [];
  for (let b = cfg.fromBlock; b <= cfg.toBlock; b++) blocks.push(b);
  const total = blocks.length;

  const actions: PendingAction[] = [];
  let done = 0;
  let cursor = 0;

  async function worker(): Promise<void> {
    while (cursor < blocks.length) {
      if (signal.aborted) throw new DOMException('Scan cancelled', 'AbortError');
      const blockNumber = blocks[cursor++]!;
      const block = await client.getBlock({ blockNumber, includeTransactions: true });
      for (const tx of block.transactions) {
        if (typeof tx === 'string') continue; // safety; we requested full txs
        for (const call of flattenCalls(tx.to ?? null, tx.input)) {
          if (call.to.toLowerCase() !== contractLc) continue;
          const decoded = decodeCall(decodable, call.input);
          if (!decoded) continue;
          actions.push({
            role: decoded.role,
            account: getAddress(decoded.account),
            lastAction: actionOf(decoded.method),
            txHash: tx.hash as Hex,
            blockNumber,
            viaSafe: call.viaSafe,
            txIndex: tx.transactionIndex ?? 0,
          });
        }
      }
      onProgress(++done, total);
    }
  }

  const workers = Array.from({ length: Math.max(1, Math.min(cfg.concurrency, 20)) }, worker);
  await Promise.all(workers);

  // Replay in chain order: later actions overwrite earlier ones per pair.
  actions.sort((a, b) =>
    a.blockNumber === b.blockNumber
      ? a.txIndex - b.txIndex
      : a.blockNumber < b.blockNumber
        ? -1
        : 1,
  );

  const candidates = new Map<string, Candidate>();
  for (const a of actions) {
    const key = `${a.role.toLowerCase()}:${a.account.toLowerCase()}`;
    const { txIndex: _txIndex, ...candidate } = a;
    candidates.set(key, candidate);
  }

  return { candidates, scannedBlocks: done, totalBlocks: total, matchedActions: actions.length };
}
