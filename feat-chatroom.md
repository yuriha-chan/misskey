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

### 2.8 Frontend User Data Caching
Since chat room is a place where limited number of participants are involved, the user data is not attched to the message. Instead, the client is responsible to receive user data independently and map on their own.

### 2.9 Frontend Type Definitions
There are additional frontend types defined separated from misskey-js definitions. There are six types: `NormalizedChatMessage` is a chat message with author and reaction users resolved (see 2.8).  `TimelineItem` is a discriminated union extending `ChatEvent` with join, leave, membershipUpdated, and roomArchived variants. This type represents all items that should be rendered in the chat room interface. `TrackedPoll` is a poll entity union carrying frontend-only lifecycle flags (`started`, `voted`).

Three draft types (`ChatPollDraft`, `ChatSecretDraft`, `ChatCardsDraft`) represent form-level data shapes that intentionally differ from API entity types: e.g.`ChatSecret` lacks `plaintext` — that field only appears on `ChatSecretRevealed` after reveal. The draft carries `plaintext` and `revealsIn` for pre-commit editing without leaking the secret via the API schema.

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

### Layer 6: Frontend Types and Data
- **User data**: User objects are not attached to chat messages by the server. The client maintains a `membersMap` keyed by `userId`, populated from room membership data. `NormalizedChatMessage` wraps `ChatMessageLite` with resolved `fromUser` and `reaction.user` fields drawn from `membersMap` (or self for own messages).
- **Timeline items**: `TimelineItem` extends `ChatEvent` with join, leave, membershipUpdated, and roomArchived variants — all types displayed in the chat room.
- **Poll state**: `TrackedPoll` carries frontend-only lifecycle flags (`started`, `voted`) via a distributive union over the two poll entity stages.
- **Form shapes**: `ChatPollDraft`, `ChatSecretDraft`, and `ChatCardsDraft` carry fields absent from API entity types (e.g., `plaintext` before secret commit).
- **Streaming**: 11 new `chatRoom` events declared with correct entity types.
- **Queue types**: `closeExpiredChatRoom`, `revealChatSecret`, `endChatPoll` added to `misskey-js/consts.ts`.

#### Layer 7: Frontend Components
| File | Role |
|---|---|
| `room.vue` | Root page: multi‑event timeline with date separators and 14 WebSocket handlers, sticky bar for polls/secrets/cards, header tabs (chat/search/members/info), connection scoped per channel type |
| `XMessage.vue` | Message renderer: 10 event‑type templates (message, poll scheduled/started/finished, secret committed/revealed, card delivered/revealed, join, leave), reactions, search result enrichment |
| `room.form.vue` | Message composer: text input with attachment preview chips for polls, secrets, cards, and files |
| `edit-chat-poll.vue` | Poll creation dialog |
| `edit-chat-secret.vue` | Secret creation dialog |
| `edit-chat-cards.vue` | Card creation + distribution dialog |
| `edit-chat-room.vue` | Room creation dialog |
| `edit-chat-participation.vue` | Bubble color picker dialog |
| `vote-chat-poll.vue` | Vote dialog |
| `room.info.vue` | Room settings tab |
| `room.members.vue` | Member list with kick |
| `room.search.vue` | Message search within room |
| `home.publicRooms.vue` | Public room listing |
| `MkColorId.vue` | Color‑coded ID segments |
| `MkCountdown.vue` | Live countdown timer |
| `MkTimeDurationInput.vue` | Duration input with steppers |
| `MkFukidashi.vue` | Per‑user bubble color via `--MI_USER-fukidashi` |
| `MkPageHeader.vue` | `showText` made optional |
| `home.home.vue` | Public rooms foldable section |
| `home.joiningRooms.vue` | `includeLeft` toggle |
| `home.ownedRooms.vue` | `includeArchived` toggle |
| `admin-file.chat.vue` | XMessage prop `:message` → `:item` |
| `message.vue` | XMessage prop `:message` → `:item` |

#### Layer 8: Frontend Event Handling and API Calls
| What | Where |
|---|---|
| **14 WebSocket handlers** | Client receives messages via websocket (`room.vue`) — `message`, `deleted`, `react`, `unreact`, `join`, `leave`, `pollScheduled`, `pollStarted`, `pollFinished`, `secretCommitted`, `secretRevealed`, `cardDelivered`, `cardRevealed`, `roomArchived`, `membershipUpdated` |
| **Connection scoping** | Listeners registered in the same branch where the channel is created (`chatUser` or `chatRoom`) |
| **Calling API endpoints** | Client posts chat text and other events by calling API endpoints, not by sending websocket message: `chat/messages/create-to-{user,room}`, `chat/polls/{vote,start,finish}`, `chat/secrets/reveal`, `chat/cards/reveal` |
| **Prop contracts** | XMessage accepts `:item` (TimelineItem) and `:membership` (optional ChatRoomMembership) |

### Layer 9: i18n
| What | Where |
|---|---|
| **72 new keys** | `locales/ja-JP.yml` — 2 general + 70 under `_chat:` (polls, secrets, cards, room management, bubble color) |

---

## 4. Divergences from `Developer_Manual.md`

### 4.1 Missing `res` in New API Endpoint Meta (vs §1) => fixed

### 4.2 Test File: Incomplete Copy‑Paste Artifacts (vs §1 e2e test requirement) => fixed

### 4.3 Missing Storybook Stories for New Mk* Components (vs §12) => postponed
The three new shared components have **no `*.stories.impl.ts` files**:
- `MkColorId.vue` — no `MkColorId.stories.impl.ts`
- `MkCountdown.vue` — no `MkCountdown.stories.impl.ts`
- `MkTimeDurationInput.vue` — no `MkTimeDurationInput.stories.impl.ts`

The manual §12 explicitly requires a `*.stories.impl.ts` file alongside every `Mk*` component.

### 4.4 No CHANGELOG Entry
The diff shows **no changes to `CHANGELOG.md`**. According to `CONTRIBUTING.md` (line 58) and `AGENTS.md` (CHANGELOG section), user‑facing changes must be documented in `CHANGELOG.md` under `## Unreleased`. All four feature groups (polls, secrets, cards, public rooms) are user‑facing additions.

### 4.5 Migration Naming Inconsistency (§11) => not planned

### 4.6 `chat/rooms/members` Endpoint: Pagination Removed Without Versioning => not planned

---

## Summary

| Aspect | Status |
|---|---|
| 12 new API endpoints | 11 follow the standard pattern; all missing `res` in `meta` |
| 10 modified endpoints | Most changes are backward‑compatible additions; `chat/rooms/members` removed pagination (breaking) |
| 4 new DB entities + 5 migrations | All entities fully registered (DI, RepositoryModule, postgres.ts, _.ts) |
| 3 new queue types + processors | Fully registered across all 6 required files |
| 3 new shared components | Missing Storybook stories |
| 10 new page components / dialogs | SPDX headers present, `definePage()` present where applicable |
| 6 majorly rewritten pages | `room.vue`, `XMessage.vue`, `room.form.vue`, `home.home.vue`, `admin-file.chat.vue`, `message.vue` |
| 6 exported frontend types | `NormalizedChatMessage`, `TimelineItem`, `TrackedPoll`, `ChatPollDraft`, `ChatSecretDraft`, `ChatCardsDraft` |
| 72 new i18n keys | Only `ja-JP.yml` edited (correct per §16) |
| misskey‑js auto‑gen | Executed (all autogen files updated) |
| e2e / unit test | unit test only |
| CHANGELOG | **Not updated** |
