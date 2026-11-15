# CHAIN_ID override can bind a network's endpoints to a different chain

Severity: major
Area: app

## Steps to reproduce

1. Set `NETWORK=hideki` and `CHAIN_ID=50312` while leaving the default Hideki RPC, WebSocket, and indexer URLs.
2. Call `loadConfig()` and `makeChain()`.
3. Inspect the returned chain and exchange configuration.

## Expected

The selected network should determine its canonical chain ID, or an override must be validated against the selected network and rejected on mismatch. The `.env.example` says not to override this value.

## Actual

`loadConfig` accepts any finite `CHAIN_ID` and `makeChain` uses it directly. The process therefore labels Hideki endpoints as chain `50312` without an error.

## Evidence

Run from the repository root: `npm ci --ignore-scripts`, `npm run setup`, then `npm run reproduce -- 016`.
Saved input/output: [reproduction 016](../research/evidence/reproductions/016.json). Runner: [tools/reproduce.mjs](../tools/reproduce.mjs).
Transaction hash: not applicable to this offline reproduction; fixture hashes are placeholders, not public-chain transactions.
Pinned source: [packages/perp-core/src/config.ts:143](https://github.com/somnia-chain/dreamdex-bot-kit/blob/4e75896896e024c03e2033d5920514f249998cd6/packages/perp-core/src/config.ts#L143).

Pinned source `packages/perp-core/src/config.ts:143-178,181-190`. A pure configuration fixture accepts the mismatch and produces `network:"hideki", chainId:50312` with Hideki RPC/WS/indexer URLs.

## Environment

SDK: `@somnia-chain/markets-sdk@0.32.1` (installed; these checks are configuration-only).
Network: Somnia Tokyo/Hideki identity (`50383`); report 016 intentionally supplies mismatched Shannon ID `50312`. No RPC request is sent for this check.
Wallet: not applicable; no wallet or signer is used by this configuration reproduction.

Pinned bot-kit commit `4e75896896e024c03e2033d5920514f249998cd6`; default endpoint map has Hideki `50383` and Shannon `50312`.

## Impact

Wallet signatures, transaction chain IDs, cache/indexer assumptions, and operator diagnostics can refer to different networks. This can make writes fail unclearly or, if an override endpoint is also supplied, send an operator to an unintended chain.

## Root cause

Configuration validates only that the numeric value is finite, not that it agrees with the selected network's endpoint/deployment identity.

## Suggested fix

Remove the override for perps or accept only the canonical chain ID for `NETWORK`; additionally compare the RPC-reported chain ID during startup and print all endpoint identities in the preflight banner.

## Duplicate-scope analysis

This is not a generic SIWE chain-ID documentation issue. It is a concrete perp config path that accepts an internally inconsistent network/chain pair before any wallet or API request is made.

## Evidence limitations

The reproduction is configuration-only and intentionally performs no transaction.

