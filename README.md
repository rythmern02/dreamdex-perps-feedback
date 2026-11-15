# DreamDEX Perps Feedback

Reproducible findings on order execution, position protection, and bot recovery, prepared for the [DreamDEX Perps Builder Bounty](https://dorahacks.io/hackathon/dreamdex-perps-bounty/detail).

The submission contains **17 reports**, each with reproduction steps, expected and observed behavior, supporting evidence, and a proposed fix. The tests run pinned source with controlled inputs. One finding also includes a local fork reproduction against deployed pool bytecode.

[Browse reports](feedback/) · [Reproduction results](research/evidence/reproduction-summary.json) · [Local fork evidence](research/evidence/fork-sizing.json)

## Scope

| Component | Version or environment |
| --- | --- |
| Markets SDK | `@somnia-chain/markets-sdk@0.32.1` |
| Official bot kit | [`4e75896`](https://github.com/somnia-chain/dreamdex-bot-kit/tree/4e75896896e024c03e2033d5920514f249998cd6) |
| Strategies | `perp-starter`, `perp-maker`, `perp-guard`, `perp-funding` |
| Network identity | Somnia Tokyo / Hideki testnet, chain ID `50383` |
| Fork snapshot | Hideki block `49980933` |
| Runtime | Node.js 24 or later |

The review covers execution constraints, asynchronous wallet changes, margin sizing, TP/SL lifecycle, position reduction, and recovery from failed reads or invalid configuration. Findings apply to the versions above; they have not been retested against later releases.

## Findings

Severity is proposed in each report and remains subject to organizer review. The current set contains 15 proposed major findings and two normal findings.

### SDK and order execution

| ID | Finding | Severity | Evidence |
| --- | --- | --- | --- |
| [001](feedback/participant-1-001-market-order-overrides-semantics.md) | Market orders ignore explicit FOK and post-only constraints | Major | [Reproduction](research/evidence/reproductions/001.json) |
| [002](feedback/participant-1-002-inflight-order-switches-wallet.md) | An in-flight order can use a newly configured wallet | Major | [Reproduction](research/evidence/reproductions/002.json) |
| [003](feedback/participant-1-003-sizing-ignores-market-order-padding.md) | Sizing uses the unpadded price; placement submits the padded price | Major | [Reproduction](research/evidence/reproductions/003.json) · [Fork](research/evidence/fork-sizing.json) |

### Trading and position protection

| ID | Finding | Severity | Evidence |
| --- | --- | --- | --- |
| [004](feedback/participant-2-004-short-bracket-percentages-reversed.md) | Short brackets swap the configured TP and SL percentages | Major | [Reproduction](research/evidence/reproductions/004.json) |
| [005](feedback/participant-2-005-unrelated-stop-suppresses-bracket.md) | An unrelated pending stop suppresses a protective bracket | Major | [Reproduction](research/evidence/reproductions/005.json) |
| [006](feedback/participant-2-006-terminal-stop-failure-not-recovered.md) | A terminal stop failure leaves protection unrecovered | Major | [Reproduction](research/evidence/reproductions/006.json) |
| [011](feedback/participant-2-011-close-blocked-during-oracle-outage.md) | The close helper stops when the oracle preview is unpriceable | Major | [Reproduction](research/evidence/reproductions/011.json) |
| [012](feedback/participant-2-012-close-can-reverse-after-position-race.md) | A close submits an ordinary order after a position-state race | Major | [Reproduction](research/evidence/reproductions/012.json) |
| [013](feedback/participant-2-013-stop-batch-cleanup-is-not-failure-tolerant.md) | A stale stop ID causes the entire cleanup batch to fail | Major | [Reproduction](research/evidence/reproductions/013.json) |
| [014](feedback/participant-2-014-halted-position-cannot-be-managed.md) | An inactive market prevents starter from managing an existing position | Major | [Reproduction](research/evidence/reproductions/014.json) |
| [015](feedback/participant-2-015-tp-sl-use-stale-mark-on-read-error.md) | A failed live-mark read falls back to stale TP/SL pricing | Major | [Reproduction](research/evidence/reproductions/015.json) |

### Recovery and configuration

| ID | Finding | Severity | Evidence |
| --- | --- | --- | --- |
| [007](feedback/participant-3-007-maker-refresh-failure-leaves-quotes.md) | A maker refresh failure exits without cancelling quotes | Major | [Reproduction](research/evidence/reproductions/007.json) |
| [008](feedback/participant-3-008-guard-read-failure-aborts-watchlist.md) | One failed health read aborts the guard's entire watchlist | Major | [Reproduction](research/evidence/reproductions/008.json) |
| [009](feedback/participant-3-009-funding-stale-fallback-opens-exposure.md) | A failed funding read permits an entry from stale indexed data | Major | [Reproduction](research/evidence/reproductions/009.json) |
| [016](feedback/participant-3-016-chain-id-override-can-mismatch-network.md) | A chain-ID override can contradict the selected network | Major | [Reproduction](research/evidence/reproductions/016.json) |
| [017](feedback/participant-3-017-invalid-side-silently-becomes-long.md) | An invalid `PERP_SIDE` silently becomes `long` | Normal | [Reproduction](research/evidence/reproductions/017.json) |
| [018](feedback/participant-3-018-numeric-config-allows-invalid-values.md) | Numeric settings accept values outside their valid domain | Normal | [Reproduction](research/evidence/reproductions/018.json) |

Report 010 was excluded after duplicate review. Its test remains in the suite to preserve the reproduction record, so the suite contains 18 cases while the submission contains 17 reports. Existing `participant-*` filename prefixes are organizational labels, not contributor identities.

## Reproduce the findings

```sh
git clone https://github.com/rythmern02/dreamdex-perps-feedback.git
cd dreamdex-perps-feedback
npm ci --ignore-scripts
npm run setup
npm run reproduce
npm run verify
```

`setup` retrieves the official bot kit at the pinned commit and checks that its tracked source is unmodified. `reproduce` executes the original SDK methods and strategy source with controlled exchange responses, registry behavior, and process boundaries. It writes per-case results and an aggregate summary with versions and source hashes.

`verify` checks the report inventory, required sections, environment fields, local evidence links, saved reproduction results, and saved fork criteria. It does not rerun the fork or contact the live network.

To inspect one case:

```sh
npm run reproduce -- 012
```

An individual run updates that case's evidence file. Run the full suite again to refresh the aggregate summary before verification.

## What the evidence establishes

**Controlled reproductions.** Each case records the inputs and responses needed to expose the reported behavior. These tests establish SDK encoding, outgoing order payloads, strategy decisions, or error handling at the stated boundary. Modeled fills and registry reverts are identified as fixtures. They do not establish a live fill, historical loss, or acceptance of a payload by the deployed protocol.

**Local fork reproduction.** Report 003 additionally tests the sizing discrepancy against deployed pool bytecode at the pinned Hideki block. The original size passes the unpadded margin preview, then fails at the submitted padded price. Resizing at the padded price produces an accepted control simulation. The [capture](research/evidence/fork-sizing.json) includes the quote values, rejection, control result, and local transaction receipts; the [console output](research/evidence/fork-sizing.console.txt) is included alongside it.

**Wallets and transactions.** The controlled suite requires no private key and sends no public-chain transactions. Account `0x0000000000000000000000000000000000000001` and wallet B in case 002 are synthetic addresses. Configuration-only cases require no wallet. Fixture hashes are placeholders; the fork receipt hashes exist only on the local Anvil instance.

To rerun the optional fork case, install Anvil and start it in a separate terminal:

```sh
anvil --fork-url https://api.hideki2.infra.testnet.somnia.network \
  --fork-block-number 49980933 --chain-id 50383 --port 8547
```

Then run:

```sh
node --import tsx tools/fork-sizing.mjs
```

The script requires historical RPC access, resets the local fork to the pinned block, and refuses non-local RPC targets. It replaces the saved fork capture with the new result.

## Repository layout

```text
feedback/                         One Markdown report per issue
research/evidence/reproductions/  Recorded inputs, outputs, and results
research/evidence/                Aggregate results and fork evidence
tools/                           Setup, reproduction, and validation scripts
```

Every report includes the bounty's required sections plus impact, root cause, a suggested fix, duplicate-scope analysis, and evidence limitations. Supporting evidence is linked from the report itself.

## Submission notes

This repository provides the feedback reports and their reproductions. Organizer acceptance, duplicate priority, registration, and whitelist status are not established by the test results. The report format follows the supplied Feedback track requirements; the DoraHacks detail page returned HTTP 405 during the final format check on November 15, 2026.

Security vulnerabilities must be disclosed privately to [security@dreamdex.io](mailto:security@dreamdex.io) and kept out of the public feedback submission, as required by the bounty instructions.
