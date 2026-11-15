# Starter strategy reverses take-profit and stop-loss percentages for shorts

Severity: major
Area: app

## Steps to reproduce

1. Run the starter strategy against a short BTC position at mark 100.
2. Set `TAKE_PROFIT_PCT=2` and `STOP_LOSS_PCT=1`.
3. Allow the strategy to arm its bracket.

## Expected

For a short, take-profit should be 98 (2% below 100) and stop-loss should be 101 (1% above 100).

## Actual

The strategy arms take-profit at 99 and stop-loss at 102. The long control correctly arms 102 and 99. The short branch swaps the already percentage-specific `up` and `down` values.

## Evidence

Run from the repository root: `npm ci --ignore-scripts`, `npm run setup`, then `npm run reproduce -- 004`.
Saved input/output: [reproduction 004](../research/evidence/reproductions/004.json). Runner: [tools/reproduce.mjs](../tools/reproduce.mjs).
Transaction hash: not applicable to this offline reproduction; fixture hashes are placeholders, not public-chain transactions.

- Controlled reproduction: `research/evidence/reproductions/004.json`.
- Source: `research/upstream/dreamdex-bot-kit/strategies/perp-starter/src/index.ts:170-177`.
- No chain writes were used; the fixture records outgoing stop parameters.

## Environment

SDK: `@somnia-chain/markets-sdk@0.32.1`.
Network: Somnia Tokyo/Hideki testnet identity, chain ID `50383`, modeled offline unless the local-fork evidence explicitly says otherwise.
Wallet: `0x0000000000000000000000000000000000000001` is a synthetic fixture address, not a funded participant wallet; no private key is required.

Pinned bot-kit commit `4e75896896e024c03e2033d5920514f249998cd6`; SDK `@somnia-chain/markets-sdk@0.32.1`; controlled BTC-PERP fixture.

## Impact

A short position can take profit too close and leave its stop farther away than configured, changing the strategy’s risk/reward and loss boundary.

## Root cause

`up` already contains the take-profit percentage and `down` already contains the stop-loss percentage, but the short branch assigns them in reverse.

## Suggested fix

For shorts assign `takeProfit = down` and `stopLoss = up`, then add long/short table-driven tests using unequal percentages.

## Duplicate-scope analysis

This is only the short percentage-direction defect. It does not cover bracket suppression or terminal-stop recovery.

## Evidence limitations

The reproduction records the strategy’s requested trigger levels; it does not arm a live stop.
