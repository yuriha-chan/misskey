# feat-chatroom — Report

**Comparing**: tag `2026.5.3` vs HEAD (`cc9171dc5d`)  
**Stats**: 102 files changed, +7064 / −552 lines  
**Note**: No `Developer_Guide.md` found in codebase. Dev norms checked against `Developer_Manual.md` (1280 lines, §1–§18).

---

## 1. Added Functionalities

Four major feature groups were added on top of the existing chat system:

### 1.1 Chat Polls
- Create a poll inside a chat room (with `chat/messages/create-to-room`, attaching a `poll` sub-object).
- Poll lifecycle: **scheduled** → **started** → **finished**.
- Delayed start and auto‑finish via BullMQ (`endChatPoll` queue, cron‑like scheduling through Redis instead of `setTimeout`).
- Vote via `chat/polls/vote`; one vote per user per poll (enforced by unique composite index on `(pollId, choice, userId)`).
- Anonymous polls — voter identities hidden in results.
- Poll choices can be text strings or room members (mutually exclusive; `voteForUsers` flag).
- Automatic finish when all room members have voted.

### 1.2 Chat Secrets
- Attach a "secret" (hidden message) to a chat message.
- Secret has a visible title; plaintext becomes visible only after manual or scheduled reveal.
- Auto‑reveal via BullMQ (`revealChatSecret` queue, delayed job at `revealsAt`).

### 1.3 Chat Cards (Deck / Draw Game)
- Define card kinds (e.g., "Ace of spades", count) and distribute them among room members.
- Cards are dealt per‑user with a shuffled deck (Fisher‑Yates in `misc/shuffle.ts`).
- Each card can be individually revealed. Revealed cards show the owning user.

### 1.4 Public Rooms & Room Lifecycle
- **Public rooms** — rooms can be marked `isPublic`, discoverable via `chat/rooms/list-public`.
- **Capacity** — room member limit (`capacity`, default 20, max 100).
- **Expiration** — rooms auto‑archive after `expiration` seconds (enforced via `closeExpiredChatRoom` queue). Public rooms capped at 6 hours max.
- **Archiving** — owner/admins can archive rooms (soft‑close, read‑only). Archived rooms are preserved in history.
- **Kick** — owner can kick members (sets `hasLeft: true` on membership).
- **Soft‑leave** — leaving a room sets `hasLeft: true` instead of deleting the membership record. Re‑join is possible.
- **Theming** — per‑room `theme` string.
- **Bubble color** — per‑member `bubbleColor` / `bubbleStyle` on membership; UI adjusts `--MI_USER-fukidashi` CSS property.

### 1.5 Message Visibility
- `visibleUserIds` on chat messages — a message can be sent to only specific room members (per‑user WebSocket delivery via `chatRoomUserStream`).

### 1.6 Timeline Rewrite
- `roomTimeline` is completely rewritten: now returns a unified chronological stream of 8 event types (message, poll scheduled/started/finished, card delivered/revealed, secret committed/revealed, join, leave, room archived) using a custom k‑way merge over 7 data sources.

---

## 2. Design Decisions

### 2.1 Heterogeneous Timeline as Union of Events
The timeline is no longer a simple message list. A new `ChatEvent` union type (discriminated by `type`) merges messages, polls, secrets, and cards into a single sorted stream. The server-side `roomTimeline()` performs a raw SQL `UNION ALL` across 7 sources to compute a unified cursor, then fetches each source in parallel and k‑way merges the result.

### 2.2 Scheduled Operations via BullMQ (Not `setTimeout`)
Poll start/finish, secret reveal, and room expiration are all implemented as delayed BullMQ jobs, not in‑memory timers. This ensures durability across process restarts and cluster workers (all workers share the same Redis‑backed queues).

### 2.3 Soft‑Leave (hasLeft) Instead of Deleting Membership
Previously, leaving a room deleted the `chat_room_membership` row. Now, `hasLeft` is set to `true` and the row persists. This preserves:
- Message history attribution (who said what).
- Ability to re‑join the same room.
- Join/leave timeline events.

### 2.4 Cards: Composite Primary Key `(deliverId, cardId)`
A single message may deliver multiple cards to multiple users. Rather than a simple auto‑increment PK, the `chat_card` table uses a composite key of `(deliverId, cardId)` — the `deliverId` comes from the chat message ID and `cardId` is a small incrementing integer per‑delivery. This natural key design avoids additional unique constraints.

### 2.5 Per‑User Streaming Channel (`chatRoomUserStream`)
A new stream pattern `chatRoomUserStream:{roomId}-{userId}` is introduced for scoped delivery (visible‑to‑specific‑users messages, card delivery). The existing `chatRoom` channel now also subscribes to the user‑specific sub‑channel.

### 2.6 User Entity Packing: `packManyNullable` for Polls
Polls with `voteForUsers: true` have user IDs as choices. Some users may have been deleted. The new `UserEntityService.packManyNullable()` method preserves array positions, returning `null` for deleted users instead of omitting them — critical for correct choice indexing in poll results.

### 2.7 Room Ownership Model Shift
Owners now get an explicit `chat_room_membership` record (previously they were implicitly a member without a DB row). This simplifies queries — all room membership queries check `hasLeft` uniformly.

---

## 3. Layered Implementation

The feature follows the standard Misskey layered architecture. Changes span all layers:

### Layer 1: Database (Entities + Migrations)
| What | Where |
|---|---|
| **4 new entities** | `models/ChatCard.ts`, `ChatPoll.ts`, `ChatPollVote.ts`, `ChatSecret.ts` |
| **3 modified entities** | `models/ChatRoom.ts` (+`isPublic`, `capacity`, `expiration`, `theme`, `memberships` relation), `ChatRoomMembership.ts` (+`hasLeft`, `bubbleColor`, `bubbleStyle`), `ChatMessage.ts` (+`visibleUserIds`) |
| **5 migrations** | `1756522990542-chat-soft-leave.js`, `1756522990543-chat-room.js`, `1756522990544-add-chat-features-tables.js`, `1756522990545-add-bubble-style-to-chat-membership.js`, `1757139240003-addChatMessageVisibility.js` |
| **Registration** | `postgres.ts` (entities array), `di-symbols.ts` (4 repo symbols), `RepositoryModule.ts` (4 provider/exports), `models/_.ts` (imports + type aliases) |

### Layer 2: Core Business Logic
| What | Where |
|---|---|
| **ChatService** (extended ~600→~1459 lines) | New methods: `schedulePoll`, `startPoll`, `finishPoll`, `revealSecret`, `revealCard`, `archiveRoom`, `updateMembership`, `getPublicRoomsWithPagination`, `mergeSorted`, plus rewrites of `roomTimeline`, `joinToRoom`, `leaveRoom`, `createMessageToRoom`, `createRoom` |
| **ChatPollService** (new, 73 lines) | `vote()` — validates, casts vote, auto‑finishes when all members voted |
| **ChatEntityService** (extended) | 10 new pack methods: `packPoll{Scheduled,Started,Finished}(Many)`, `packSecret(s)`, `packSecretRevealed(s)`, `packCard(s)`, `packCardRevealed(s)` |
| **UserEntityService** (extended) | New `packManyNullable()` for positional null‑safe array packing |
| **GlobalEventService** (extended) | 12 new chat event types + `chatRoomUserStream` per‑user channel + `publishChatRoomUserStream()` |
| **QueryService** (extended) | New `getRange()` directional range query builder (used by `roomTimeline`) |
| **CoreModule** | Registered `ChatPollService` |

### Layer 3: API Endpoints (12 new, 10 modified)
| New Endpoint | Purpose |
|---|---|
| `chat/polls/start` | Manually start a scheduled poll |
| `chat/polls/finish` | Manually finish an active poll |
| `chat/polls/vote` | Cast a vote |
| `chat/polls/list` | List scheduled + active polls in a room |
| `chat/secrets/reveal` | Reveal a committed secret |
| `chat/secrets/list` | List pending secrets in a room |
| `chat/cards/reveal` | Reveal a held card |
| `chat/cards/list` | List pending cards in a room |
| `chat/rooms/archive` | Archive (soft‑close) a room |
| `chat/rooms/kick` | Kick a member from a room |
| `chat/rooms/list-public` | List discoverable public rooms |
| `chat/rooms/update-membership` | Update bubble color/style for self |

Modified endpoints gained new params: `chat/rooms/create` (+capacity/expiration/isPublic/theme), `chat/rooms/join` (+bubbleColor/bubbleStyle), `chat/rooms/joining` (+includeLeft), `chat/rooms/members` (removed pagination, +includeLeftMembers), `chat/rooms/owned` (+includeArchived), `chat/rooms/update` (+capacity), `chat/rooms/leave` (+kicked flag), `chat/messages/create-to-room` (+poll/commitSecret/deliverCards/visibleUserIds params, can now send a null message), `chat/messages/room-timeline` (returns `ChatEvent[]`), `chat/rooms/invitations/create` (rate limit changed).

### Layer 4: Queue / Async Processing (3 new queues)
| Queue | Processor | Trigger |
|---|---|---|
| `closeExpiredChatRoom` | `CloseExpiredChatRoomProcessorService` | Room creation with `expiration` set |
| `revealChatSecret` | `RevealChatSecretProcessorService` | Secret creation with `revealsAt` set |
| `endChatPoll` (`action: 'start'` / `'finish'`) | `EndChatPollProcessorService` | Poll schedule (`startsAt`) + auto‑finish (`duration`) |

Registered in: `queue/types.ts` (3 job data types), `queue/const.ts` (3 QUEUE keys), `core/QueueModule.ts` (3 Queue providers), `queue/QueueProcessorModule.ts` (3 processor providers), `queue/QueueProcessorService.ts` (3 Worker init/close), `core/QueueService.ts` (3 enqueue methods + QUEUE_TYPES).

### Layer 5: Streaming (WebSocket)
| What | Where |
|---|---|
| `chatRoomUserStream` per‑user channel | `GlobalEventService.ts` — new stream type; `chat-room.ts` channel now subscribes to `chatRoomUserStream:{roomId}-{userId}` for self |
| `membershipUpdated` event | Published on bubble color change; consumed by room participants to refresh UI |

### Layer 6: Frontend
| What | Files |
|---|---|
| **New components** | `MkColorId.vue` (color‑coded ID segments), `MkCountdown.vue` (live countdown timer), `MkTimeDurationInput.vue` (compound duration input with steppers) |
| **New pages/dialogs** | `home.publicRooms.vue` (public room listing, 10s polling), `room.info.vue` (room settings tab), `edit-chat-room.vue` (room creation dialog), `edit-chat-participation.vue` (bubble color picker), `edit-chat-poll.vue` (poll creation), `edit-chat-secret.vue` (secret creation), `edit-chat-cards.vue` (card creation + distribution), `vote-chat-poll.vue` (vote dialog) |
| **Major rewrites** | `room.vue` (multi‑event timeline, sticky‑top bar for polls/secrets/cards, 14 WebSocket handlers), `XMessage.vue` (10 event‑type renderers), `room.form.vue` (attachment system with preview chips) |
| **Minor tweaks** | `MkFukidashi.vue` (CSS mix for per‑user bubble color), `MkPageHeader.vue` (+showText toggle), `MkPageHeader.tabs.vue` (responsive padding), `home.home.vue` (+public rooms section, replaced inline create form), `home.joiningRooms.vue` (+includeLeft toggle), `home.ownedRooms.vue` (+includeArchived toggle) |

### Layer 7: i18n & SDK
| What | Where |
|---|---|
| **72 new keys** | `locales/ja-JP.yml` — 2 general + 70 under `_chat:` (polls, secrets, cards, room management, bubble color) |
| **Auto‑gen** | `packages/misskey-js/src/autogen/` fully regenerated (entities, models, types, apiClientJSDoc, endpoint, api.md) |
| **i18n types** | `packages/i18n/src/autogen/locale.ts` regenerated |

---

## 4. Divergences from `Developer_Manual.md`

### 4.1 Missing `res` in New API Endpoint Meta (vs §1)
Several new endpoints have **no `res` field declared** in their `meta`, meaning no response schema is visible to the OpenAPI generator:

| Endpoint | `meta.res` |
|---|---|
| `chat/cards/list` | **missing** (returns `ChatCard[]`) |
| `chat/cards/reveal` | **missing** (void) |
| `chat/polls/start` | **missing** (void) |
| `chat/polls/finish` | **missing** (void) |
| `chat/polls/vote` | **missing** (void) |
| `chat/polls/list` | **missing** (returns `{scheduledPolls, startedPolls}`) |
| `chat/rooms/archive` | **missing** (void) |
| `chat/rooms/kick` | **missing** (void) |
| `chat/rooms/update-membership` | **missing** (void) |
| `chat/secrets/list` | **missing** (returns `ChatSecret[]`) |
| `chat/secrets/reveal` | **missing** (void) |

The `Developer_Manual.md` §1 template shows `res` as a declared field. While `res` is optional in the type system, the manual's template always includes it. Similarly, `chat/messages/room-timeline` had its `ref` removed and now returns only `type: 'object'` — the union `ChatEvent` type is defined in `json-schema/chat-event.ts` but not referenced in the endpoint's own `res` (the ref is missing).

### 4.2 Test File: Incomplete Copy‑Paste Artifacts (vs §1 e2e test requirement)
The new test file `packages/backend/test/unit/entities/ChatEntityService.ts` (138 lines) contains numerous issues:

1. **Wrong import path**: `ChatEntityService` is imported from `'@/core/entities/UserEntityService.js'` (line 7) — should be `'@/core/entities/ChatEntityService.js'`.
2. **Wrong describe name**: The top‑level `describe` says `'UserEntityService'` but the file is for `ChatEntityService`.
3. **Stub helper functions never adapted**: `createRoom()` inserts a `chatRoomsRepository` entry… but with `followerId`/`followeeId` (following‑style columns). `join()` inserts a `followingRepository` row. `startPoll()` inserts a `mutingRepository` row. `vote()` inserts a `followingRequestRepository` row. `finishVote()` inserts a `renoteMutingsRepository` row. All appear to be copy‑pasted from a following/muting test and never rewritten for chat entities.
4. **No actual test cases**: The file includes setup code (`beforeAll`, `createUser`, helpers) but **no `it()` / `test()` calls** with assertions — the diff is truncated at 138 lines, but the visible scope shows only setup.

The manual §1 requires an e2e test for each endpoint; this file is a unit test for the entity service, but it is functionally broken.

### 4.3 Missing Storybook Stories for New Mk* Components (vs §12)
The three new shared components have **no `*.stories.impl.ts` files**:
- `MkColorId.vue` — no `MkColorId.stories.impl.ts`
- `MkCountdown.vue` — no `MkCountdown.stories.impl.ts`
- `MkTimeDurationInput.vue` — no `MkTimeDurationInput.stories.impl.ts`

The manual §12 explicitly requires a `*.stories.impl.ts` file alongside every `Mk*` component.

### 4.4 No CHANGELOG Entry
The diff shows **no changes to `CHANGELOG.md`**. According to `CONTRIBUTING.md` (line 58) and `AGENTS.md` (CHANGELOG section), user‑facing changes must be documented in `CHANGELOG.md` under `## Unreleased`. All four feature groups (polls, secrets, cards, public rooms) are user‑facing additions.

### 4.5 Migration Naming Inconsistency (§11)
The manual §11 prescribes `{Date.now()}-<descriptive-name>.js` for the filename. The five new migrations use:
- `chat-soft-leave` (camelCase)
- `chat-room` (kebab‑case component)
- `add-chat-features-tables` (kebab‑case)
- `add-bubble-style-to-chat-membership` (kebab‑case)
- `addChatMessageVisibility` (camelCase)

No strict enforcement exists in CI for naming style, but the manual and `AGENTS.md` describe a preferred pattern that is not consistently followed here.

### 4.6 `chat/rooms/members` Endpoint: Pagination Removed Without Versioning
The `chat/rooms/members` endpoint had its `limit`, `sinceId`, `untilId`, `sinceDate`, `untilDate` params **removed entirely**. This is a backwards‑incompatible API change — callers that pass pagination params will now receive validation errors. No deprecated‑params strategy or API versioning was applied.

### 4.7 Meta Property Pattern for `types.ts` (vs §4)
`moderationLogTypes` in `types.ts` was extended with `'archiveChatRoom'`. This follows the manual §4 pattern (adding to `Meta.ts` + migration + API endpoints). The moderation log type is consistent.

### 4.8 No New Global Registrations for Mk Components (vs §12)
The three new `Mk*` components (`MkColorId`, `MkCountdown`, `MkTimeDurationInput`) are **locally imported** in their consumers, not registered globally in `components/index.ts`. The manual §12 gives both paths (global vs local) — this is a choice, not a violation, but worth noting since most `Mk*` components in this codebase are globally registered.

---

## Summary

| Aspect | Status |
|---|---|
| 12 new API endpoints | 11 follow the standard pattern; all missing `res` in `meta` |
| 10 modified endpoints | Most changes are backward‑compatible additions; `chat/rooms/members` removed pagination (breaking) |
| 4 new DB entities + 5 migrations | All entities fully registered (DI, RepositoryModule, postgres.ts, _.ts) |
| 3 new queue types + processors | Fully registered across all 6 required files |
| 3 new frontend components | Missing Storybook stories |
| 8 new frontend pages/dialogs | SPDX headers present, `definePage()` present |
| 72 new i18n keys | Only `ja-JP.yml` edited (correct per §16) |
| misskey‑js auto‑gen | Executed (all autogen files updated) |
| e2e / unit test | One broken unit test file (copy‑paste artifacts, no test cases) |
| CHANGELOG | **Not updated** |
