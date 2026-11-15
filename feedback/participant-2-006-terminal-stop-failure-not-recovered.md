# Terminal stop failure can leave an open position without protection

Severity: major
Area: app

## Steps to reproduce

1. Start the starter strategy with an open long position and arm a TP/SL bracket.
2. Return the stop-loss leg as terminal `TRIGGER_FAILED` with `dropReason: NoFill`, while the TP leg remains pending and unlinked.
3. Set the mark below the original stop-loss and run subsequent monitoring ticks.

## Expected

The strategy should detect the terminal failure, re-arm a complete protective bracket, or take an explicit emergency action appropriate to the configured policy.

## Actual

The strategy requests only the default pending-stop view, does not observe the terminal failed leg, sees one remaining pending stop, and neither re-arms protection nor submits an emergency close. The position remains open while the mark is already below the original stop-loss.

## Evidence

Run from the repository root: `npm ci --ignore-scripts`, `npm run setup`, then `npm run reproduce -- 006`.
Saved input/output: [reproduction 006](../research/evidence/reproductions/006.json). Runner: [tools/reproduce.mjs](../tools/reproduce.mjs).
Transaction hash: not applicable to this offline reproduction; fixture hashes are placeholders, not public-chain transactions.

- Controlled reproduction: `research/evidence/reproductions/006.json`.
- SDK-supported terminal state classification: `research/upstream/dreamdex-bot-kit/packages/perp-core/src/stops.ts:151-159`.
- The state transition is injected as documented indexer rows; no live loss is claimed.

## Environment

SDK: `@somnia-chain/markets-sdk@0.32.1`.
Network: Somnia Tokyo/Hideki testnet identity, chain ID `50383`, modeled offline unless the local-fork evidence explicitly says otherwise.
Wallet: `0x0000000000000000000000000000000000000001` is a synthetic fixture address, not a funded participant wallet; no private key is required.

Pinned bot-kit commit `4e75896896e024c03e2033d5920514f249998cd6`; SDK `@somnia-chain/markets-sdk@0.32.1`; controlled BTC-PERP fixture.

## Impact

Once a protective leg fails without filling, the strategy can continue operating as if the bracket were intact while the position has no effective stop-loss.

## Root cause

The monitoring loop uses `pendingStops()` only and has no terminal-history/failure recovery path.

## Suggested fix

Read terminal stop outcomes or an equivalent event/history stream, distinguish `TRIGGER_FAILED/NoFill` from ordinary completed exits, and make recovery idempotent. Revalidate the position and price before re-arming or flattening.

## Duplicate-scope analysis

This concerns recovery after a terminal stop failure. It is not the unrelated-stop suppression defect and not a claim about an observed mainnet loss.

## Evidence limitations

This is a controlled state-transition reproduction using SDK-supported terminal states, not proof that a historical deployment lost funds.
