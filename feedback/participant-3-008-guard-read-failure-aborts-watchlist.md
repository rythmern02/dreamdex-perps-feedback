# One guard health-read failure aborts protection for every market

Severity: major
Area: app

## Steps to reproduce

1. Configure the guard to watch two markets with open positions.
2. Make the first market’s margin/health read throw a transient error.
3. Observe whether the second market is evaluated and whether reductions are sent.

## Expected

A transient read failure for one market should be isolated, retried with bounded backoff, and should not prevent evaluation of the remaining watchlist. The guard must not invent a health value.

## Actual

The first health read throws outside the per-market action try/catch. The process exits after the first failure, the later market is never evaluated, and zero reductions are sent. The healthy control evaluates both BTC and ETH and sends two reductions.

## Evidence

Run from the repository root: `npm ci --ignore-scripts`, `npm run setup`, then `npm run reproduce -- 008`.
Saved input/output: [reproduction 008](../research/evidence/reproductions/008.json). Runner: [tools/reproduce.mjs](../tools/reproduce.mjs).
Transaction hash: not applicable to this offline reproduction; fixture hashes are placeholders, not public-chain transactions.

- Controlled reproduction: `research/evidence/reproductions/008.json`.
- Source: `research/upstream/dreamdex-bot-kit/strategies/perp-guard/src/index.ts:127-163`; the health read at lines 137-142 precedes the scoped try/catch.
- No chain writes were used; reductions were recorded by the fixture.

## Environment

SDK: `@somnia-chain/markets-sdk@0.32.1`.
Network: Somnia Tokyo/Hideki testnet identity, chain ID `50383`, modeled offline unless the local-fork evidence explicitly says otherwise.
Wallet: `0x0000000000000000000000000000000000000001` is a synthetic fixture address, not a funded participant wallet; no private key is required.

Pinned bot-kit commit `4e75896896e024c03e2033d5920514f249998cd6`; SDK `@somnia-chain/markets-sdk@0.32.1`; controlled BTC-PERP and ETH-PERP fixtures.

## Impact

One RPC/indexer outage can stop protection across the entire watchlist, increasing liquidation exposure for markets that were never evaluated.

## Root cause

Market health and position reads are outside the per-market error boundary, so a single rejected promise reaches the process-level handler.

## Suggested fix

Wrap each market’s read/evaluate/act cycle, retry transient reads with a bounded policy, continue to the next market, and log the market as unknown when reads fail.

## Duplicate-scope analysis

This is a multi-market resilience defect in guard health reads, distinct from startup preflight and from failures while sending a reduction order.

## Evidence limitations

The error is injected as a transient fixture exception; no historical liquidation or public-chain outage is claimed.
