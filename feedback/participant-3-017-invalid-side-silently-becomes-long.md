# Invalid PERP_SIDE values silently default to long

Severity: normal
Area: app

## Steps to reproduce

1. Set `PERP_SIDE=shrt` (or any typo other than the exact string `short`).
2. Start `perp-starter` in dry-run mode.
3. Inspect the startup log and intended order side.

## Expected

Configuration should reject an unknown side and tell the operator to use `long` or `short`.

## Actual

The top-level expression maps every value except exact `short` to `long`. The bot logs `long` and its first intended order is a long, so a typo changes the trading direction silently.

## Evidence

Run from the repository root: `npm ci --ignore-scripts`, `npm run setup`, then `npm run reproduce -- 017`.
Saved input/output: [reproduction 017](../research/evidence/reproductions/017.json). Runner: [tools/reproduce.mjs](../tools/reproduce.mjs).
Transaction hash: not applicable to this offline reproduction; fixture hashes are placeholders, not public-chain transactions.
Pinned source: [strategies/perp-starter/src/index.ts:53](https://github.com/somnia-chain/dreamdex-bot-kit/blob/4e75896896e024c03e2033d5920514f249998cd6/strategies/perp-starter/src/index.ts#L53).

Pinned source `strategies/perp-starter/src/index.ts:53-62`: `... === "short" ? "short" : "long"`. In a dry-run fixture with `PERP_SIDE=shrt`, the strategy logs long and produces the long-side intent.

## Environment

SDK: `@somnia-chain/markets-sdk@0.32.1`.
Network: Somnia Tokyo/Hideki testnet identity, chain ID `50383`, modeled offline unless the local-fork evidence explicitly says otherwise.
Wallet: `0x0000000000000000000000000000000000000001` is a synthetic fixture address, not a funded participant wallet; no private key is required.

Pinned bot-kit commit `4e75896896e024c03e2033d5920514f249998cd6`.

## Impact

An onboarding or deployment typo can create the opposite directional exposure while all health checks pass. Dry-run review is also misleading because it reports the silently substituted value rather than the supplied invalid value.

## Root cause

The parser uses a convenience fallback instead of validating the closed set of allowed values.

## Suggested fix

Parse `long` and `short` explicitly and throw for every other non-empty value. Log the raw configuration and normalized value in dry-run preflight.

## Duplicate-scope analysis

This is not the existing short-bracket percentage reversal report. That issue occurs with a valid `short` configuration and wrong trigger math; this finding occurs before trading because invalid input is silently converted to long.

## Evidence limitations

The reproduction is dry-run only and does not submit an order.

