# Market orders ignore explicit FOK and post-only semantics

Severity: major
Area: SDK

## Steps to reproduce

1. Use `@somnia-chain/markets-sdk@0.32.1` and a perp market whose top-of-book has less available quantity than requested.
2. Call `createOrder(symbol, "limit", "buy", amount, price, { timeInForce: "FOK" })`.
3. Call `createOrder(symbol, "market", "buy", amount, undefined, { timeInForce: "FOK" })`.
4. Call `createOrder(symbol, "market", "buy", amount, undefined, { postOnly: true })`.

## Expected

The explicit execution constraint should be preserved. FOK should fill entirely or reject; post-only should never take liquidity. If `market` is intentionally incompatible with these constraints, the SDK should reject the conflicting request instead of silently changing it.

## Actual

`createOrder()` selects `MARKET` as soon as `type === "market"`, before checking `timeInForce` or `postOnly`. The limit/FOK control rejects when the full amount is unavailable. Market/FOK is encoded as MARKET/IOC and partially fills, while market/post-only is also encoded as MARKET and can take liquidity.

## Evidence

Run from the repository root: `npm ci --ignore-scripts`, `npm run setup`, then `npm run reproduce -- 001`.
Saved input/output: [reproduction 001](../research/evidence/reproductions/001.json). Runner: [tools/reproduce.mjs](../tools/reproduce.mjs).
Transaction hash: not applicable to this offline reproduction; fixture hashes are placeholders, not public-chain transactions.

- Controlled reproduction: `research/evidence/reproductions/001.json`.
- Source: `node_modules/@somnia-chain/markets-sdk/src/unified/exchange.ts:5105-5124` and the matching pinned `dist/unified/exchange.js`.
- No live order or chain write was used.

## Environment

SDK: `@somnia-chain/markets-sdk@0.32.1`.
Network: Somnia Tokyo/Hideki testnet identity, chain ID `50383`, modeled offline unless the local-fork evidence explicitly says otherwise.
Wallet: `0x0000000000000000000000000000000000000001` is a synthetic fixture address, not a funded participant wallet; no private key is required.

SDK `@somnia-chain/markets-sdk@0.32.1`; Somnia chain ID 50383 fixture; fixture addresses only.

## Impact

Callers relying on standard CCXT-style parameters can receive partial fills or become takers, changing fill, fee, and slippage behavior without an exception.

## Root cause

The market-type branch has precedence over the parameter-specific order-type mapping.

## Suggested fix

Validate conflicting combinations and preserve the requested semantic. For example, reject `type === "market"` with `postOnly`/`FOK`, or map the parameters first and document the allowed combinations. Add tests asserting the encoded order type and fill behavior.

## Duplicate-scope analysis

This combines FOK and post-only because both are one precedence bug in `createOrder()`; they are not separate reports. It is distinct from reports about order sizing, cancellation, or strategy behavior.

## Evidence limitations

The execution boundary is a controlled facade, not a live order. It proves the SDK encoding and resulting caller-visible behavior, not a historical mainnet fill.
