# Maker refresh failure exits without cancelling existing quotes

Severity: major
Area: app

## Steps to reproduce

1. Start the maker strategy with an empty position; allow it to place both bid and ask quotes.
2. On the next cycle, make the market refresh/read fail before the placement try/catch is entered.
3. Observe the process exit and the cancellation/shutdown calls.

## Expected

Any exit after quotes have been placed should attempt to cancel tracked orders and close down in a `finally`/shutdown path, even when a refresh read fails.

## Actual

The controlled failure places two quotes, then exits with failure. It performs zero cancellations and zero shutdown callbacks. The healthy control performs two cancellations and one shutdown callback.

## Evidence

Run from the repository root: `npm ci --ignore-scripts`, `npm run setup`, then `npm run reproduce -- 007`.
Saved input/output: [reproduction 007](../research/evidence/reproductions/007.json). Runner: [tools/reproduce.mjs](../tools/reproduce.mjs).
Transaction hash: not applicable to this offline reproduction; fixture hashes are placeholders, not public-chain transactions.

- Controlled reproduction: `research/evidence/reproductions/007.json`.
- Source: `research/upstream/dreamdex-bot-kit/strategies/perp-maker/src/index.ts:108-114` and cleanup at `190-196`.
- The quote receipts are fixture responses; no live resting orders were created.

## Environment

SDK: `@somnia-chain/markets-sdk@0.32.1`.
Network: Somnia Tokyo/Hideki testnet identity, chain ID `50383`, modeled offline unless the local-fork evidence explicitly says otherwise.
Wallet: `0x0000000000000000000000000000000000000001` is a synthetic fixture address, not a funded participant wallet; no private key is required.

Pinned bot-kit commit `4e75896896e024c03e2033d5920514f249998cd6`; SDK `@somnia-chain/markets-sdk@0.32.1`; controlled BTC-PERP fixture.

## Impact

In a real run, quotes that were successfully placed before the refresh error can remain active after the process has stopped, allowing unattended fills.

## Root cause

The market refresh is outside the scoped placement catch, while cancellation and shutdown occur only after the loop and are not protected by `finally`.

## Suggested fix

Track live quote IDs durably and put cancellation plus shutdown in an outer `try/finally` around the loop. Make cleanup best-effort and observable, including when market refresh fails.

## Duplicate-scope analysis

This is distinct from cancellation being attempted but losing tracking after a cancellation error: here cancellation is never attempted because the refresh failure escapes first.

## Evidence limitations

The harness controls the read failure and observes cleanup calls; it does not leave public-chain quotes behind.
