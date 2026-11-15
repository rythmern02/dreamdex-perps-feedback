# DreamDEX Perps feedback submission candidates

This package contains 17 feedback candidates in [`feedback/`](feedback/), one issue per Markdown file. Each includes the required title, severity, area, numbered reproduction steps, expected behavior, actual behavior, evidence, and environment. Additional sections explain impact, cause, suggested fix, duplicate scope, and evidence limitations. Severity is proposed; organizer acceptance and first-report priority are unverified.

## Reproduce and validate

Use Node.js 24 or later:

```sh
npm ci --ignore-scripts
npm run setup
npm run reproduce
npm run verify
```

`setup` checks out official bot-kit source at commit `4e75896896e024c03e2033d5920514f249998cd6`; dependencies pin `@somnia-chain/markets-sdk@0.32.1`. The reproduction runner evaluates the original methods/strategy source with controlled exchange, registry, and process boundaries. It requires no private key, submits no public-chain transactions, and records per-test inputs/outputs under [`research/evidence/reproductions/`](research/evidence/reproductions/). The summary records versions, source hashes, and pass/fail results.

Run an individual case with `npm run reproduce -- 012`. Run the full suite again before `verify` to refresh the aggregate summary. Case 010 remains in the test suite for audit history but is excluded from the submission folder because the saved duplicate inventory records the same earlier funding-cursor finding.

Report 003 additionally cites a saved local Anvil fork run at Hideki block 49980933. Its transaction hashes belong only to that fork. `npm run verify` checks the saved fork evidence; it does not rerun the fork or contact the current public network.

## Environment and evidence interpretation

The controlled tests model the Somnia Tokyo/Hideki identity, chain ID 50383. Account `0x0000000000000000000000000000000000000001` is a synthetic fixture, not a participant's funded wallet. Wallet B in case 002 is also synthetic. Configuration-only tests require no wallet. Fixture order hashes must never be presented as public explorer transactions. Reports distinguish outgoing payload construction, modeled registry behavior, and deployed-bytecode fork observations.

The included source paths are reproducible after `npm run setup` and dependency installation. Reports also link the pinned public bot-kit source where applicable. Controlled evidence does not establish historical loss, current deployment behavior, or that a protocol will accept every constructed payload.

## Submission inventory

| Existing filename prefix | Reports in feedback/ | Count |
| --- | --- | --- |
| participant-1 | 001, 002, 003 | 3 |
| participant-2 | 004, 005, 006, 011, 012, 013, 014, 015 | 8 |
| participant-3 | 007, 008, 009, 016, 017, 018 | 6 |

These prefixes preserve the original report grouping; they are not Git author or contributor identities. This repository publishes the complete set of feedback candidates under [rythmern02](https://github.com/rythmern02). One additional SDK candidate was excluded during final review because it duplicated an earlier funding-cursor report.

## Publication and registration status

Repository: [rythmern02/dreamdex-perps-feedback](https://github.com/rythmern02/dreamdex-perps-feedback). The local feedback format and evidence can be checked with the commands above. GitHub publication does not complete the DoraHacks submission; participant registration and email whitelist status have not been verified by this package.

The [bounty page](https://dorahacks.io/hackathon/dreamdex-perps-bounty/detail) returned HTTP 405 during the final check on 2026-11-15. The required report structure was therefore checked against the exact Feedback track template supplied by the user. Other current event sections could not be independently reconfirmed from that page.

Only feedback reports belong in the public submission folder. If a finding is classified as a security vulnerability, remove it from the public package and disclose it privately to `security@dreamdex.io`, as required by the supplied rules. The held duplicate review and raw upstream issue inventory are ignored by Git; the raw inventory includes unrelated third-party security issue text and should not be uploaded with this package. Before publication, review the actual staged file list.
