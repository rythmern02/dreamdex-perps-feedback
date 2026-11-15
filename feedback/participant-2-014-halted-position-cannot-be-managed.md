# Starter cannot manage an existing position after its market becomes halted

Severity: major
Area: app

## Steps to reproduce

1. Model an existing position on a market whose registry row has become `active:false`.
2. Restart `perp-starter` with that market as `PERP_SYMBOL`.
3. Observe the initial `requireMarket` call.

## Expected

A strategy with an existing position should resolve the market, report its halted state, and continue with safe close/recovery behavior. It must not confuse “not active for opening” with “not addressable for management.”

## Actual

`requireMarket` defaults to `includeHalted:false`; `perp-starter` calls it without the option. The inactive market is filtered out and startup throws “does not match a live perp market,” so the strategy cannot manage or close the existing position. `perp-guard` already opts into halted markets, demonstrating the required distinction.

## Evidence

Run from the repository root: `npm ci --ignore-scripts`, `npm run setup`, then `npm run reproduce -- 014`.
Saved input/output: [reproduction 014](../research/evidence/reproductions/014.json). Runner: [tools/reproduce.mjs](../tools/reproduce.mjs).
Transaction hash: not applicable to this offline reproduction; fixture hashes are placeholders, not public-chain transactions.
Pinned source: [packages/perp-core/src/markets.ts:83](https://github.com/somnia-chain/dreamdex-bot-kit/blob/4e75896896e024c03e2033d5920514f249998cd6/packages/perp-core/src/markets.ts#L83).

Pinned source `packages/perp-core/src/markets.ts:83-95,105-120` and `strategies/perp-starter/src/index.ts:64-70`. A fixture returning the configured swap with `active:false` causes starter resolution to throw, while the same market resolves when `includeHalted:true` is used.

## Environment

SDK: `@somnia-chain/markets-sdk@0.32.1`.
Network: Somnia Tokyo/Hideki testnet identity, chain ID `50383`, modeled offline unless the local-fork evidence explicitly says otherwise.
Wallet: `0x0000000000000000000000000000000000000001` is a synthetic fixture address, not a funded participant wallet; no private key is required.

Pinned bot-kit commit `4e75896896e024c03e2033d5920514f249998cd6`; any perp market whose active gate changes after entry.

## Impact

A restart or refresh when the market row becomes inactive can leave an already-open position unmanaged. The operator gets a misleading configuration error instead of a recovery action. The reproduction establishes the `active:false` path; it does not establish that every restricted or close-only state maps to that flag.

## Root cause

Market discovery uses one “active” filter for both opening and position-management workflows.

## Suggested fix

Resolve configured symbols with `includeHalted:true`, then gate only opening/quoting actions on `active` or `restricted`. Add an explicit “halted/close-only; managing existing position” state and regression test.

## Duplicate-scope analysis

This is not the existing “starter manages an existing position with configured side” report. That issue concerns side selection; this one prevents market resolution entirely when the market transitions inactive.

## Evidence limitations

The fixture models the market registry's documented `active` flag; it does not require a live halt event.

