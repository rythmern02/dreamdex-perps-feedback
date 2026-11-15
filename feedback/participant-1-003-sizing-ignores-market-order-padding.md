# Order sizing ignores the price padding later submitted for market orders

Severity: major
Area: SDK

## Steps to reproduce

1. Use pinned bot-kit commit `4e75896896e024c03e2033d5920514f249998cd6` with SDK `@somnia-chain/markets-sdk@0.32.1`.
2. Give the account exactly 5 USDso of unlocked collateral and request a long market order near the collateral ceiling.
3. Let `sizeOrder()` size at the read price, then let `placePerp()` apply its default 20-bps long-side padding.
4. Submit the resulting quantity at the padded price.

## Expected

Sizing should use the exact price that will be sent, or placement should revalidate and resize before submitting.

## Actual

The bot sizes 297,000 raw base units at 67,168.5 USDso, where the margin preview is sufficient. It then submits 297,000 at 67,302.8 USDso after approximately 19.99 bps padding. The deployed pool rejects the order because the padded quote is insufficient. Re-sizing at the padded price produces 275,000 units and is accepted by the deployed pool simulation.

## Evidence

Run from the repository root: `npm ci --ignore-scripts`, `npm run setup`, then `npm run reproduce -- 003`.
Saved input/output: [reproduction 003](../research/evidence/reproductions/003.json). Runner: [tools/reproduce.mjs](../tools/reproduce.mjs).
Transaction hash: not applicable to this offline reproduction; fixture hashes are placeholders, not public-chain transactions. The separate [local-fork capture](../research/evidence/fork-sizing.json) includes hashes labeled local-fork-only.

- Successful local-fork artifact: `research/evidence/fork-sizing.json` and `research/evidence/fork-sizing.console.txt`.
- Fork source: `https://api.hideki2.infra.testnet.somnia.network`, pinned block `49980933`, chain ID `50383`; all writes were local fork-only.
- Unpadded quote: sufficient, lock `4.987261125` USDso.
- Padded quote: insufficient, lock `5.395867354602190125` USDso; shortfall `0.395867354602190125` USDso.
- Deployed pool simulation rejected with `ERC20: transfer amount exceeds balance`; the repaired quantity simulation was accepted. The local revert transaction was mined as reverted.

## Environment

SDK: `@somnia-chain/markets-sdk@0.32.1`.
Network: Somnia Tokyo/Hideki testnet identity, chain ID `50383`, modeled offline unless the local-fork evidence explicitly says otherwise.
Wallet: `0x0000000000000000000000000000000000000001` is a synthetic fixture address, not a funded participant wallet; no private key is required.

Pinned bot-kit commit above; SDK `@somnia-chain/markets-sdk@0.32.1`; Somnia Hideki fork, chain ID 50383; fixture account only.

## Impact

Near a collateral ceiling, valid-looking bot sizing is followed by a reverted order. Strategies may miss entries and repeatedly retry a quantity that cannot be funded at the actual submitted price.

## Root cause

`sizeOrder()` receives the unpadded price, while `placePerp()` applies default taker padding without recomputing quantity.

## Suggested fix

Apply slippage/padding before sizing, or have one placement path compute the final price and pass it into the sizing preflight. Add a regression test requiring the unpadded quote to be sufficient, padded quote to be sufficient after the fix, and the deployed-pool simulation not to revert.

## Duplicate-scope analysis

This is the price/quantity consistency defect. It is distinct from order-type semantics, same-side maker caps, and minimum-quantity checks.

## Evidence limitations

The chain transactions are local Anvil fork transactions and must not be presented as public-chain transactions. They demonstrate deployed bytecode behavior at the pinned block, not a historical user loss.
