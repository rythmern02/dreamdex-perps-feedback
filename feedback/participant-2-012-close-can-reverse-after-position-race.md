# Close path sends an ordinary market order and can reverse after a position race

Severity: major
Area: app

## Steps to reproduce

1. Call `closePosition` for a long position.
2. Return a positive `closedQuantity` from the close preview.
3. Return the long position from the first position read, then simulate the position shrinking or flattening before the order reaches the venue.
4. Inspect the outgoing order.

## Expected

A close operation must be reduce-only at the venue, or re-read/revalidate immediately before submission and abort if the position is no longer sufficient.

## Actual

The helper derives the opposite side and submits a normal `ORDER_TYPE.MARKET` order. There is no reduce-only flag in `PlaceArgs` or in the call to `placePerp`. If the position was filled, closed, or changed between the preview/read and submission, the residual order can open the opposite position instead of only reducing exposure.

## Evidence

Run from the repository root: `npm ci --ignore-scripts`, `npm run setup`, then `npm run reproduce -- 012`.
Saved input/output: [reproduction 012](../research/evidence/reproductions/012.json). Runner: [tools/reproduce.mjs](../tools/reproduce.mjs).
Transaction hash: not applicable to this offline reproduction; fixture hashes are placeholders, not public-chain transactions.
Pinned source: [packages/perp-core/src/orders.ts:276](https://github.com/somnia-chain/dreamdex-bot-kit/blob/4e75896896e024c03e2033d5920514f249998cd6/packages/perp-core/src/orders.ts#L276).

Pinned source `packages/perp-core/src/orders.ts:276-297`: side is derived from the separately read position, then `placePerp` receives only side, price, quantity, and market order type. A controlled race fixture records a sell for the preview quantity after the position is changed to zero; no reducing intent is present in the outgoing payload.

## Environment

SDK: `@somnia-chain/markets-sdk@0.32.1`.
Network: Somnia Tokyo/Hideki testnet identity, chain ID `50383`, modeled offline unless the local-fork evidence explicitly says otherwise.
Wallet: `0x0000000000000000000000000000000000000001` is a synthetic fixture address, not a funded participant wallet; no private key is required.

Pinned bot-kit commit `4e75896896e024c03e2033d5920514f249998cd6`; `@somnia-chain/markets-sdk@0.32.1`.

## Impact

Take-profit, stop-loss, and guard actions can flip an account rather than close it. This is a high-severity workflow failure because the operator believes the bot is reducing risk while it may create fresh exposure.

## Root cause

The close helper uses a multi-read snapshot but does not bind the write to reduce-only semantics or validate that the account state still matches the snapshot.

## Suggested fix

Expose the SDK's reduce-only order path for perps and use it for every close. If the protocol cannot express this for the chosen order type, re-read position state and enforce a nonce/version or quantity cap before sending, then reconcile fills and repeat until flat.

## Duplicate-scope analysis

This is not the existing short-bracket-side report: it affects dynamically generated close orders after a valid position read, regardless of long/short bracket percentages. It is also separate from partial-fill handling because the failure can occur before any fill is returned.

## Evidence limitations

The race is deterministic in the fixture but not a claim that every live transaction will reverse; it demonstrates that the outgoing request lacks the invariant needed to prevent reversal.

