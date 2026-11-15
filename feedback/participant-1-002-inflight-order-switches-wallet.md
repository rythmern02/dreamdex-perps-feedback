# In-flight order can switch to a newly configured wallet

Severity: major
Area: SDK

## Steps to reproduce

1. Configure a `SomniaMarkets` instance with wallet A.
2. Start `createOrder()` and pause it while its asynchronous order-book read is pending.
3. Call `setSigner()` with wallet B before releasing the order-book read.
4. Release the read and allow `createOrder()` to finish.

## Expected

An operation should remain bound to the account selected when it began, or fail with an account-changed error. A caller should be able to reason about which wallet will sign an order from the operation’s initial intent.

## Actual

The pending operation resolves the trader after the asynchronous read. After `setSigner(B)`, it places through wallet B. The control with no signer change places through wallet A.

## Evidence

Run from the repository root: `npm ci --ignore-scripts`, `npm run setup`, then `npm run reproduce -- 002`.
Saved input/output: [reproduction 002](../research/evidence/reproductions/002.json). Runner: [tools/reproduce.mjs](../tools/reproduce.mjs).
Transaction hash: not applicable to this offline reproduction; fixture hashes are placeholders, not public-chain transactions.

- Controlled reproduction: `research/evidence/reproductions/002.json`.
- Source scope includes the pinned SDK `createOrder()`, `setSigner()`, and trader resolution in `node_modules/@somnia-chain/markets-sdk/src/unified/exchange.ts`.
- The reproduction uses fixture addresses and does not create a signature or send a transaction.

## Environment

SDK: `@somnia-chain/markets-sdk@0.32.1`.
Network: Somnia Tokyo/Hideki testnet identity, chain ID `50383`, modeled offline unless the local-fork evidence explicitly says otherwise.
Wallet: `0x0000000000000000000000000000000000000001` is a synthetic fixture address, not a funded participant wallet; no private key is required.

SDK `@somnia-chain/markets-sdk@0.32.1`; Somnia chain ID 50383; wallet A `0x0000000000000000000000000000000000000001`; wallet B `0x0000000000000000000000000000000000000002`.

## Impact

Wallet-switching UIs or concurrent callers can submit an order under a different account than the one that initiated it, causing an account/intent mismatch.

## Root cause

The asynchronous operation does not capture a signer generation or immutable trader/account snapshot at entry.

## Suggested fix

Capture the account and signer generation before the first await, bind the operation to that trader, and reject if the signer generation changes before submission. Document the concurrency guarantee.

## Duplicate-scope analysis

This is an asynchronous account-consistency issue, not a signature bypass, authorization bypass, or private-key exposure. It is distinct from order-type semantics and stale market data.

## Evidence limitations

The reproduction controls the read delay and records the selected actor; it does not sign or broadcast a live transaction.
