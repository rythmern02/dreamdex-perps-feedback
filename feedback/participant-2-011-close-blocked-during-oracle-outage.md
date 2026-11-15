# Close workflow refuses reducing orders during an unpriceable oracle outage

Severity: major
Area: app

## Steps to reproduce

1. Use the shared `closePosition` helper with an existing position and a configured write context.
2. Make `previewPerpClosePnl` return `{ priceable: false }`, while the position has a non-zero contract size and the order book has a counterparty.
3. Call `closePosition(ctx, market, account)` directly and inspect outgoing orders. This isolates the helper: the starter watcher has its own live-mark gate that may prevent it from calling the helper during an outage.

## Expected

The bot should size the close from the position's actual contracts and submit a reduce-only/reducing order. The source comments explicitly state that reducing orders remain accepted while the mark is stale.

## Actual

`closePosition` returns before reading the position or placing anything when the close preview is unpriceable. The bot logs that the user must close manually, although the venue still exposes the exit path.

## Evidence

Run from the repository root: `npm ci --ignore-scripts`, `npm run setup`, then `npm run reproduce -- 011`.
Saved input/output: [reproduction 011](../research/evidence/reproductions/011.json). Runner: [tools/reproduce.mjs](../tools/reproduce.mjs).
Transaction hash: not applicable to this offline reproduction; fixture hashes are placeholders, not public-chain transactions.
Pinned source: [packages/perp-core/src/orders.ts:240](https://github.com/somnia-chain/dreamdex-bot-kit/blob/4e75896896e024c03e2033d5920514f249998cd6/packages/perp-core/src/orders.ts#L240).

Pinned source `packages/perp-core/src/orders.ts:240-255` checks `preview.priceable` and returns `{ sent:false }`; the position read and order submission are below that return. A controlled fixture with a stale snapshot, a long position, and a populated bid records zero outgoing close orders.

## Environment

SDK: `@somnia-chain/markets-sdk@0.32.1`.
Network: Somnia Tokyo/Hideki testnet identity, chain ID `50383`, modeled offline unless the local-fork evidence explicitly says otherwise.
Wallet: `0x0000000000000000000000000000000000000001` is a synthetic fixture address, not a funded participant wallet; no private key is required.

Pinned bot-kit commit `4e75896896e024c03e2033d5920514f249998cd6`; perp strategies on Hideki/Shannon.

## Impact

During an oracle outage, a running bot can leave a position exposed precisely when the venue permits risk-reducing exits. This defeats the documented recovery behavior and can turn a temporary pricing outage into avoidable liquidation or loss.

## Root cause

The close helper treats a PnL preview as a prerequisite even though preview priceability is not required to know the position size for a reducing order.

## Suggested fix

Read the signed position first, derive the close quantity from contracts, align it to the lot/minimum rules, and submit an explicitly reducing order without requiring a priceable PnL preview. Keep the preview only for optional logging.

## Duplicate-scope analysis

This is distinct from the guard's first-read abort finding: this path receives a valid position and book but intentionally refuses the close because the preview is unpriceable. It is also distinct from the market-order padding finding, which occurs after an order is constructed.

## Evidence limitations

The venue acceptance statement is taken from the pinned source comments and reducing-order API contract; the reproduction does not send a live order during an outage.

