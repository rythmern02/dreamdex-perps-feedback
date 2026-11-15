# Starter arms TP/SL from a stale indexed mark after live mark failure

Severity: major
Area: app

## Steps to reproduce

1. Start `perp-starter` with no existing bracket and a position that needs protection.
2. Make `getPerpHealthSnapshot` throw or return no usable mark, while the market row still contains an older mark.
3. Observe the trigger prices passed to `armBracket`.

## Expected

If the pool mark cannot be read, the bot should remain unarmed and enter a clearly degraded state, or require an explicit operator override. Trigger levels must never be computed silently from a known-stale fallback.

## Actual

`liveMark` catches every read error and returns `undefined`. Starter then uses `markOf(market.info)` and arms the bracket anyway. The source itself says the row can lag by tens of minutes, so this fallback creates protection levels around a price the pool may not be using.

## Evidence

Run from the repository root: `npm ci --ignore-scripts`, `npm run setup`, then `npm run reproduce -- 015`.
Saved input/output: [reproduction 015](../research/evidence/reproductions/015.json). Runner: [tools/reproduce.mjs](../tools/reproduce.mjs).
Transaction hash: not applicable to this offline reproduction; fixture hashes are placeholders, not public-chain transactions.
Pinned source: [strategies/perp-starter/src/index.ts:170](https://github.com/somnia-chain/dreamdex-bot-kit/blob/4e75896896e024c03e2033d5920514f249998cd6/strategies/perp-starter/src/index.ts#L170).

Pinned source `packages/perp-core/src/markets.ts:203-221` and `strategies/perp-starter/src/index.ts:170-177`. A controlled fixture with row mark `100`, failed live read, and 2%/1% settings arms `102` and `99`; the expected safe result is no bracket.

## Environment

SDK: `@somnia-chain/markets-sdk@0.32.1`.
Network: Somnia Tokyo/Hideki testnet identity, chain ID `50383`, modeled offline unless the local-fork evidence explicitly says otherwise.
Wallet: `0x0000000000000000000000000000000000000001` is a synthetic fixture address, not a funded participant wallet; no private key is required.

Pinned bot-kit commit `4e75896896e024c03e2033d5920514f249998cd6`.

## Impact

The account can appear protected while both exits are materially displaced from the pool's mark. This can cause premature stops, missed take-profits, or a false sense of coverage during RPC/indexer degradation.

## Root cause

The helper collapses “unavailable” and “stale but present” into a value fallback at a safety-critical decision point.

## Suggested fix

Fail closed when arming a new bracket unless a fresh, priceable pool snapshot is available. If fallback is intentionally supported, require a maximum age and make the operator confirm the degraded mode; never silently use the row.

## Duplicate-scope analysis

This is distinct from the funding fallback report: that finding can choose a wrong funding direction. This finding arms wrong TP/SL trigger prices after a live mark failure, and it occurs in the starter's protection lifecycle.

## Evidence limitations

The reproduction is offline and does not assert a specific indexer lag duration; it demonstrates the unconditional fallback and resulting trigger calculation.

