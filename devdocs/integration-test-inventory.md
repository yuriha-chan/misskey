# Combined integration test inventory

## Test ownership and removal boundary

The no-test baseline means **no combined-only test additions**, not a tree with all feature tests removed. Tests contained in a feature input remain part of that feature. The separate test series starts from the complete integrated no-test source tree, not directly from upstream.

The combined-only changes identified before finishing the palette merge are exactly these three file deltas:

| Test file | Feature-owned comparison input | Combined-only change | Execution evidence before final consolidation |
| --- | --- | --- | --- |
| `packages/backend/test/e2e/endpoints.ts` | `2026.10.0-feat-sub-account` (`e1c39b33e6a6212be88e71f955a1c8fe7a0bcfe7`) | 28 added lines: crypto and `MiUserKeypair` imports plus `creates a linked sub-account with usable RSA and Ed25519 keys`. Creates parent/child through HTTP, verifies DB parent link and both asymmetric key types, then signs/verifies with each pair. Retains connection cleanup. | Passed with the five feature-owned sub-account authentication cases. Final combined run remains separate. |
| `packages/backend/test/unit/SearchService.ts` | `2026.10.0-feat-search` (`66950efffccfb3194289f0d3612b79665009a2d6`) | 20 added lines: `user-scoped search preserves R18 flags and recipient visibility`. Real SQL user scope returns public and addressed notes with R18 flags to the recipient, but only the public note to another user. Uses existing fixture lifecycle; no external-index mock. | Passed with existing SQL user/channel cases. Does not cover the external prefilter. |
| `packages/frontend/test/e2e/emoji-palette-preset.spec.ts` | `2026.10.0-feat-emoji-palette-preset` (`c22502fff85f497849c43ecf9387e2238dbf91f0`) | 28 added / 4 removed lines: R18-aware navigation helper, required age selection, flagged-note fixture/cleanup, Back and resume index changes, adult preference readback through real note visibility, and underage hiding after deferral/completion/reload. Retains the feature's three original palette cases and geometry assertions. | Not executed on the combined tree. These edits predate the instruction to finish merges without further tests. |

These comparisons were checked directly against the working tree. Restore only these three test files from the specified feature inputs when making the removal commit; do not restore production files or an entire feature tree. Commit A preserves the full test-bearing snapshot, including the uncommitted browser changes, before removal. Restore those same three files from A to establish the initial test-only delta above the no-test baseline.

## Tests that remain feature-owned

- `packages/frontend/test/unit/page-header.test.ts` belongs to Chatroom fix `82446a4097d7617d60865198735ad396b95965b9`. That feature fix is merged into the combined ancestry. Keep its opt-in label assertions and Leave handler coverage on the no-test baseline.
- The original sub-account authentication cases in `endpoints.ts`, `test/unit/accounts.test.ts`, and `test/e2e/sub-account.spec.ts` are feature-owned. Remove only the dual-key addition listed above, not the family-authentication/revocation/replay tests.
- Ed25519 keypair, Fastify inbox and request-target regressions are already in `2026.10.0-feat-ed25519`; they are not combined-only removals.
- DSL parser/evaluator, URL-preview handler and API persistence regressions, relocated consent tests and `filter-dsl.spec.ts` already belong to `2026.10.0-feat-filter-dsl`.
- The original three-case palette browser suite belongs to the palette feature. Only the R18/combined-flow adaptations listed above form the combined-only delta.
- Chatroom and responsive UI suites supplied by their feature inputs remain. Do not remove unrelated or untracked tests incidentally.

## Source and test commit layout

Follow this order for the reconstruction:

The disposable source baseline is recorded by `feats-combined-work-no-tests`; `feats-combined-work` carries the test layer above it. Neither name authorizes moving nominal `feats-combined` or production `yuriha-master`.

Snapshot A is `e6744a3e83ffd16bccf31557c1a1c471c3fc3a8b`, the palette merge completing the seven-feature source union. Its generated i18n and SDK artifacts were reproduced successfully before the snapshot. Runtime validation of the complete tree is recorded separately, not inferred from this snapshot.

1. Finish all source merges and old-combined preservation accounting without further test additions. Commit the existing source/test tree as A; this is a preservation snapshot, not a final validation claim.
2. Remove only the combined-only test changes inventoried above and commit the no-test integrated baseline.
3. Restore A's test changes on top of that baseline, then add the remaining interaction tests in test-only commits. Keep merge notes, production code, generated artifacts and configuration outside that test-only difference.
4. Run one consolidated validation phase. If a production fix is necessary, commit it on the no-test version and propagate it into the test version. Test corrections stay on the test version and must preserve intended assertions.
5. Confirm no unexpected test failure remains and inspect the complete no-test-to-test diff: every changed path and hunk must be test-only. Record the no-test base and test tip together in the handoff.

At the next upstream reconstruction, build from the no-test integration, then transplant the isolated test range with `git rebase --onto <integrated-no-test-tip> <recorded-no-test-base> <test-branch>`. Do not transplant the combined merge history as though it were test changes. Reconcile test conflicts against the intended behavior, run consolidated checks, fix production on the no-test version, and propagate those fixes to the test version.

Search external-prefilter coverage remains unavailable until service setup is supplied. Docker federation coverage remains explicitly skipped. Neither limitation becomes a pass through this commit layout.
