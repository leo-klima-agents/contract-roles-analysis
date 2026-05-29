import {
  CHAIN_ORDER,
  CHAIN_LABELS,
  isChainKey,
  makeClient,
  type ChainKey,
  type RoleClient,
} from './chains';
import {
  normalizeAddress,
  isValidRpcUrl,
  parseBlockNumber,
} from './validation';
import { DEFAULT_BLOCK_WINDOW, DEFAULT_HASROLE_SIGNATURE } from './config';
import { buildRoleNameMap } from './roles';
import { scanRange } from './scan';
import { verifyHolders } from './verify';
import { loadState, saveState, type PersistedState } from './storage';
import type { Holder } from './types';
import { $, el } from './ui/dom';
import { createMethodsTable } from './ui/methodsTable';
import { createRolesTable } from './ui/rolesTable';
import { createHasRoleControl } from './ui/hasRoleControl';
import { createProgress } from './ui/progress';
import { renderResults, holdersToJson } from './ui/resultsTable';

// ---- Element references ----
const chainSelect = $<HTMLSelectElement>('chain');
const rpcInput = $<HTMLInputElement>('rpcUrl');
const rpcHint = $('rpcHint');
const contractInput = $<HTMLInputElement>('contract');
const contractHint = $('contractHint');
const rememberRpc = $<HTMLInputElement>('rememberRpc');
const fromBlockInput = $<HTMLInputElement>('fromBlock');
const toBlockInput = $<HTMLInputElement>('toBlock');
const concurrencyInput = $<HTMLInputElement>('concurrency');
const useLatestBtn = $<HTMLButtonElement>('useLatest');
const scanEstimate = $('scanEstimate');
const runScanBtn = $<HTMLButtonElement>('runScan');
const cancelScanBtn = $<HTMLButtonElement>('cancelScan');
const statusEl = $('status');
const exportBtn = $<HTMLButtonElement>('exportJson');
const resultsEl = $('results');

const progress = createProgress($('progress'));

// ---- Restore persisted state ----
const saved = loadState();

for (const key of CHAIN_ORDER) {
  const opt = el('option', { value: key, textContent: CHAIN_LABELS[key] });
  chainSelect.append(opt);
}
chainSelect.value = saved?.chainKey && isChainKey(saved.chainKey) ? saved.chainKey : 'base';

contractInput.value = saved?.contract ?? '';
rememberRpc.checked = saved?.rememberRpc ?? false;
// Prefer a remembered RPC URL; otherwise prefill from the dev-only injected value.
rpcInput.value = saved?.rpcUrl ?? (__DEV_RPC_URL__ || '');
fromBlockInput.value = saved?.fromBlock ?? '';
toBlockInput.value = saved?.toBlock ?? '';
concurrencyInput.value = saved?.concurrency ?? '6';

// ---- Controllers ----
const methods = createMethodsTable(
  $('methodsTable'),
  $<HTMLButtonElement>('addMethod'),
  saved?.methods,
  persist,
);
const roles = createRolesTable(
  $('rolesTable'),
  $<HTMLButtonElement>('addRole'),
  saved?.roles,
  persist,
);
const hasRole = createHasRoleControl(
  $('hasRoleControl'),
  saved
    ? {
        signature: saved.hasRoleSignature ?? DEFAULT_HASROLE_SIGNATURE,
        roleArg: saved.hasRoleRoleArg ?? 'role',
        accountArg: saved.hasRoleAccountArg ?? 'account',
        candidateAddressesText: saved.candidateAddressesText ?? '',
      }
    : undefined,
  persist,
);

// ---- Persistence ----
function collectState(): PersistedState {
  const hr = hasRole.getState();
  return {
    chainKey: chainSelect.value,
    contract: contractInput.value.trim(),
    rpcUrl: rpcInput.value.trim(),
    rememberRpc: rememberRpc.checked,
    methods: methods.getState(),
    roles: roles.getState(),
    hasRoleSignature: hr.signature,
    hasRoleRoleArg: hr.roleArg,
    hasRoleAccountArg: hr.accountArg,
    candidateAddressesText: hr.candidateAddressesText,
    fromBlock: fromBlockInput.value.trim(),
    toBlock: toBlockInput.value.trim(),
    concurrency: concurrencyInput.value.trim(),
  };
}

function persist(): void {
  saveState(collectState());
}

// ---- Validation hints ----
function validateRpc(): boolean {
  const v = rpcInput.value.trim();
  if (!v) {
    rpcHint.textContent = '';
    rpcInput.classList.remove('invalid');
    return false;
  }
  const ok = isValidRpcUrl(v);
  rpcInput.classList.toggle('invalid', !ok);
  rpcHint.className = ok ? 'hint ok' : 'hint err';
  rpcHint.textContent = ok ? '' : 'Must be a valid http(s) URL.';
  return ok;
}

function validateContract(): boolean {
  const addr = normalizeAddress(contractInput.value);
  const ok = addr !== null;
  contractInput.classList.toggle('invalid', !ok && contractInput.value.trim() !== '');
  contractHint.className = ok ? 'hint ok' : 'hint err';
  contractHint.textContent =
    contractInput.value.trim() === '' ? '' : ok ? `Checksummed: ${addr}` : 'Invalid address.';
  return ok;
}

function updateEstimate(): void {
  const from = parseBlockNumber(fromBlockInput.value);
  const to = parseBlockNumber(toBlockInput.value);
  if (from === null || to === null) {
    scanEstimate.textContent = '';
    return;
  }
  if (to < from) {
    scanEstimate.textContent = '"To block" must be ≥ "from block".';
    return;
  }
  const count = to - from + 1n;
  scanEstimate.textContent = `≈ ${count.toLocaleString()} block request(s) (one per block). Large ranges are slow and may hit RPC rate limits.`;
}

rpcInput.addEventListener('input', () => {
  validateRpc();
  persist();
});
contractInput.addEventListener('input', () => {
  validateContract();
  persist();
});
chainSelect.addEventListener('change', persist);
rememberRpc.addEventListener('change', persist);
for (const inp of [fromBlockInput, toBlockInput, concurrencyInput]) {
  inp.addEventListener('input', () => {
    updateEstimate();
    persist();
  });
}

validateRpc();
validateContract();
updateEstimate();

// ---- Build a client from current inputs (or report why we can't) ----
function buildClient(): { client: RoleClient; chainKey: ChainKey } | null {
  if (!validateRpc()) {
    setStatus('Enter a valid RPC URL.', 'err');
    return null;
  }
  if (!isChainKey(chainSelect.value)) {
    setStatus('Select a chain.', 'err');
    return null;
  }
  const chainKey = chainSelect.value;
  return { client: makeClient(chainKey, rpcInput.value.trim()), chainKey };
}

function setStatus(text: string, kind: '' | 'ok' | 'err' = ''): void {
  statusEl.textContent = text;
  statusEl.className = kind ? `status ${kind}` : 'status';
}

// ---- "Last N blocks → latest" helper ----
useLatestBtn.addEventListener('click', async () => {
  const built = buildClient();
  if (!built) return;
  useLatestBtn.disabled = true;
  setStatus('Fetching latest block…');
  try {
    const latest = await built.client.getBlockNumber();
    const from = latest > DEFAULT_BLOCK_WINDOW ? latest - DEFAULT_BLOCK_WINDOW : 0n;
    fromBlockInput.value = String(from);
    toBlockInput.value = String(latest);
    updateEstimate();
    persist();
    setStatus(`Latest block is ${latest.toLocaleString()}.`, 'ok');
  } catch (e) {
    setStatus(`Failed to fetch latest block: ${errMsg(e)}`, 'err');
  } finally {
    useLatestBtn.disabled = false;
  }
});

// ---- Run analysis ----
let abort: AbortController | null = null;
let lastHolders: Holder[] = [];

runScanBtn.addEventListener('click', async () => {
  if (!validateContract()) {
    setStatus('Enter a valid contract address.', 'err');
    return;
  }
  const built = buildClient();
  if (!built) return;
  const contract = normalizeAddress(contractInput.value)!;

  const from = parseBlockNumber(fromBlockInput.value);
  const to = parseBlockNumber(toBlockInput.value);
  if (from === null || to === null || to < from) {
    setStatus('Enter a valid block range (from ≤ to).', 'err');
    return;
  }
  const concurrency = Math.max(1, Math.min(20, Number(concurrencyInput.value) || 6));

  const methodDefs = methods.getMethods().filter((m) => m.selector && (m.isGrant || m.isRevoke));
  if (methodDefs.length === 0) {
    setStatus('Define at least one valid grant/revoke method.', 'err');
    return;
  }

  abort = new AbortController();
  runScanBtn.disabled = true;
  cancelScanBtn.disabled = false;
  exportBtn.disabled = true;
  progress.show();

  try {
    setStatus('Scanning blocks…');
    const scan = await scanRange(
      built.client,
      contract,
      methodDefs,
      { fromBlock: from, toBlock: to, concurrency },
      (done, total) => progress.set(done, total),
      abort.signal,
    );

    setStatus(
      `Found ${scan.candidates.size} candidate pair(s) from ${scan.matchedActions} matched call(s). Verifying with hasRole…`,
    );

    const roleDefs = roles.getRoles();
    const holders = await verifyHolders({
      client: built.client,
      contract,
      hasRole: hasRole.getConfig(),
      candidates: scan.candidates,
      roles: roleDefs,
      roleNames: buildRoleNameMap(roleDefs),
    });

    lastHolders = holders;
    renderResults(resultsEl, holders, built.chainKey);
    exportBtn.disabled = holders.length === 0;

    const confirmed = holders.filter((h) => h.hasRoleConfirmed).length;
    setStatus(
      `Done. ${confirmed} current holder(s) confirmed across ${roleDefs.length || '—'} role(s); ${holders.length} pair(s) checked.`,
      'ok',
    );
  } catch (e) {
    if (e instanceof DOMException && e.name === 'AbortError') {
      setStatus('Scan cancelled.', '');
    } else {
      setStatus(`Error: ${errMsg(e)}`, 'err');
    }
  } finally {
    progress.hide();
    runScanBtn.disabled = false;
    cancelScanBtn.disabled = true;
    abort = null;
  }
});

cancelScanBtn.addEventListener('click', () => {
  abort?.abort();
  cancelScanBtn.disabled = true;
});

// ---- Export ----
exportBtn.addEventListener('click', () => {
  if (lastHolders.length === 0) return;
  const blob = new Blob([holdersToJson(lastHolders)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = el('a', { href: url, download: 'contract-roles.json' });
  document.body.append(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
});

function errMsg(e: unknown): string {
  if (e instanceof Error) return e.message.split('\n')[0]!;
  return String(e);
}

renderResults(resultsEl, [], 'base');
