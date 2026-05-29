# Contract Roles Analysis

A single-page, **fully client-side** tool to inspect the access-control roles of
a smart contract on **Ethereum, Base, Polygon, or Arbitrum**. Everything runs in
your browser — the only network traffic is to the **Etherscan V2 API**, using
the key you provide. One free key works across all four chains (BaseScan is
Etherscan V2 with `chainid=8453`).

Built with modern HTML + CSS + TypeScript. The only runtime library is
[`viem`](https://viem.sh); the build uses `esbuild` + `tsc` as devDependencies.

## What it does

Many AccessControl contracts (including the dev target on Base) are **not**
`AccessControlEnumerable`, so role members can't be enumerated on-chain. This
tool discovers them in two fast steps, both through the Etherscan V2 API:

1. **Event-log discovery** — queries the explorer's `getLogs` endpoint for the
   role events you configure (seeded with OpenZeppelin
   `RoleGranted` / `RoleRevoked`) over a block range. This is a handful of
   paginated requests instead of one-per-block, and because the contract emits
   the event regardless of how the call was routed, it **captures role changes
   made via Gnosis Safe, `multiSend`, or internal/relayer calls** — no
   transaction decoding or Safe unwrapping needed. `role`/`account` are read
   straight off the decoded log.
2. **`hasRole` verification** — every discovered `(role, account)` pair (plus any
   extra candidate addresses you paste) is checked against the contract's
   `hasRole` view method, batched via multicall3 and routed through the same API
   key via the explorer's `eth_call` proxy. `hasRole` is the authoritative
   source of *current* membership; discovery provides the candidates + provenance.

## Features / controls

- Etherscan V2 API key field (one key for all chains; not stored unless you opt in).
- Chain selector: Ethereum / Base / Polygon / Arbitrum.
- Contract address field (validated + checksummed).
- Editable table of **role events**, each with **Grant** / **Revoke**
  checkboxes and per-event role/account argument mapping. Seeded with the
  OpenZeppelin `RoleGranted` / `RoleRevoked` presets.
- Optional **role constants** editor (name ↔ `bytes32`, computed via
  `keccak256(name)` or pasted).
- Optional **membership check**: configurable `hasRole` signature plus an
  extra-candidate-addresses list.
- Block-range controls (leave "To block" blank for latest) with a pre-scan
  request estimate, live progress bar, and cancel.
- Results grouped per role with `hasRole` status, provenance tx links, and a
  JSON export.

## Local development

Requires Node 20+. Get a free Etherscan V2 API key at
<https://etherscan.io/apidashboard> (the same key works for Base, Polygon, and
Arbitrum).

```bash
npm install
# Prefill the API key field for convenience (dev only — never baked into prod builds):
DEV_API_KEY="$ETHERSCAN_API_KEY" npm run dev
```

Then open the printed `http://localhost:5173/` URL.

Try it with the dev contract on **Base**:
`0xF35f12c2556706b074d2dCeBF178DEB9003a358b` — keep the `RoleGranted` /
`RoleRevoked` presets, add `DEFAULT_ADMIN_ROLE` (and any named roles), pick a
block range (e.g. `0` → blank for latest), and run the analysis. Paste known admin/Safe
addresses as extra candidates to confirm roles granted via internal calls.

### Scripts

| Command | Description |
| --- | --- |
| `npm run dev` | Bundle + watch + serve `dist/` locally. |
| `npm run typecheck` | `tsc --noEmit` type gate. |
| `npm run build` | Type-check then produce the static `dist/`. |

## Deployment

Pushing to `main` triggers `.github/workflows/deploy.yml`, which builds and
publishes `dist/` to **GitHub Pages**. One-time setup: in the repository,
go to **Settings → Pages → Build and deployment → Source = GitHub Actions**.

Asset URLs are relative, so the project Pages path
(`https://<owner>.github.io/contract-roles-analysis/`) works with no extra
configuration.

## Known limitations

- **Requires an Etherscan V2 API key.** One free key covers all four supported
  chains; both discovery (`getLogs`) and the `hasRole` confirmation
  (`eth_call` proxy) go through it. Free-tier rate limits apply; the app
  throttles requests and surfaces any "Max rate limit reached" message.
- **Discovery sees only emitted events.** A contract must emit the role events
  you configure. Standard OpenZeppelin AccessControl always emits
  `RoleGranted` / `RoleRevoked`; for non-standard contracts, add the matching
  event signatures (indexed or not) to the events table.
- No on-chain enumeration for non-enumerable contracts — `hasRole` is the only
  authoritative current-state source; event discovery provides the candidates +
  provenance. Paste known addresses as extra candidates to confirm them directly.
- `topic0` collisions are possible in theory; decoding is guarded and argument
  shapes are checked.
