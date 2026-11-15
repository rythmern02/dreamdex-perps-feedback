# Funding strategy opens exposure from an unqualified stale fallback after live read failure

Severity: major
Area: app

## Steps to reproduce

1. Set the indexed market row to a positive funding rate, which makes shorts the paying-side strategy target.
2. Make the fresh `getPerpState()` read return a negative funding rate, which makes longs the paying-side target.
3. Run once with the fresh read succeeding, then once with it failing.

## Expected

When the live pool read fails, the strategy should expose the source and age of the funding value and block new entries unless the fallback is explicitly fresh and approved for trading decisions.

## Actual

`liveFunding()` catches the pool-read error and returns the indexed market row as `known: true`. The successful live read opens long for the negative fresh rate; the failed live read silently falls back to the positive indexed rate and opens short.

## Evidence

Run from the repository root: `npm ci --ignore-scripts`, `npm run setup`, then `npm run reproduce -- 009`.
Saved input/output: [reproduction 009](../research/evidence/reproductions/009.json). Runner: [tools/reproduce.mjs](../tools/reproduce.mjs).
Transaction hash: not applicable to this offline reproduction; fixture hashes are placeholders, not public-chain transactions.

- Controlled reproduction: `research/evidence/reproductions/009.json`.
- Source: `research/upstream/dreamdex-bot-kit/packages/perp-core/src/funding.ts:65-79`; entry proceeds at `strategies/perp-funding/src/index.ts:92-148`.
- The indexed and fresh rates, and both resulting orders, are controlled fixtures; no live order was sent.

## Environment

SDK: `@somnia-chain/markets-sdk@0.32.1`.
Network: Somnia Tokyo/Hideki testnet identity, chain ID `50383`, modeled offline unless the local-fork evidence explicitly says otherwise.
Wallet: `0x0000000000000000000000000000000000000001` is a synthetic fixture address, not a funded participant wallet; no private key is required.

Pinned bot-kit commit `4e75896896e024c03e2033d5920514f249998cd6`; SDK `@somnia-chain/markets-sdk@0.32.1`; controlled BTC-PERP fixture.

## Impact

A temporary RPC/indexer failure can cause a new position to be opened in the opposite funding direction from the current pool state. The resulting exposure also carries normal market risk.

## Root cause

The fallback erases the distinction between a fresh pool reading and an indexed snapshot, returning `known: true` without source or freshness metadata.

## Suggested fix

Return source, observed-at block/time, and freshness metadata. On live-read failure, log the degraded state and block new entries; optionally permit only explicit, bounded-age fallback for non-trading display.

## Duplicate-scope analysis

This is specifically silent stale-data use after a live funding read failure. It is not a funding cursor-stalling, market-row refresh, or order-placement report.

## Evidence limitations

This is the weakest major candidate: it demonstrates a controlled direction inversion and product risk, not a historical loss or proof that the indexed row is stale on every failure.
