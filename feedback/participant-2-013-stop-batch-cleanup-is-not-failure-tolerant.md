# Stop cleanup fails as one batch when any stop ID is stale

Severity: major
Area: app

## Steps to reproduce

1. Let the bot observe two stop IDs for a bracket.
2. Make one ID execute, expire, or be removed between the read and cleanup; leave the sibling pending.
3. Let `cancelStops` submit both IDs in one `cancelPerpStopOrders` call.

## Expected

Cleanup should cancel every still-live leg and tolerate already-terminal IDs, leaving no unintentional stop armed and reclaiming the associated SOMI where possible.

## Actual

The batch call is all-or-nothing. A stale ID reverts the whole transaction, so the still-pending sibling is not cancelled. The caller does not retry individual IDs or re-read the remaining stops.

## Evidence

Run from the repository root: `npm ci --ignore-scripts`, `npm run setup`, then `npm run reproduce -- 013`.
Saved input/output: [reproduction 013](../research/evidence/reproductions/013.json). Runner: [tools/reproduce.mjs](../tools/reproduce.mjs).
Transaction hash: not applicable to this offline reproduction; fixture hashes are placeholders, not public-chain transactions.
Pinned source: [packages/perp-core/src/stops.ts:113](https://github.com/somnia-chain/dreamdex-bot-kit/blob/4e75896896e024c03e2033d5920514f249998cd6/packages/perp-core/src/stops.ts#L113).

Pinned source `packages/perp-core/src/stops.ts:113-132` passes all observed IDs directly to one batch call. The source comment confirms the stale-ID revert behavior. A controlled registry fixture with `[stale, live]` rejects the batch and records that the live ID remains pending.

## Environment

SDK: `@somnia-chain/markets-sdk@0.32.1`.
Network: Somnia Tokyo/Hideki testnet identity, chain ID `50383`, modeled offline unless the local-fork evidence explicitly says otherwise.
Wallet: `0x0000000000000000000000000000000000000001` is a synthetic fixture address, not a funded participant wallet; no private key is required.

Pinned bot-kit commit `4e75896896e024c03e2033d5920514f249998cd6`; perp stop registry path.

## Impact

After a position is closed or a stop leg races with cleanup, the other leg can remain armed, fire against a later position, and continue locking SOMI. This is especially dangerous across bot restarts when the account is reused.

## Root cause

The cleanup helper assumes the indexer snapshot is transactionally current and treats a batch cancellation as the complete recovery operation.

## Suggested fix

Cancel each currently pending ID independently, or retry after removing IDs reported as terminal/not-found. Re-list stops after cleanup and surface any remaining pending IDs before shutdown.

## Duplicate-scope analysis

This is different from the terminal-stop-recovery report, which concerns a triggered stop that failed to place. It is also different from maker quote cancellation tracking: this finding is the bracket cleanup transaction's stale-ID atomicity.

## Evidence limitations

The stale-ID behavior is based on the pinned SDK/registry contract and a controlled rejection fixture; no live account was mutated.

