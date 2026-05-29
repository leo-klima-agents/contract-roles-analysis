# Contract Roles Analysis

A single-page, **fully client-side** tool to inspect the access-control roles of
a smart contract on **Ethereum, Base, Polygon, or Arbitrum**. Everything runs in
your browser — the only network traffic is JSON-RPC to the endpoint you provide.

Built with modern HTML + CSS + TypeScript. The only runtime library is
[`viem`](https://viem.sh); the build uses `esbuild` + `tsc` as devDependencies.

## What it does

Many AccessControl contracts (including the dev target on Base) are **not**
`AccessControlEnumerable`, so role members can't be enumerated on-chain. This
tool also avoids `eth_getLogs` (commonly rate-limited). Instead it uses a
**hybrid discovery** strategy:

1. **Bounded block-range scan** — fetches each block in a configurable range
   (`eth_getBlockByNumber` with full transactions), and decodes the role-changing
   methods you configure (e.g. `grantRole` / `revokeRole` / `renounceRole`) out
   of transaction inputs. It also **unwraps Gnosis Safe `execTransaction` and
   `multiSend`** calls, so role changes routed through a Safe are captured.
2. **`hasRole` verification** — every discovered `(role, account)` pair (plus any
   extra candidate addresses you paste) is checked against the contract's
   `hasRole` view method, batched via multicall3. `hasRole` is the authoritative
   source of *current* membership; the scan provides discovery + provenance.

## Features / controls

- RPC URL field (matched to the selected chain; not stored unless you opt in).
- Chain selector: Ethereum / Base / Polygon / Arbitrum.
- Contract address field (validated + checksummed).
- Multi-select of **role-changing methods**, each with **Grant** / **Revoke**
  checkboxes and per-method role/account argument mapping. Seeded with the three
  OpenZeppelin presets.
- Optional **role constants** editor (name ↔ `bytes32`, computed via
  `keccak256(name)` or pasted).
- Optional **membership check**: configurable `hasRole` signature plus an
  extra-candidate-addresses list.
- Block-range + concurrency controls with a pre-scan request estimate, live
  progress bar, and cancel.
- Results grouped per role with `hasRole` status, provenance tx links, and a
  JSON export.

## Local development

Requires Node 20+.

```bash
npm install
# Prefill the RPC field for convenience (dev only — never baked into prod builds):
DEV_RPC_URL="$BASE_RPC_URL" npm run dev
```

Then open the printed `http://localhost:5173/` URL.

Try it with the dev contract on **Base**:
`0xF35f12c2556706b074d2dCeBF178DEB9003a358b` — keep the three OZ method presets,
add `DEFAULT_ADMIN_ROLE` (and any named roles), pick a small recent block range
("Last 2000 blocks → latest"), and run the analysis. Paste known admin/Safe
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

### Previewing a branch build (without GitHub Pages)

The same workflow runs on a push to **any** branch and publishes the built site
as a downloadable artifact, so you can try a branch's version before it reaches
Pages:

1. Open the **Actions** tab and click the workflow run for your branch (or the
   commit/PR's **Checks**).
2. In the run summary, download the **`static-site`** artifact from the
   **Artifacts** section.
3. Unzip it and open `index.html` in your browser. Asset paths are relative, so
   it works straight from the filesystem (`file://`) — no server needed.

Only `main` is deployed to Pages; branch runs just produce the downloadable
artifact (retained for 30 days).

## RPC providers

Works with any standard JSON-RPC HTTP endpoint for the selected chain —
Alchemy, QuickNode, Infura, public nodes, etc. The client deliberately sends one
plain request per call (no transport-level JSON-RPC array batching), because
some providers (e.g. certain QuickNode endpoints) reject array-batched bodies
and would otherwise fail with "HTTP request failed". `hasRole` reads are still
aggregated into a single `eth_call` via multicall3.

## Known limitations

- **Internal/relayer calls beyond Safe wrappers** may still be invisible to a
  top-level transaction scan. Mitigation: paste the address as a candidate so
  `hasRole` confirms it directly.
- **Block-scan cost** is one request per block; large ranges are slow and may hit
  RPC rate limits. Keep ranges bounded and tune concurrency.
- No `eth_getLogs` (by design) and no on-chain enumeration for non-enumerable
  contracts — `hasRole` is the only authoritative current-state source; the scan
  is discovery + provenance.
- 4-byte selector collisions are possible in theory; decoding is guarded and
  argument shapes are checked.
