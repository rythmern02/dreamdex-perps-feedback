# Any pending stop can suppress protection for an existing position

Severity: major
Area: app

## Steps to reproduce

1. Start the starter strategy with an existing long position.
2. Return one unrelated pending opening buy stop for the same market/account.
3. Run the strategy with no protective bracket currently present.

## Expected

The strategy should determine whether a pending stop is a matching reduce-only bracket covering the current position. An unrelated opening stop should not count as protection.

## Actual

The strategy sees `pendingStops.length > 0` and creates no protective bracket. With an empty stop list, the same controlled position creates a two-leg bracket.

## Evidence

Run from the repository root: `npm ci --ignore-scripts`, `npm run setup`, then `npm run reproduce -- 005`.
Saved input/output: [reproduction 005](../research/evidence/reproductions/005.json). Runner: [tools/reproduce.mjs](../tools/reproduce.mjs).
Transaction hash: not applicable to this offline reproduction; fixture hashes are placeholders, not public-chain transactions.

- Controlled reproduction: `research/evidence/reproductions/005.json`.
- Source: `research/upstream/dreamdex-bot-kit/strategies/perp-starter/src/index.ts:162-187` and `packages/perp-core/src/stops.ts:136-138`.
- The pending stop and bracket responses are controlled SDK-shaped rows; no chain writes were used.

## Environment

SDK: `@somnia-chain/markets-sdk@0.32.1`.
Network: Somnia Tokyo/Hideki testnet identity, chain ID `50383`, modeled offline unless the local-fork evidence explicitly says otherwise.
Wallet: `0x0000000000000000000000000000000000000001` is a synthetic fixture address, not a funded participant wallet; no private key is required.

Pinned bot-kit commit `4e75896896e024c03e2033d5920514f249998cd6`; SDK `@somnia-chain/markets-sdk@0.32.1`; controlled BTC-PERP fixture.

## Impact

An account can hold an open position with no TP/SL protection even though the bot reports that a stop is already armed.

## Root cause

The guard checks only the count of pending stops, not intent, side, reduce-only/close behavior, linked pair, quantity, or position coverage.

## Suggested fix

Validate that a complete linked pair matches the position side, reduce-only intent, quantity, and market before suppressing arming. Otherwise cancel/ignore unrelated stops and create protection.

## Duplicate-scope analysis

This is the broad pending-stop classification defect. It is distinct from incorrect short trigger levels and failure to recover after a terminal leg failure.

## Evidence limitations

The test proves the strategy decision under controlled rows, not a historical unprotected loss.
