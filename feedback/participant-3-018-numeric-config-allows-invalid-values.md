# Numeric strategy configuration accepts unsafe out-of-domain values

Severity: normal
Area: app

## Steps to reproduce

1. Set `PERP_LEVERAGE=0`, `PERP_TAKE_PROFIT_PCT=-5`, or `PERP_TICK_MS=-1`.
2. Start the relevant strategy in dry-run or preflight mode.
3. Observe configuration acceptance and runtime behavior.

## Expected

Values should be checked against their domain before a strategy starts: leverage and notional must be positive, percentage knobs must be non-negative where required, and polling intervals must be positive.

## Actual

`envNum` rejects only non-finite values. Zero and negative values are accepted. A negative tick/refresh interval reaches the sleep loop and can produce a hot loop; zero leverage is passed into leverage setup; negative exit percentages invert or collapse protection levels.

## Evidence

Run from the repository root: `npm ci --ignore-scripts`, `npm run setup`, then `npm run reproduce -- 018`.
Saved input/output: [reproduction 018](../research/evidence/reproductions/018.json). Runner: [tools/reproduce.mjs](../tools/reproduce.mjs).
Transaction hash: not applicable to this offline reproduction; fixture hashes are placeholders, not public-chain transactions.
Pinned source: [packages/perp-core/src/config.ts:49](https://github.com/somnia-chain/dreamdex-bot-kit/blob/4e75896896e024c03e2033d5920514f249998cd6/packages/perp-core/src/config.ts#L49).

Pinned source `packages/perp-core/src/config.ts:49-63` and strategy top-level reads such as `perp-starter/src/index.ts:57-62`. A deterministic parser fixture accepts all three values without an error; no network is required.

## Environment

SDK: `@somnia-chain/markets-sdk@0.32.1` (installed; these checks are configuration-only).
Network: Somnia Tokyo/Hideki identity (`50383`); report 016 intentionally supplies mismatched Shannon ID `50312`. No RPC request is sent for this check.
Wallet: not applicable; no wallet or signer is used by this configuration reproduction.

Pinned bot-kit commit `4e75896896e024c03e2033d5920514f249998cd6`.

## Impact

A malformed deployment can run a strategy with invalid risk parameters, including an effectively unthrottled polling loop or inverted TP/SL math. The operator gets no actionable startup error.

## Root cause

One generic numeric parser is used for parameters with different domains, but it validates only `Number.isFinite`.

## Suggested fix

Add typed validators (`positive`, `nonNegative`, bounded percentage, integer milliseconds) at config construction and include the variable name, accepted range, and received value in the error. Add startup tests for every perp strategy.

## Duplicate-scope analysis

This is separate from the invalid-side finding: it concerns numeric domain validation across strategy settings, not string normalization or direction selection. It is also not a market-size or minimum-lot issue; the invalid values are accepted before sizing.

## Evidence limitations

The report demonstrates acceptance and the resulting local control flow; it does not claim that every invalid value reaches a mined transaction because some later protocol calls may reject it.

