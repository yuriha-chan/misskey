# Code Summary — Misskey

**Version**: 2026.5.3 (codename "nasubi")  
**Generated**: 2026-05-19  

---

## 1. Files Report (Directory Structure Overview)

### Root

```
/app/misskey/
├── CLAUDE.md              # Claude Code entry point (includes AGENTS.md)
├── AGENTS.md              # AI agent rules (shared: Claude Code, Codex, Copilot)
├── Code_Summary.md        # This file
├── CHANGELOG.md           # Release notes; Unreleased section for in-progress changes
├── CONTRIBUTING.md        # Human contributor guidelines
├── README.md / README.md.en-US
├── package.json           # Root workspace (pnpm); scripts: build, dev, lint, e2e, etc.
├── pnpm-workspace.yaml    # 11 packages + 1 sub-workspace (misskey-js/generator)
├── pnpm-lock.yaml
├── .editorconfig          # tabs indent=2; YAML/migrations → spaces
├── .gitignore             # Excludes node_modules, built/, .config/*, etc.
├── Procfile               # Process definitions for dev
├── crowdin.yml            # ja-JP.yml → Crowdin → other locales
│
├── .config/               # Runtime configuration (default.yml, example.yml)
├── locales/               # 41 locale YAML files (ja-JP.yml canonical)
├── .claude/               # Claude Code skills, agents, commands, docs
├── .github/               # 28 CI/CD workflows, copilot-instructions.md
│
├── packages/
│   ├── backend/           # NestJS 11 + Fastify 5 API server
│   ├── frontend/          # Vue 3.5 SPA
│   ├── frontend-embed/    # Embedded note viewer
│   ├── frontend-shared/   # Shared config/themes/utils (frontend + embed)
│   ├── frontend-builder/  # Vite plugins (locale-inliner, remove-unref-i18n)
│   ├── sw/                # Service Worker
│   ├── misskey-js/        # JS/TS client SDK (MIT) + generator sub-package
│   ├── misskey-reversi/   # Reversi game logic
│   ├── misskey-bubble-game/ # Bubble game logic
│   ├── i18n/              # Type generation from ja-JP.yml
│   ├── icons-subsetter/   # Icon subsetting tool
│   └── shared/            # Shared ESLint Flat Config (NOT a workspace member)
```

### Key Files per Package

| Package | Key Files |
|---|---|
| **backend** | `src/server/index.ts` (entry), `src/boot/master.ts` / `worker.ts`, `src/server/ServerModule.ts`, `src/server/api/endpoint-list.ts`, `src/di-symbols.ts`, `src/const.ts`, `src/queue.ts`, `src/migration/` (342 files) |
| **frontend** | `src/init.ts` (entry), `src/os.ts` (modal system), `src/store.ts` (state), `src/plugin.ts`, `src/i18n.ts`, `src/router.definition.ts`, `vite.config.ts`, `build.ts` |
| **misskey-js** | `src/api.ts`, `src/streaming.ts`, `src/autogen/` (generated types), `generator/` (code generator) |
| **i18n** | `build.ts` (generates `packages/i18n/src/i18n.types.ts` from `locales/ja-JP.yml`) |

---

## 2. Characteristics Report

### Languages
- **TypeScript** (primary, all packages)
- **Vue 3 SFC** (frontend; `<script setup lang="ts">`)
- **SCSS** (frontend, CSS Modules: `<style lang="scss" module>`)
- **JavaScript** (migrations, scripts, some config files)
- **YAML** (locales, CI config, .editorconfig exceptions)

### Framework & Runtime
| Concern | Technology |
|---|---|
| API Server | NestJS 11 on Fastify 5 |
| Database ORM | TypeORM 0.3 (PostgreSQL) |
| Queue | BullMQ (Redis-backed) |
| Cache / PubSub / Timeline | Redis (5 separate connections) |
| Search | Meilisearch (optional, via `@meilisearch/instant-meilisearch`) |
| Frontend | Vue 3.5 with Composition API |
| Build (frontend) | Vite 6 (via rolldown) |
| Build (backend) | rolldown |
| Bundling | rolldown (Rust bundler for both frontend & backend) |
| TypeChecker (backend) | tsgo (TypeScript native preview) |
| TypeChecker (frontend) | vue-tsc |
| Storybook | @storybook/vue3-vite 9.0 |
| CSS | SCSS with CSS Modules |
| Object Storage | S3-compatible (MinIO or AWS) |
| Federation | ActivityPub (custom implementation) |

### Package Manager
- **pnpm 11.1.2** with workspace protocol (`workspace:*`)
- Monorepo (12 packages including sub-workspace)
- Catalog-based dependency versioning (`pnpm.overrides` absent; no overrides needed)

### Coding Style
- **Indentation**: tabs (width=2) for most; spaces for YAML, JSON, migrations (`migration/` directory in `.editorconfig`)
- **Quotes**: single quotes preferred in backend TypeScript
- **SPDX Headers**: mandatory on `.ts`, `.js`, `.cjs`, `.mjs`, `.vue`, `.scss`, `.html` — CI check enforced; `packages/misskey-js` is MIT and exempt from AGPL header
- **Component naming**: `Mk*` prefix for all frontend components (e.g., `MkAvatar`, `MkButton`, `MkNote`)
- **Entity naming**: `Mi*` prefix convention for TypeORM entity file names (e.g., `user.ts` → class `MiUser`, but exported as `User`)
- **API endpoint files**: each exports `meta`, `paramDef`, and `default` class extending `Endpoint` — ESLint disables `import/no-default-export` for these files
- **Import order** (backend eslint rule): builtin → external → internal → parent → sibling → index → object → type

### Formatter & Linter
- **No formatter configured** — no Prettier, no Biome config files found
- **ESLint 9 Flat Config** — shared base in `packages/shared/eslint.config.js`; each package has its own `eslint.config.js` extending the shared config
- **Lint command**: `pnpm lint` (= `pnpm --no-bail -r lint`) collects results from all packages; non-zero exit on any failure

### Project Structure
- **Monorepo with workspaces** — root `pnpm-workspace.yaml` defines 11 packages; `packages/misskey-js/generator` is a sub-workspace
- **Layered backend**:
  - `boot/` — process lifecycle (master → cluster workers, or development single-process)
  - `server/` — NestJS HTTP server + API module hierarchy
  - `server/api/` — endpoint definitions + OpenAPI generation
  - `models/` — TypeORM entities + entity services
  - `core/` — business logic services + ActivityPub
  - `queue/` — BullMQ queue definitions + processors
  - `daemons/` — background services (queue stats, server stats)
  - `migration/` — database migrations (342 files)
  - `chart/` — chart entities + chart service aggregation
- **Layered frontend**:
  - `components/` — ~288 Mk*-prefixed Vue components
  - `pages/` — ~97 page components (routed)
  - `widgets/` — ~34 user-configurable widgets
  - `scripts/` — utility modules (os.ts, store.ts, plugin.ts, i18n.ts)
  - `composables/` — 11 Vue 3 composables
  - `directives/` — 13 custom directives
  - `services/` — API service layer
  - `stores/` — Pizzax-based reactive stores

### Build System
| Command | What it does |
|---|---|
| `pnpm build` | Full build: `pre-build` → `-r build` (all packages) → `build-assets` |
| `pnpm dev` | Parallel dev servers (backend + frontend watch mode) |
| `pnpm lint` | ESLint + typecheck across all packages |
| `pnpm migrate` | Apply pending TypeORM migrations |
| `pnpm revert` | Rollback last migration |
| `pnpm --filter backend check-migrations` | Verify entity changes match migration files |
| `pnpm build-misskey-js-with-types` | Regenerate misskey-js autogen types from backend OpenAPI |

### Testing
| Command | Framework | Notes |
|---|---|---|
| `pnpm --filter backend test` | Vitest (unit) | Requires `.config/test.yml` |
| `pnpm --filter backend test:e2e` | Vitest (e2e) | Requires `.config/test.yml` |
| `pnpm --filter backend test:fed` | Vitest (federation) | Uses Docker Compose multi-instance |
| `pnpm --filter frontend test` | Vitest (unit) | i18n, theme, store tests |
| `pnpm e2e` | Cypress | Requires `start:test` running |
| `pnpm --filter frontend storybook-dev` | Storybook | Component dev server |

### Version Control
- **Git** — detached HEAD state (`8a38a05d83` at survey time)
- **No worktrees** — confirmed via `git worktree list`

### CI/CD
- **28 GitHub Actions workflows** in `.github/workflows/` covering:
  - Lint and typecheck
  - SPDX license header validation
  - Backend unit + e2e + federation tests
  - Frontend unit tests + Cypress
  - Storybook build
  - Docker image build
  - API diff analysis
  - Changelog checking
  - misskey-js regeneration check

### .claude/ Structure
```
.claude/
├── settings.json               # Shared: plugins only, no hooks
├── settings.local.json         # Personal (gitignored)
├── CLAUDE.md                   # (root symlink via @AGENTS.md)
├── skills/                     # 5 reusable skill workflows
│   ├── add-api-endpoint/
│   ├── add-i18n-key/
│   ├── add-mk-component/
│   ├── context-budget/
│   └── create-migration/
├── agents/                     # 2 review agents
│   ├── misskey-api-reviewer/
│   └── vue-component-reviewer/
├── commands/                   # 5 slash commands
│   ├── changelog-add.md
│   ├── check-misskey-js.md
│   ├── harness-audit.md
│   ├── migrate-new.md
│   └── quality-gate.md
└── docs/                       # 5 on-demand reference docs
    ├── architecture.md
    ├── backend.md
    ├── frontend.md
    ├── testing.md
    └── plugins.md
```

### Non-obvious Gotchas
1. **`.config/test.yml` is mandatory** for all backend tests. Without it, test suites fail to even start. Copy from `.config/example.yml`.
2. **Only `ja-JP.yml` is editable** — all other 39 locale files are Crowdin delivery targets; manual edits are overwritten.
3. **Merged migrations are immutable** — never edit a migration that has been merged into `develop` or `master`. Always create a new timestamped file.
4. **Endpoint registration is manual** — adding a new API endpoint file is not enough; it must also be added to `endpoint-list.ts`.
5. **SPDX headers are CI-validated** — missing headers cause CI `spdx` job failure. The CI only checks specific directories defined in `.github/workflows/check-spdx-license-id.yml`.
6. **`misskey-js` is MIT** — the only sub-package under a different license. Do not add AGPL headers there.
7. **`packages/shared` is NOT a workspace member** — it is an ESLint config package consumed via `extends`, not a workspace dependency.
8. **PostgreSQL is the only supported database** — no SQLite/MySQL fallback (TypeORM is configured for PostgreSQL only, both in the ORM and in raw SQL used in chart queries).
9. **5 Redis connections** — the system opens separate Redis connections for: main cache, pub, sub, timelines, and reactions. They share the same `queueRedisConnection.ts` implementation.
10. **Backend build target** — `rolldown` bundles to `built/` directory; the backend entry is `built/boot/index.js`. TypeScript source maps are included.
11. **Import path alias**: `@/` maps to `packages/backend/src/` (backend) or `packages/frontend/src/` (frontend); `@@/` maps to `packages/frontend-shared/src/`.
12. **E2E queue workers must be started manually** — the test server (`test-server/entry.ts`) intentionally does not start BullMQ queue workers (to avoid interference). Tests that rely on delayed jobs (e.g., reserved posts) must call `startJobQueue()` from `@/boot/common.js` (re-exported via `../utils.js`) in `beforeAll`.

### Required Environment/Config
- **Redis** — mandatory; 5 connection lanes
- **PostgreSQL** — mandatory; connection string in `.config/default.yml`
- **Meilisearch** — optional; feature flag in config
- **S3-compatible storage** — optional; configured in `.config/default.yml` (falls back to local filesystem)
- **Summaly proxy** — external URL summarizer service (configurable endpoint)

---

## 3. Semantics Report

### Major Design Decisions

#### 1. Custom JSON Schema Type System (Not Zod)
The backend does not use Zod, class-validator, or any third-party validation library for API inputs. Instead, it uses a custom `json-schema.ts` type system (`Schema<Type>`) that maps JSON Schema to TypeScript types via branded types (`type SchemaType<Type> = Type & { __SchemaType__?: never }`). This allows compile-time type derivation from schema definitions (`Static<schema>`), shared across endpoint `paramDef` definitions and the OpenAPI generator. The frontend `misskey-js` SDK also consumes this schema for its autogen types.

#### 2. Endpoint Base Class Pattern (Not Standard NestJS Controllers)
Instead of NestJS `@Controller()` + `@Get()` decorators, all 434 API endpoints extend a custom abstract `Endpoint` class. Each endpoint file is registered in `endpoint-list.ts` (a flat array). The `EndpointsModule` wires these into Fastify routes via `ApiServerService`. This design centralizes endpoint metadata (`meta`, `paramDef`) and supports the custom JSON Schema-based request validation.

#### 3. Custom State Store (Pizzax, Not Pinia)
The frontend uses a custom reactive store (`store.ts`) built on Pizzax, a minimal observable store class. This is a deliberate decision — Pinia or Vuex are not used. State is accessed via `store.s`, `store.reactiveState`, and `defaultStore`.

#### 4. ActivityPub Implementation
Misskey implements its own ActivityPub stack (not a library). The 13 services in `core/activitypub/` handle:
- **Inbox processing**: `ApInboxService` → dispatches to type-specific handlers (`ApNoteService`, `ApPersonService`, etc.)
- **Outbox delivery**: `ApDeliverManagerService` + `ApRendererService` → queue via BullMQ `deliver`
- **Resolver**: `ApResolverService` implements HTTP signature verification and object resolution
- **Models**: TypeScript representations of AP objects (`ApNote`, `ApPerson`, `ApEmoji`, etc.) with `create()` factory methods

#### 5. Redis Architecture
Five independent Redis connections serve different purposes:
| Connection | Purpose |
|---|---|
| Main | General cache, sessions, rate limiting |
| Pub | Publish events to all workers |
| Sub | Subscribe to events (across workers) |
| Timelines | Timeline data structures (sorted sets) |
| Reactions | Reaction aggregation |

#### 6. Cluster Mode
The backend runs in cluster mode using Node.js `cluster` module:
- `master.ts` forks worker processes (default: CPU count)
- Each worker runs independently with its own Fastify instance
- Pub/Sub via Redis coordinates cross-worker communication (timeline pushes, streaming events)
- Graceful shutdown with SIGTERM handler

#### 7. i18n Architecture
- **Canonical**: `locales/ja-JP.yml` (manually edited)
- **Type generation**: `packages/i18n/build.ts` parses `ja-JP.yml` and generates `packages/i18n/src/i18n.types.ts` — a TypeScript type union of all valid keys
- **Consumption**: frontend references `i18n.ts.<key>` (static) or `i18n.tsx.<key>(params)` (parameterized)
- **Other languages**: 39 locale files synced by Crowdin; never manually edited

### Component Responsibilities

#### Backend Module Hierarchy
```
MainModule
├── GlobalModule          # All shared providers (config, db, redis, repos, meta)
│   └── RepositoryModule  # Exports all 76+ TypeORM repositories
├── ServerModule          # HTTP + WebSocket server
│   ├── EndpointsModule   # All 434 API endpoints → Fastify routes
│   └── CoreModule        # Business logic (81 services)
│       └── QueueModule   # 10 BullMQ queues + 35 processors
└── DaemonModule          # Background processes (queue stats, server stats)
```

#### Frontend Architecture Layers
```
Entry (init.ts)
├── Router (router.definition.ts) → 97 page components
├── Components (~288 Mk* components)
├── Scripts
│   ├── os.ts          # Modal/dialog/notification system
│   ├── store.ts       # Pizzax state store
│   ├── plugin.ts      # AiScript + JS plugin system
│   ├── i18n.ts        # Internationalization
│   └── api.ts         # API client (misskey-js wrapper)
├── Composables (11)
├── Directives (13)
└── Widgets (34)
```

#### Key Backend Services

| Service | Responsibility |
|---|---|
| `NoteCreateService` | Core note creation with mentions, hashtags, media, polls, scheduling |
| `DriveService` | File upload/download/delete with S3/local abstraction |
| `NotificationService` | Creates and delivers all notification types (40+ types) |
| `ApInboxService` | ActivityPub inbox processing (shared inbox + personal inbox) |
| `FederatedInstanceService` | Tracks remote instances, blocks, delivery control |
| `NoteReadService` | Manages note read status and unread counts |
| `ChartManagementService` | Aggregates and persists 16 chart types on schedule |

#### Database Entities (76 total)
Major entities: `User`, `UserProfile`, `Note`, `DriveFile`, `DriveFolder`, `Following`, `Blocking`, `Muting`, `Poll`, `PollVote`, `Emoji`, `Instance`, `AccessToken`, `Announcement`, `Notification`, `AbuseUserReport`, etc.

### Data Flow

1. **API Request Flow**: Fastify → `ApiCallService` (auth, parameter validation via JSON Schema) → Endpoint handler → Entity services → DB → EntityService pack → JSON response
2. **Note Creation Flow**: `NoteCreateService` → save to DB → `NoteEntityService.pack()` → stream to timelines via Redis pub/sub → ActivityPub delivery via BullMQ `deliver` queue → notifications via `NotificationService`
3. **Notification Flow**: event → `NotificationService.createNotification()` → DB insert → push notification (SW) + streaming event
4. **ActivityPub Inbox Flow**: Fastify route → `ApInboxService` → signature verification → `ApResolverService` → type routing → entity handlers (create/update Note, User, etc.) → timeline + notification
5. **Chart Flow**: `ChartManagementService` (hourly) → aggregates from chart-specific chart entities → persists to day/hour chart rows → serves via `/api/charts/*` endpoints

### Streaming (WebSocket)
18 channels provide real-time updates. The connection is established via `streaming/index.ts` which maps channel names to channel handler classes. Each channel subscribes to Redis pub/sub events relevant to its scope. Channels include: `main` (user's own events), `homeTimeline`, `localTimeline`, `globalTimeline`, `hashtag`, `antenna`, `channel`, `queueStats`, `serverStats`, etc.

### Queue System (BullMQ)
10 named queues with 35 processor functions:

| Queue | Processors | Purpose |
|---|---|---|
| `deliver` | 1 (`ProcessorService`) | ActivityPub delivery |
| `inbox` | 3 (1 inbox + 1 deliver + 1 LTL/Hashtag) | AP inbox processing |
| `system` | 18+ system jobs | Cleanup, stats, chart aggregation, etc. |
| `endedPollNotification` | 1 | Poll end notifications |
| `postScheduledNote` | 1 | Scheduled note publishing |
| `db` | 3 (delete + insertDriveFile + reindex) | DB operations in worker |
| `relationship` | 1 | Relationship recalc (followers/following counts) |
| `objectStorage` | 1 | Drive file operations |
| `userWebhookDeliver` | 1 | User webhook delivery |
| `systemWebhookDeliver` | 1 | System webhook delivery |

### Potential Inconsistencies
- **Migration naming style**: mixed PascalCase, camelCase, and kebab-case across the 342 migration files. No strict enforcement on file naming style; only the class name format (`<ClassName><timestamp>`) is enforced.
- **Endpoint registration**: endpoints must be manually added to `endpoint-list.ts`. This is a potential footgun for new contributors — the file exists alongside glob-registration patterns in other parts of the codebase.
- **Dual client SDK**: `misskey-js` serves as the official SDK, but the frontend also has its own `services/api.ts` wrapper. The relationship between the two is not immediately obvious to newcomers.
- **TypeORM 0.3 migration**: The codebase uses TypeORM 0.3 (`DataSource` API), but some entity files still use patterns reminiscent of the older `Connection` API (e.g., manual `BaseEntity` extension). The migration directory is large (342 files) and review requires care.

### Configuration System
- **Runtime config**: `.config/default.yml` (YAML) — loaded via `config.ts` into a typed `Config` object
- **Type generation**: `packages/backend/scripts/compile-config.mjs` generates `types.ts` with META type definitions from the config schema
- **Environment variables**: The `MISSKEY_CONFIG_YML` env var can point to an alternative config file; some values can be overridden via env vars (e.g., `MISSKEY_PORT`)
- **Test config**: `.config/test.yml` is a separate config for test runs (required)

### Code Generation
| What | Command | Triggers |
|---|---|---|
| misskey-js autogen types | `pnpm build-misskey-js-with-types` | After any API endpoint change |
| i18n types | `pnpm --filter i18n build` (or run automatically) | When `locales/ja-JP.yml` changes |
| OpenAPI spec | Backend build step | `openapi/` directory |
| DB migrations | `pnpm --filter backend migration:generate` (TypeORM CLI) | After entity changes |

---

## End of Report
