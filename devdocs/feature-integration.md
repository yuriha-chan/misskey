# Feature integration

## Workflow

Feature reconstruction is repeated for upstream releases. Merge the complete feature set before running a consolidated, risk-selected validation phase. Do not run the same broad regression, SDK generation, typechecks, and shipping checks after every intermediate merge.

1. Establish the upstream target and frozen feature inputs. Preserve backup refs before rebuilding a disposable work branch. Leave nominal combined and production refs untouched unless their movement is separately authorized.
2. For each feature, compare base-to-feature and base-to-target changes, including added callers and dependencies. Review the resulting shared contracts against both parents. A clean textual merge is not semantic evidence.
3. Resolve conflicts and record non-obvious decisions here. Keep feature-owned tests with their features. Inventory combined-only tests in [integration-test-inventory.md](integration-test-inventory.md) and keep their changes in an isolated series above the integrated no-test baseline. Do not depend on temporary files or conversation history to find them.
4. Merge all features, then account for effective old-combined-only behavior. Nonmerge commits alone do not capture merge-resolution changes. Generated artifacts should be reproduced from sources, not selected wholesale from a parent.
5. Preserve the existing test-bearing tree as A, remove combined-only test changes in a commit to establish the no-test baseline, then restore A's tests above it. Add remaining interaction tests only in test-only commits. The test series is based on the integrated source tree, not directly on upstream.
6. Regenerate shared artifacts once and validate the complete tree. Choose runtime cases by the changed contracts and cross-feature interactions. Put production fixes on the no-test version and propagate them into the test version; retain only tests in their effective difference. Rerun affected checks after fixes, not the complete validation phase without a concrete reason.
7. Record actual passes, failures, approved skips, and unavailable dependencies. A completion tag does not establish coverage that was not executed.
8. Only after preservation checks, an explicitly authorized ancestry-only `ours` merge may record the old combined ancestry without importing its tree. Publication, production reconciliation, deployment, and push are separate decisions.

An intermediate merge may be retained without repeating global checks. Finish the reconstruction and its final checks before presenting it as validated. Stop affected work for an actual requirements conflict or consequential unresolved decision.

## Feature order and shared contracts

Seed with Ed25519, then merge Chatroom, frontend tweaks, sub-account, Filter DSL, Search, and emoji palette presets. This order organizes integration work; it is not a deployment or security ranking. Deploy only after all required migrations.

| Boundary | Resolution and reason | Primary locations |
| --- | --- | --- |
| Signing and upstream key formats | Keep dual RSA/Ed25519 keys alongside PKCS#1-to-PKCS#8 conversion and the target key-cache namespace. Child signup must retain dual-key generation and parent linkage in the same transaction. | `UserKeypairService`, `SignupService` |
| HTTP request targets | Sign the origin-form path and query, preserving an empty trailing `?` and excluding fragments. The signature library drops queries for absolute URLs; do not remove the scoped adaptation when retaining that library. Keep the returned request URL absolute. | `activitypub/ApRequestService`, unit `ap-request.ts` |
| Inbox parsing | Preserve raw-body parsers, actor validation and Host equality before both HTTP-signature and LD-signature enqueue branches. Enqueue eligibility is not proof of LD authentication. | `server/ActivityPubServerService`, `queue/processors/InboxProcessorService` |
| Chat queues and federation | Union queue/event registrations and worker lifecycle while retaining signature payloads, optional PEM overrides, remote-suspension events, telemetry wrappers and upstream queue administration. | `QueueService`, `QueueProcessorService`, `GlobalEventService`, queue types |
| Header labels | `showText` is opt-in. Keep Leave explicitly labeled; ordinary action text remains a tooltip. Optional typing must not silently broaden rendering to all labels. | `MkPageHeader.vue`, `types/page-header.ts`, `pages/chat/room.vue` |
| Extracted note logic | Keep upstream `useNote` responsibilities and add the R18 rendering condition after its `appearNote` is available; do not restore duplicate note internals. | `MkNote.vue`, `composables/use-note.ts` |
| R18 note detail | Apply the same hide decision to server document context and API-fetched notes. A visitor must not bypass filtering through an early context return. Retain a nonflagged visible control in tests. | `pages/note.vue` |
| DSL callers | All consumers use the DSL contract, including the independently added URL-preview list. Literal URLs require quotation, with matching admin validation and guidance. Do not introduce a parallel legacy matcher. | `UtilityService`, `UrlPreviewService`, `admin/update-meta`, Japanese locale |
| Search permissions | Date bounds, visitor UGC restrictions, visibility, and base moderation filters belong inside every SQL candidate retry. Candidate IDs never replace SQL authorization. R18 remains a packed note flag for the client hide preference, not a server-side adult-content permission. | `SearchService`, `QueryService`, `notes/search`, `search.note.vue` |
| Wizard routing | Use the palette feature's named pages: welcome, profile, privacy, R18, optional palette, follow, push, done. R18 Back uses `goBack`; saving advances the named-page index. Keep one index watcher and no duplicate imports. | `MkUserSetupDialog.vue` |
| Wizard preference saving | R18 Continue requires an age choice and saves `hideR18Content`. Underage/not-declared saves hiding; adult saves the selected value. This is a preference, not a persisted consent record. Preserve deferral and completion behavior. | `MkUserSetupDialog.vue`, `MkR18ConsentDialog.vue` |
| Test relocation | Frontend Vitest includes `test/unit/**/*.test.ts`; feature tests left at the retired root test location are not coverage. Preserve BroadcastChannel and localStorage/i18n setup in the required initialization order. | `test/setup.unit.ts`, `test/unit/r18-consent.test.ts` |

Additional established constraints:

- Keep the 24-hour pending signup period for delayed mail.
- Preserve sub-account main-actor authentication, TOTP replay protection, token/cache invalidation, and one authentication for family deletion. The intended main-account FK declaration stays; its manual migration is deferred for the present release, not permanently waived.
- Target `store.ts` exists; do not remove it based on an old retirement claim.
- Preserve UI defaults and the once-per-boot async-route-tree readiness boundary. It is not a promise that all data or browser painting has completed. Deck reserves mobile navigation space once at workspace level, not once per stacked column.
- Do not rewrite deployed migration SQL to reconcile branches. Inspect effective schema differences and report concrete incompatibilities.
- The parser output `src/misc/parse-filter.ts` is generated and explicitly excluded from ESLint. Change its grammar/generation process rather than hand-maintaining the output.
- Fork-owned non-Japanese translations are intended. Do not discard them or silently change policy scripts to obtain a green result.
- Further manual Chatroom defect auditing belongs to the User. Sensitive-detector deployment work and production-only reconciliation are separate scope.

## Old combined preservation accounting

The preservation reference is `backup/2026.10.0-feats-combined` (`bd1dc57031870e628dcb4387b4dce13b96fe37eb`), not the production branch. All 29 merge commits reachable from that reference but absent from the seven completion-tag inputs were inspected using `git show --remerge-diff`. Only four nongenerated paths contain manual merge resolutions:

| Path | Historical resolution | Integrated treatment |
| --- | --- | --- |
| `MkUserSetupDialog.vue` | Palette merges `d3628cac7b` and `d040280a81` combine R18 and palette routing; `bd1dc57031` repairs Back/Continue, imports and the index watcher. | Named pages retain R18 before optional palette; Back uses `goBack`, saving uses bounded `goNext`, and one watcher persists the index. Target test IDs remain. Template branch placement does not determine named-page order. |
| `MkPageHeader.vue` | UI merge `1fa6e51dff` renders labels by default through `showText !== false`. | Explicitly superseded by the User's opt-in-label decision and Chatroom fix `82446a4097`. Leave retains `showText: true`; ordinary action text remains tooltip-only. |
| `types/page-header.ts` | `93172d245e` unions header fields but duplicates declarations; `7e84bdd1db` removes duplicates. | Optional text, `showText` and `danger` remain declared once. |
| `CHANGELOG.md` | Historical merges combine feature release entries and omit an existing poll-fix line. | Preserve the actual feature entries and upstream release history; do not reproduce the historical omission. No integration release entry is authored. |

Other nonempty remerge diffs are generated artifacts only: `ca60cd20f7`, `9cee266447`, `b2ad9f177e`, `0f92203ce6` and `28b436afc3`. Regenerate i18n and SDK from the complete source union rather than copying those artifacts. The remaining inspected merges have no manual resolution diff.

Exactly three nonmerge commits in the old combined ancestry are absent from all seven feature inputs: wizard repair `bd1dc57031`, duplicate header-type cleanup `7e84bdd1db`, and generated-artifact commit `4789b50234`. Their responsibilities are accounted for above. This accounting does not authorize replaying production-only changes or moving nominal/production refs.

## Regression manifest

Paths below are relative to their package. This is a coverage index, not a requirement to execute every row at every upstream merge. Prefer interaction cases when unchanged feature mechanics already have evidence. Add a regression for an actual conflict fix or exposed contract; do not weaken assertions to accommodate a defect.

| Contract or risk | Persistent tests | Scope of evidence |
| --- | --- | --- |
| RSA/Ed signing; queries, empty query delimiter, fragments | backend `test/unit/ap-request.ts` | Real cryptographic signature verification |
| Key conversion, selection, imported-key reuse and preparation events | backend `test/unit/UserKeypairService.ts` | Service/cache/repository boundaries with real key material |
| Inbox raw body, actor, Host and digest branches | backend `test/unit/server/ActivityPubServerService.ts` | Real Fastify routes; mocked enqueue, not cross-instance authentication |
| Delivery/suspension/metadata interactions | backend `test/unit/ApDeliverManagerService.ts`, `UserSuspendService.ts`, `FetchInstanceMetadataService.ts` | Focused service behavior |
| Child dual keys and authentication/revocation/deletion | backend `test/e2e/endpoints.ts`, suite `Sub-account authentication` | Real HTTP/DB, including cryptographic usability of child keys |
| Saved-token passkey recovery; header label intent | frontend `test/unit/accounts.test.ts`, `page-header.test.ts` | Mocked handlers/component behavior, not real WebAuthn |
| DSL parser/evaluator and affected note consumers | backend `test/unit/UtilityService.isKeyWordIncluded.ts`, `NoteCreateService.ts`, `activitypub.ts`, `misc/is-renote.ts` | Matcher and service regressions |
| URL-preview DSL and cache reevaluation | backend `test/unit/server/UrlPreviewService.ts` | Real parser/handler with mocked remote proxy |
| URL-list validation/persistence and R18 note flags | backend `test/e2e/note.ts`, names containing `URL-preview filters` or `R18 DSL` | Real HTTP save, rejected-save preservation and note readback |
| Search user/channel SQL paths; R18 and recipient authorization | backend `test/unit/SearchService.ts`, `sqlLike` cases `filters by userId`, `filters by channelId`, `user-scoped search preserves R18 flags and recipient visibility` | Bypasses external index by existing scope semantics; not general-query or indexing coverage |
| Consent save/cancel and note hiding | frontend `test/unit/r18-consent.test.ts`, `test/e2e/filter-dsl.spec.ts` | Unit boundary plus real list/detail/reload/visitor UI |
| Palette and R18 wizard interaction | frontend `test/e2e/emoji-palette-preset.spec.ts` | Enabled/disabled palette, age-required Continue, Back, resume, deferral, completion, preference persistence, admin edits and wide-image geometry |
| Account identity/state isolation | frontend `test/e2e/sub-account.spec.ts` | Separate real browser sessions and account switching |
| Mobile compensation and rendering readiness | frontend `test/e2e/frontend-tweaks.spec.ts` | Universal/Deck routes and geometry; measure full navigation wrapper overlap before click |
| Chat interactions when their boundaries change | frontend `test/e2e/chat-membership.spec.ts`, `chat-messaging.spec.ts`, `chat-reactions-polls.spec.ts` | Real browser flows; not a substitute for the User-owned manual audit |

## One consolidated validation phase

After resolving source conflicts, regenerate i18n and API/SDK artifacts where their schemas changed:

```sh
pnpm --filter i18n generate
pnpm build-misskey-js-with-types
pnpm --filter backend typecheck
NODE_OPTIONS=--max-old-space-size=3072 pnpm --filter frontend typecheck
```

The command-local frontend heap setting is approved for the reconstruction environment; it is not a repository configuration change. Select backend/frontend unit and HTTP cases from the manifest, batching cases in each runner rather than invoking the complete suite between merges. Backend tests compile dedicated test configuration; preserve `.config/test.yml` and never use root `start:test`, which overwrites it. Check migration consistency with that dedicated configuration:

```sh
pnpm --filter backend check-migrations
```

Build the frontend once before selected browser suites. Use one backend for the selected run and no resets/restarts between cases:

```sh
PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH=<installed-chromium-path> pnpm exec start-server-and-test "env MK_ONLY_SERVER=1 pnpm --filter backend start:test" http://localhost:61812 "pnpm --filter frontend test:e2e <selected-specs> --timeout=60000 --max-failures=1"
```

Use real readiness and persistence assertions, not arbitrary waits. Account setup bypasses outside wizard tests must await registry persistence. Geometry assertions precede actions that can auto-scroll. Never reset an unspecified database or run a disposable-service reset implicitly.

Run changed-file package-root `eslint --quiet` and the shipping checker at the final exit, with the selected upstream base. Inspect its actual change set: an uncommitted upstream merge can make incoming upstream translations appear as local changes because the checker resolves the common ancestor. Report locale failures concretely; do not report an overall pass when only lint/SPDX pass. Reuse final evidence until affected sources change.

## Coverage limitations that must remain visible

- The TCP Search prefilter defaults to `search:8080`. Its source/startup/reindex/test setup is not available in this repository. General-query indexing, candidate pagination, permissions through that external path, and Search browser coverage remain deferred until setup is supplied. Scoped SQL tests do not close this gap.
- Docker cross-instance federation tests are skipped by explicit User decision. Real key and Fastify-route tests do not establish cross-instance federation correctness.
- The combined wizard and final preservation accounting must be validated on the completed interaction tree; standalone feature passes do not establish those interactions. Record their execution result with the final reconstruction handoff.

## Consolidated reconstruction validation

The source snapshot is `e6744a3e`; removal commit `1d07ffb6` establishes the no-combined-tests baseline. The test series restores coverage in `c256c77b` and extends wizard resume/Back coverage in `2fcdbc47`. Subsequent documentation commits on the no-test branch do not change executable sources.

| Check | Result |
| --- | --- |
| Complete-tree i18n and API/SDK generation, backend build | PASS; generated union reproduced without additional changes before snapshot A |
| Backend source, unit and federation TypeScript | PASS |
| Frontend TypeScript with approved command-local 3 GiB heap | PASS |
| Migration consistency with dedicated test configuration | PASS; zero pending DDL |
| Selected backend service tests | FAIL overall: 15 files and 222 assertions passed, but two unhandled external-prefilter connection rejections caused exit 1 |
| Scoped SQL Search tests | PASS; user, channel and R18/recipient cases, 3 assertions-bearing cases; 30 other cases filtered by selection |
| Selected frontend tests | PASS; consent, accounts, header, scroll, countdown and room: 6 files, 41 tests across two commands |
| Frontend build | PASS |
| Shipping lint / SPDX | PASS; 2542 SPDX-covered files |
| Shipping locale rule | FAIL for retained `locales/en-US.yml`; fork-owned translations are intended by the User, checker unchanged |
| Combined HTTP and browser runs | PENDING external-prefilter setup; no final combined browser pass claimed |

The failing backend command selected `ap-request`, `UserKeypairService`, `server/ActivityPubServerService`, `ApDeliverManagerService`, `UserSuspendService`, `FetchInstanceMetadataService`, `UtilityService.isKeyWordIncluded`, `NoteCreateService`, `activitypub`, `misc/is-renote`, `server/UrlPreviewService`, `UserSearchService`, `entities/UserEntityService`, `entities/ChatEntityService` and `queue/queue-job-runner` under `test/unit`.

Both unhandled rejections were attributed to `activitypub.ts` while note indexing attempted to resolve host `search`: `SearchPrefilterService connection error: getaddrinfo EAI_AGAIN search`. This means missing prefilter setup affects background indexing in ordinary note flows as well as general Search queries. It is not safe to report the run as passed merely because its assertions passed. No fake service, suppressed rejection, weakened assertion or alternate harness was introduced. Service startup or a reachable test endpoint has been requested from the User. Dependent runtime checks and final no-failure confirmation remain blocked; the ancestry-only merge remains pending.
