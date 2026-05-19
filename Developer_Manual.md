# Misskey Developer's Manual

Pattern reference for adding or modifying features. Each section covers one "thing to add or change" with file paths, code patterns, and registration steps.

---

## Pattern Index

| Pattern | Layer | Quick Link |
|---|---|---|
| API Endpoint | Backend | [§1](#1-api-endpoint) |
| Notification Type | Backend | [§2](#2-notification-type) |
| Queue Processor | Backend | [§3](#3-queue-processor) |
| Meta Property (Control Panel) | Backend | [§4](#4-meta-property-admin-control-panel) |
| Server Config Property | Backend | [§5](#5-server-config-property) |
| Chart Type | Backend | [§6](#6-chart-type) |
| Streaming Channel | Backend | [§7](#7-streaming-channel) |
| Daemon | Backend | [§8](#8-daemon) |
| Database Entity | Backend | [§9](#9-database-entity) |
| Core Service | Backend | [§10](#10-core-service) |
| Migration | Backend | [§11](#11-migration) |
| UI Component | Frontend | [§12](#12-ui-component) |
| Frontend Page (Route) | Frontend | [§13](#13-frontend-page) |
| Widget | Frontend | [§14](#14-widget) |
| End-User Preference | Frontend | [§15](#15-end-user-preference) |
| i18n Key | Frontend | [§16](#16-i18n-key) |
| Vue Directive | Frontend | [§17](#17-vue-directive) |
| Vue Composable | Frontend | [§18](#18-vue-composable) |

---

## Common Prerequisites

All backend `.ts` files, frontend `.vue`/`.ts`/`.scss` files require an SPDX header:

```ts
/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */
```

Vue files use HTML comment form:
```html
<!-- SPDX-FileCopyrightText: ... -->
```

`packages/misskey-js` is MIT-licensed — do **not** add AGPL headers there.

After any backend API change, run:
```bash
pnpm build-misskey-js-with-types
```

---

## 1. API Endpoint

**API path:** `POST /api/<category>/<name>` (or `GET` if `allowGet: true`)

### File to create

```
packages/backend/src/server/api/endpoints/<category>/<name>.ts
```

### Template

```ts
/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { Inject, Injectable } from '@nestjs/common';
import { Endpoint } from '@/server/api/endpoint-base.js';
import { DI } from '@/di-symbols.js';

export const meta = {
    requireCredential: false,           // or true
    tags: ['<category>'],

    kind: 'read:account',               // required when requireCredential=true

    res: {                              // response schema (JSON Schema)
        type: 'object',
        optional: false, nullable: false,
        properties: {
            result: { type: 'string', optional: false, nullable: false },
        },
    },

    errors: {                           // declared client errors
        somethingWrong: {
            message: 'Something went wrong.',
            code: 'SOMETHING_WRONG',
            id: 'xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx',  // UUID v4, globally unique
        },
    },
} as const;

export const paramDef = {               // request schema (AJV JSON Schema)
    type: 'object',
    properties: {
        foo: { type: 'string' },
    },
    required: ['foo'],
} as const;

@Injectable()
export default class extends Endpoint<typeof meta, typeof paramDef> { // eslint-disable-line import/no-default-export
    constructor(
        @Inject(DI.config)
        private config: Config,

        private myService: MyService,   // DI: other services (no @Inject needed)
    ) {
        super(meta, paramDef, async (ps, me) => {
            // ps = typed params, me = authenticated user (or null)
            return { result: 'ok' };
        });
    }
}
```

### Key rules

- `meta` and `paramDef` **must** have `as const` for literal type inference
- Error `id` must be a UUID v4, unique across all endpoints. Generate: `node -e "console.log(crypto.randomUUID())"`; verify: `grep -r "id: '<uuid>'" packages/backend/src/server/api/endpoints/`
- Use `throw new ApiError(meta.errors.somethingWrong)` for declared client errors
- Business errors from services throw `IdentifiableError` — catch and map to `ApiError`
- Default export class — ESLint disable comment required

### Registration (2 files)

**1.** `packages/backend/src/server/api/endpoint-list.ts` — add (alphabetical within category):

```ts
export * as '<category>/<name>' from './endpoints/<category>/<name>.js';
```

**2.** Run `pnpm build-misskey-js-with-types`

### End-to-end test

```ts
// packages/backend/test/e2e/<name>.ts
import { api, signup } from '../utils.js';

test('works', async () => {
    const alice = await signup({ username: 'alice' });
    const res = await api('<category>/<name>', { foo: 'bar' }, alice);
    assert.strictEqual(res.status, 200);
});
```

### Key files

| File | Purpose |
|---|---|
| `server/api/endpoint-base.ts` | `Endpoint` abstract class (AJV validation, file cleanup) |
| `server/api/endpoints.ts` | `IEndpointMeta` type with all meta field constraints |
| `server/api/error.ts` | `ApiError` class |
| `server/api/endpoint-list.ts` | Manual endpoint registry |
| `server/api/EndpointsModule.ts` | NestJS module wiring endpoints into DI |
| `test/utils.ts` | `api()`, `signup()`, `castAsError()` helpers |

### Meta fields quick reference

| Field | Type | Notes |
|---|---|---|
| `requireCredential` | `boolean` | `true` → `me` is guaranteed non-null |
| `requireModerator` | `boolean` | Moderator role required |
| `requireAdmin` | `boolean` | Administrator role required |
| `kind` | `string` | OAuth scope; required when credential/moderator/admin is true |
| `limit` | `{ duration, max }` | Rate limit (ms duration, max count) |
| `res` | Schema | Response schema or `{ ref: 'EntityName' }` |
| `errors` | `Record<string, E>` | `E = { message, code, id }` |
| `requireFile` | `boolean` | Multipart file upload required |
| `allowGet` | `boolean` | Allow GET method (default POST only) |
| `cacheSec` | `number` | Cache-Control max-age seconds |

### paramDef special formats

| Format | Usage |
|---|---|
| `{ format: 'misskey:id' }` | Validates against `/^[a-zA-Z0-9]+$/` |
| `{ default: <value> }` | Default applied by AJV |
| `{ nullable: true }` | Allow `null` |
| `{ if: ..., then: ... }` | Conditional validation |
| `{ uniqueItems: true }` | Array uniqueness |

---

## 2. Notification Type

### Architecture

Notifications are stored in **Redis streams** (`notificationTimeline:{userId}`), not PostgreSQL. No DB migration is needed.

### Files to touch (11 steps)

| # | File | Action |
|---|---|---|
| 1 | `packages/backend/src/types.ts` | Add to `notificationTypes` array |
| 2 | `packages/backend/src/models/Notification.ts` | Add union member to `MiNotification` type |
| 3 | `packages/backend/src/models/json-schema/notification.ts` | Add `oneOf` entry in `packedNotificationSchema` |
| 4 | `packages/misskey-js/src/consts.ts` | Add to `notificationTypes` array |
| 5 | `packages/backend/src/core/entities/NotificationEntityService.ts` | Add to `NOTE_REQUIRED_NOTIFICATION_TYPES` if note needed; add packing logic in `#packInternal()` |
| 6 | `packages/backend/src/core/NotificationService.ts` | (Optional) Add email logic in delayed handler |
| 7 | `packages/frontend/src/components/MkNotification.vue` | Add rendering branches (avatar, icon, header, body) |
| 8 | `packages/frontend/src/pages/settings/notifications.vue` | Set category: configurable / on-off-only / non-configurable |
| 9 | `locales/ja-JP.yml` | Add entries under `_notification` and `_notification._types` |
| 10 | (Call site) | Call `notificationService.createNotification(targetUserId, 'typeString', { ... }, sourceUserId)` |
| 11 | — | `pnpm build-misskey-js-with-types` |

### Creation pattern

```ts
this.notificationService.createNotification(
    targetUserId,            // who receives it
    'myNewType',             // type string
    { noteId: note.id },     // type-specific data (strictly typed)
    sourceUserId,            // who caused it (optional)
);
```

---

## 3. Queue Processor

### File to create

```
packages/backend/src/queue/processors/<Name>ProcessorService.ts
```

### Template (single-processor queue)

```ts
/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { Injectable } from '@nestjs/common';
import { bindThis } from '@/decorators.js';
import Bull from 'bullmq';
import { QueueLoggerService } from '@/queue/QueueLoggerService.js';
import type { MyJobData } from '@/queue/types.js';
import type { Logger } from '@/misc/logger.js';

@Injectable()
export class MyProcessorService {
    private logger: Logger;

    constructor(
        private myService: MyService,
        private queueLoggerService: QueueLoggerService,
    ) {
        this.logger = this.queueLoggerService.logger.createSubLogger('my-processor');
    }

    @bindThis
    public async process(job: Bull.Job<MyJobData>): Promise<string> {
        await this.myService.doWork(job.data);
        return 'Success';
    }
}
```

### Template (dispatch-by-name for existing queue, e.g. `db`, `system`)

```ts
@Injectable()
export class MyDbProcessorService {
    private logger: Logger;

    constructor(
        @Inject(DI.usersRepository) private usersRepository: UsersRepository,
        private queueLoggerService: QueueLoggerService,
    ) {
        this.logger = this.queueLoggerService.logger.createSubLogger('my-db-job');
    }

    @bindThis
    public async process(job: Bull.Job<MyDbJobData>): Promise<string> {
        // handle job by job.name dispatch in QueueProcessorService
    }
}
```

### Where to register

| File | Action |
|---|---|
| `queue/types.ts` | Add job data type (if new) |
| `queue/const.ts` | Add to `QUEUE` object (if new queue) |
| `queue/QueueModule.ts` | Add `Queue` provider (if new queue) |
| `queue/QueueProcessorModule.ts` | Add processor to `providers` |
| `queue/QueueProcessorService.ts` | Add Worker creation + dispatch (if new), or add to `switch(job.name)` (if existing queue) |
| `core/QueueService.ts` | Add enqueue method |

### Error conventions

- **Retryable**: throw plain `Error`
- **Non-retryable**: throw `Bull.UnrecoverableError`
- Return `'Success'` or `'ok'` on completion

---

## 4. Meta Property (Admin Control Panel)

Server settings editable from the Admin control panel at runtime. Stored in PostgreSQL `meta` table (single row).

### Files to touch

| # | File | Action |
|---|---|---|
| 1 | `packages/backend/src/models/Meta.ts` | Add `@Column(...)` to `MiMeta` |
| 2 | Migration file | Create migration for the new column |
| 3 | `server/api/endpoints/admin/meta.ts` | Add to `res.properties` and return object |
| 4 | `server/api/endpoints/admin/update-meta.ts` | Add to `paramDef.properties` and update logic |
| 5 | — | `pnpm build-misskey-js-with-types` |

### Meta DI injection

```ts
import { DI } from '@/di-symbols.js';
import type { MiMeta } from '@/models/_.js';

@Inject(DI.meta) private meta: MiMeta
```

`DI.meta` returns a **live** object that updates in-place via Redis pub/sub when settings change.

### Read-only (Config) vs Writable (Meta)

| Aspect | Meta | Config |
|---|---|---|
| Stored in | PostgreSQL `meta` table | `.config/default.yml` |
| Editable via | Admin API | Text editor + rebuild |
| Hot-reloadable | Yes (Redis pub/sub) | No (requires restart) |
| Injected via | `@Inject(DI.meta)` | `@Inject(DI.config)` |
| Examples | `disableRegistration`, `name`, `blockedHosts` | `url`, `port`, `db`, `redis` |

---

## 5. Server Config Property

Non-runtime-configurable server settings from `.config/default.yml`.

### Files to touch

| # | File | Action |
|---|---|---|
| 1 | `packages/backend/src/config.ts` — `type Source` | Add optional field |
| 2 | `packages/backend/src/config.ts` — `export type Config` | Add processed field (with defaults/derived values) |
| 3 | `packages/backend/src/config.ts` — `loadConfig()` | Apply default/derivation logic |
| 4 | `.config/example.yml` | Add field with comment |

### Usage in code

```ts
@Inject(DI.config) private config: Config
this.config.myNewField
```

Config is loaded once at startup via `loadConfig()` and never changes.

---

## 6. Chart Type

### Architecture

Base class `Chart<T extends Schema>` at `core/chart/core.ts`. Two files per chart: entity definition + implementation class. Data buffered in-memory, flushed to PostgreSQL every 20 minutes.

### Files to create

```
packages/backend/src/core/chart/charts/entities/<name>.ts   # schema + name
packages/backend/src/core/chart/charts/<name>.ts             # chart class
packages/backend/src/server/api/endpoints/charts/<name>.ts   # API endpoint
```

### Entity template (non-grouped)

```ts
/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import Chart from '../../core.js';

export const name = 'myFeature';

export const schema = {
    'total': { accumulate: true },
    'inc': { range: 'small' },
    'dec': { range: 'small' },
} as const;

export const entity = Chart.schemaToEntity(name, schema);
```

### Schema properties

| Property | Effect |
|---|---|
| `accumulate: true` | Carry forward previous window's value |
| `range: 'big'` | Use `bigint` column (default: `integer`) |
| `range: 'small'` | Use `smallint` column |
| `uniqueIncrement: true` | Track unique string IDs |
| `intersection: ['keyA', 'keyB']` | Compute intersection of two `uniqueIncrement` keys |

### Chart class template

```ts
@Injectable()
export default class MyFeatureChart extends Chart<typeof schema> { // eslint-disable-line import/no-default-export
    constructor(
        @Inject(DI.db) private db: DataSource,
        @Inject(DI.redis) private redisClient: Redis.Redis,
        private chartLoggerService: ChartLoggerService,
    ) {
        super(db, (k) => acquireChartInsertLock(redisClient, k),
              chartLoggerService.logger, name, schema);
    }

    protected async tickMajor(): Promise<Partial<KVs<typeof schema>>> { return {}; }
    protected async tickMinor(): Promise<Partial<KVs<typeof schema>>> { return {}; }

    @bindThis
    public async add(): Promise<void> {
        await this.commit({ 'inc': 1, 'total': 1 });
    }
}
```

### 10 files to touch

| # | File | Action |
|---|---|---|
| 1 | `core/chart/charts/entities/<name>.ts` | Create entity |
| 2 | `core/chart/charts/<name>.ts` | Create chart class |
| 3 | `core/chart/entities.ts` | Import entity, add `.hour` + `.day` to array |
| 4 | `core/CoreModule.ts` | Import chart, add `$alias`, to `providers` + `exports` |
| 5 | `core/chart/ChartManagementService.ts` | Import, add to constructor + `this.charts` |
| 6 | `queue/processors/TickChartsProcessorService.ts` | Import, constructor, call `tick(false)` |
| 7 | `queue/processors/CleanChartsProcessorService.ts` | Import, constructor, call `clean()` |
| 8 | `server/api/endpoints/charts/<name>.ts` | Create API endpoint |
| 9 | Migration file | Create tables `__chart__<name>` + `__chart_day__<name>` |
| 10 | (call site) | Call chart method from service |

For **grouped** charts (per-user), pass `true` to `schemaToEntity()` and `super()`, and include a group string in `commit()`.

---

## 7. Streaming Channel

### File to create

```
packages/backend/src/server/api/stream/channels/<name>.ts
```

### Template

```ts
/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { Inject, Injectable, Scope } from '@nestjs/common';
import { REQUEST } from '@nestjs/core';
import { bindThis } from '@/decorators.js';
import type { JsonObject } from '@/misc/json-value.js';
import Channel, { type ChannelRequest } from '../channel.js';

@Injectable({ scope: Scope.TRANSIENT })
export class MyChannel extends Channel {
    public readonly chName = 'myChannel';
    public static shouldShare = false;        // false → per-connection, true → shared
    public static requireCredential = true;
    public static kind = 'read:account';

    constructor(@Inject(REQUEST) request: ChannelRequest) {
        super(request);
    }

    @bindThis
    public async init(params: JsonObject): Promise<boolean> {
        this.subscriber.on('notesStream', this.onNote);  // subscribe to events
        return true;
    }

    @bindThis
    private onNote(note: Packed<'Note'>) {
        this.send('note', note);                          // relay to client
    }

    @bindThis
    public dispose() {
        this.subscriber.off('notesStream', this.onNote);  // cleanup
    }
}
```

### Static property reference

| Property | Meaning |
|---|---|
| `shouldShare` | `true` = one instance per connection; `false` = per-channel instance |
| `requireCredential` | `true` guarantees `this.user` is non-null |
| `kind` | OAuth permission string |

### Registration

| # | File | Action |
|---|---|---|
| 1 | `server/api/stream/Connection.ts` | Add `case 'myChannel': return MyChannel;` in `getChannelConstructor()` |
| 2 | `packages/misskey-js/src/streaming.types.ts` | Add to `Channels` type with `params`, `events`, `receives` |
| 3 | `pnpm build-misskey-js-with-types` | — |

Channel name must match in 3 places: `chName`, `Connection.ts` switch, `misskey-js` types.

### Event publishing

If you need a new pub/sub event, add to `core/GlobalEventService.ts`:
- Define event type interface
- Add to `GlobalEvents` type
- Add `publishXxxStream()` helper method

---

## 8. Daemon

Background service that runs periodic tasks.

### File to create

```
packages/backend/src/daemons/<Name>Service.ts
```

### Template

```ts
/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { Inject, Injectable } from '@nestjs/common';
import { bindThis } from '@/decorators.js';
import type { OnApplicationShutdown } from '@nestjs/common';

@Injectable()
export class MyDaemonService implements OnApplicationShutdown {
    private intervalId: NodeJS.Timeout;

    constructor(
        @Inject(DI.config) private config: Config,
    ) {}

    @bindThis
    public start(): void {
        this.intervalId = setInterval(() => {
            // periodic work
        }, 60_000);
    }

    @bindThis
    public dispose(): void {
        clearInterval(this.intervalId);
    }

    @bindThis
    public onApplicationShutdown(signal?: string): void {
        this.dispose();
    }
}
```

### Registration

| # | File | Action |
|---|---|---|
| 1 | `daemons/DaemonModule.ts` | Add to `providers` + `exports` |
| 2 | `boot/common.ts` | `await import(...)` → `app.get(MyDaemonService).start()` (inside `NODE_ENV !== 'test'` guard) |

---

## 9. Database Entity

### File to create

```
packages/backend/src/models/<Name>.ts
```

### Template

```ts
/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { Entity, Index, Column, PrimaryColumn } from 'typeorm';
import { id } from './util/id.js';

@Entity('<table_name>')
export class Mi<Name> {
    @PrimaryColumn(id())
    public id: string;

    @Index()
    @Column('varchar', { length: 256 })
    public name: string;

    @Column('boolean', { default: false })
    public isActive: boolean;

    constructor(data: Partial<Mi<Name>>) {
        if (data == null) return;
        for (const [k, v] of Object.entries(data)) {
            (this as any)[k] = v;
        }
    }
}
```

### Column types quick reference

| Type string | Use for |
|---|---|
| `id()` | 32-char varchar PK/FK |
| `'varchar'` + `length` | Short strings |
| `'text'` | Long strings (no length limit) |
| `'boolean'` + `default` | Flags |
| `'integer'` / `'bigint'` | Numbers |
| `'smallint'` | Small counters |
| `'jsonb'` + `default: {}` | Structured data |
| `'enum'` + `enum: [...]` | Enumerated values |
| `'timestamp with time zone'` | Dates |

### Nested column options

```ts
@Column({ ...id(), nullable: true })              // FK: spreads id() for type+length
@Column('varchar', { length: 128, array: true, default: '{}' })  // string array
@Index({ unique: true })
@Column('varchar', { length: 256 })               // unique index
@Index(['userId', 'folderId', 'id'])              // composite index (on class)
```

### Registration (7 files)

| # | File | Action |
|---|---|---|
| 1 | `models/<Name>.ts` | Create entity class |
| 2 | `models/_.ts` | Import + re-export class + add type alias `XxxRepository` |
| 3 | `di-symbols.ts` | Add `xxxRepository: Symbol('xxxRepository')` |
| 4 | `models/RepositoryModule.ts` | Add `$xxxRepository` Provider with `db.getRepository(MiXxx).extend(miRepository)` |
| 5 | Migration file | Create `CREATE TABLE` migration |
| 6 | `pnpm --filter backend check-migrations` | Verify no pending DDL |
| 7 | (usage) | Inject via `@Inject(DI.xxxRepository) private repo: XxxRepository` |

---

## 10. Core Service

### File to create

```
packages/backend/src/core/<Name>Service.ts
```

### Template

```ts
/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { Inject, Injectable } from '@nestjs/common';
import { DI } from '@/di-symbols.js';
import { bindThis } from '@/decorators.js';
import type { UsersRepository, MiUser } from '@/models/_.js';

@Injectable()
export class MyService {
    constructor(
        @Inject(DI.config) private config: Config,          // infrastructure → @Inject(DI.xxx)
        @Inject(DI.usersRepository) private usersRepository: UsersRepository, // repos → @Inject(DI.xxx)
        private otherService: OtherService,                  // other services → no decorator
    ) {}

    @bindThis
    public async doSomething(user: MiUser): Promise<void> {
        const result = await this.usersRepository.findOneByOrFail({ id: user.id });
        // ...
    }
}
```

### DI rules

| Dependency type | Injection pattern |
|---|---|
| Config, Meta, Redis, DataSource | `@Inject(DI.config) private config: Config` |
| TypeORM repositories | `@Inject(DI.usersRepository) private usersRepository: UsersRepository` |
| Other services | `private otherService: OtherService` (no decorator) |
| Charts | `private notesChart: NotesChart` (no decorator) |

### Registration

| # | File | Action |
|---|---|---|
| 1 | `core/CoreModule.ts` | Import, add to `providers` + `exports` |
| 2 | (Optional) `core/CoreModule.ts` | Add string alias for circular dep workaround: `const $MyService: Provider = { provide: 'MyService', useExisting: MyService }` |
| 3 | (usage) | Inject in endpoints or other services |

---

## 11. Migration

### Rules (from AGENTS.md)

1. **Never edit merged migrations** — only create new timestamped files
2. Always implement both `up()` and `down()`
3. Run `pnpm --filter backend check-migrations` to verify entity coverage
4. File name: `{Date.now()}-<descriptive-name>.js`
5. Class name: `class <DescriptiveName><timestamp> { ... }` (PascalCase, 13-digit timestamp)

### Create manually

```bash
node -e "console.log(Date.now())"
# → e.g. 1747651234567
```

File: `packages/backend/migration/1747651234567-MyFeature.js`

Template:
```js
/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

export class MyFeature1747651234567 {
    name = 'MyFeature1747651234567';

    async up(queryRunner) {
        await queryRunner.query(`ALTER TABLE "meta" ADD ...`);
    }

    async down(queryRunner) {
        await queryRunner.query(`ALTER TABLE "meta" DROP ...`);
    }
}
```

### Auto-generate from entity changes

```bash
pnpm --filter backend typeorm migration:generate src/migrations/<timestamp>-<Name>
```

For large tables, use `CREATE INDEX CONCURRENTLY` in the migration file with `transaction = false`.

---

## 12. UI Component

**See also:** `.claude/skills/add-mk-component/SKILL.md`

### File to create

```
packages/frontend/src/components/Mk<Name>.vue
packages/frontend/src/components/Mk<Name>.stories.impl.ts
```

### Template

```vue
<!--
SPDX-FileCopyrightText: syuilo and misskey-project
SPDX-License-Identifier: AGPL-3.0-only
-->

<template>
<div :class="$style.root">
	<slot></slot>
</div>
</template>

<script lang="ts" setup>
const props = defineProps<{
	variant?: 'primary' | 'secondary';
}>();

const emit = defineEmits<{
	(ev: 'click', payload: PointerEvent): void;
}>();
</script>

<style lang="scss" module>
.root {
	border-radius: var(--MI-radius);
	background: var(--MI_THEME-panel);
}
</style>
```

### Hard rules

| Rule | Detail |
|---|---|
| **`Mk` prefix** | All `src/components/` components must have it |
| **CSS Modules** | `<style lang="scss" module>` — no `scoped` |
| **No hardcoded strings** | Use `i18n.ts.<key>` |
| **Theme colors** | Use `var(--MI_THEME-...)` / `var(--MI-radius)` |
| **Icons** | Tabler Icons: `<i class="ti ti-check"></i>` |
| **Dialogs** | `os.alert()` / `os.confirm()` / `os.popup()` — not native `alert()` |

### Story template

```ts
/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

/* eslint-disable @typescript-eslint/explicit-function-return-type */
import type { StoryObj } from '@storybook/vue3';
import MkMyComponent from './MkMyComponent.vue';

export const Default = {
    render(args) {
        return {
            components: { MkMyComponent },
            setup() { return { args }; },
            computed: {
                props() { return { ...this.args }; },
            },
            template: '<MkMyComponent v-bind="props">Content</MkMyComponent>',
        };
    },
    args: {},
    parameters: { layout: 'centered' },
} satisfies StoryObj<typeof MkMyComponent>;
```

### Global vs Local Registration

| Type | Location | Registration |
|---|---|---|
| **Global** (MkTime, MkAvatar, MkA, etc.) | Add to `src/components/index.ts` | Auto-available everywhere |
| **Local** (MkButton, MkInput, MkSelect, etc.) | Import in consumer | `import MkXxx from '@/components/MkXxx.vue'` |

Global registration pattern in `components/index.ts`:
```ts
export const components = {
    MkMyComponent: MkMyComponent,
};
declare module 'vue' {
    export interface GlobalComponents {
        MkMyComponent: typeof MkMyComponent;
    }
}
```

---

## 13. Frontend Page

### File to create

```
packages/frontend/src/pages/my-new-page.vue
```

### Template

```vue
<!--
SPDX-FileCopyrightText: syuilo and misskey-project
SPDX-License-Identifier: AGPL-3.0-only
-->

<template>
<PageWithHeader :tabs="headerTabs" :actions="headerActions">
    <div class="_gaps_m">
        <!-- content -->
    </div>
</PageWithHeader>
</template>

<script lang="ts" setup>
import { computed } from 'vue';
import { definePage } from '@/page.js';

definePage(() => ({
    title: 'My New Page',
    icon: 'ti ti-star',
}));
</script>

<style lang="scss" module>
/* styles */
</style>
```

### Route registration

In `packages/frontend/src/router.definition.ts`:

```ts
import { page } from '@/router.definition.js';  // typically used internally

export const ROUTE_DEF = [
    // ... existing routes
    {
        name: 'myNewPage',              // optional: for programmatic navigation
        path: '/my-new-page',
        component: page(() => import('@/pages/my-new-page.vue')),
        loginRequired: false,           // or true
        query: {                        // map URL query → props
            q: 'query',
        },
    },
] as const satisfies RouteDef[];
```

### Nested routes (parent with children)

Parent page uses `<NestedRouterView/>`:

```vue
<NestedRouterView/>
```

Parent provides navigation via `MkSuperMenu` and reads child metadata:

```ts
import { provideMetadataReceiver } from '@/page.js';

provideMetadataReceiver((metadataGetter) => {
    childInfo.value = metadataGetter();
});
```

### Programmatic navigation

```ts
import { useRouter } from '@/router.js';
const router = useRouter();
router.push('/my-new-page');
router.replace('/my-new-page');
```

---

## 14. Widget

### File to create

```
packages/frontend/src/widgets/Widget<Name>.vue
```

### Template

```vue
<!--
SPDX-FileCopyrightText: syuilo and misskey-project
SPDX-License-Identifier: AGPL-3.0-only
-->

<template>
<MkContainer :showHeader="widgetProps.showHeader" class="mkw-myWidget">
    <template #icon><i class="ti ti-star"></i></template>
    <template #header>{{ i18n.ts._widgets.myWidget }}</template>
    <div :class="$style.root">
        <!-- widget content -->
    </div>
</MkContainer>
</template>

<script lang="ts" setup>
import { ref } from 'vue';
import { useWidgetPropsManager } from './widget.js';
import type { WidgetComponentEmits, WidgetComponentExpose, WidgetComponentProps } from './widget.js';
import type { FormWithDefault, GetFormResultType } from '@/utility/form.js';
import MkContainer from '@/components/MkContainer.vue';
import { i18n } from '@/i18n.js';

const name = 'myWidget';

const widgetPropsDef = {
    showHeader: { type: 'boolean', label: i18n.ts._widgetOptions.showHeader, default: true },
    height: { type: 'number', label: i18n.ts.height, default: 200 },
} satisfies FormWithDefault;

type WidgetProps = GetFormResultType<typeof widgetPropsDef>;

const props = defineProps<WidgetComponentProps<WidgetProps>>();
const emit = defineEmits<WidgetComponentEmits<WidgetProps>>();

const { widgetProps, configure } = useWidgetPropsManager(name, widgetPropsDef, props, emit);

defineExpose<WidgetComponentExpose>({
    name,
    configure,
    id: props.widget ? props.widget.id : null,
});
</script>

<style lang="scss" module>
.root { /* styles */ }
</style>
```

### Registration

In `packages/frontend/src/widgets/index.ts`:

```ts
// In the default export function:
app.component('WidgetMyWidget', defineAsyncComponent(() => import('./WidgetMyWidget.vue')));

// In the widgets array:
export const widgets = ['profile', 'instanceInfo', /* ... */ 'myWidget'] as const;
```

---

## 15. End-User Preference

### Architecture

Two systems coexist (gradually migrating from `store`/Pizzax to `prefer`/PreferencesManager):

| System | Storage | API | Usage |
|---|---|---|---|
| `prefer` (new) | localStorage + `i/registry/*` cloud sync | `prefer.s.key` / `prefer.model('key')` | All new preferences |
| `store` (legacy) | IndexedDB + optional `i/registry/*` | `store.s.key` / `store.r.key` | Legacy preferences |

### Adding a new preference

**1.** Add to `packages/frontend/src/preferences/def.ts`:

```ts
export const PREF_DEF = definePreferences({
    // ... existing ...
    'myNewPreference': {
        default: 'defaultValue',
    },
});
```

**2.** Read in components:

```ts
import { prefer } from '@/preferences.js';

// Static read
const value = prefer.s.myNewPreference;

// Vue reactive (for v-model)
const vmodel = prefer.model('myNewPreference');
```

```vue
<MkSelect v-model="vmodel" ...>
```

**3.** Add settings UI in `pages/settings/preferences.vue`:

```vue
<MkPreferenceContainer k="myNewPreference">
    <MkSwitch v-model="myNewPreference">
        <template #label>{{ i18n.ts.myNewPreference }}</template>
    </MkSwitch>
</MkPreferenceContainer>
```

### Server-side settings (user profile)

Settings visible to others or needed server-side go to the `user_profile` table:

| # | File | Action |
|---|---|---|
| 1 | `backend/src/models/UserProfile.ts` | Add `@Column` to `MiUserProfile` |
| 2 | Migration | Create migration for the column |
| 3 | `server/api/endpoints/i/update.ts` | Add to `paramDef.properties` + save logic |

---

## 16. i18n Key

**See also:** `.claude/skills/add-i18n-key/SKILL.md`

### Rules

- **Only edit** `locales/ja-JP.yml` — other 39 language files are Crowdin delivery targets
- i18n package auto-generates `packages/i18n/src/i18n.types.ts` from `ja-JP.yml`
- Frontend usage: `i18n.ts.<key>` (static) or `i18n.tsx.<key>(params)` (parameterized)

### Adding a key

**1.** Add to `locales/ja-JP.yml`:

```yaml
_mySection:
  myKey: "私のキー"
  myKeyWithParam: "{param}を使う"
```

**2.** Use in frontend:

```ts
import { i18n } from '@/i18n.js';

// Static
i18n.ts._mySection.myKey          // → "私のキー"

// Parameterized
i18n.tsx._mySection.myKeyWithParam({ param: '値' })  // → "値を使う"
```

Types are auto-regenerated when `ja-JP.yml` changes.

---

## 17. Vue Directive

### File to create

```
packages/frontend/src/directives/<name>.ts
```

### Template

```ts
/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import type { Directive } from 'vue';

interface MyDirectiveElement extends HTMLElement {
    _myDirective_?: {
        value: string;
        handler: (ev: Event) => void;
    };
}

export const myDirective = {
    mounted(el: MyDirectiveElement, binding) {
        el._myDirective_ = {
            value: binding.value,
            handler: (ev) => { /* ... */ },
        };
        el.addEventListener('click', el._myDirective_.handler);
    },
    updated(el, binding) {
        if (el._myDirective_) el._myDirective_.value = binding.value;
    },
    unmounted(el) {
        if (el._myDirective_) {
            el.removeEventListener('click', el._myDirective_.handler);
            delete el._myDirective_;
        }
    },
} as Directive<MyDirectiveElement, string>;
```

### Registration

In `packages/frontend/src/directives/index.ts`:

```ts
import { myDirective } from './my-directive.js';

export const directives = {
    // ... existing ...
    'my-directive': myDirective,
} as Record<string, Directive>;

declare module 'vue' {
    export interface GlobalDirectives {
        vMyDirective: typeof myDirective;
    }
}
```

### Usage in template

```vue
<div v-my-directive="'value'"></div>
```

With modifiers/args:
```vue
<div v-my-directive:argName.mod1.mod2="'value'"></div>
```

---

## 18. Vue Composable

### File to create

```
packages/frontend/src/composables/use-<name>.ts
```

### Template

```ts
/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { ref, computed, watch, onMounted, onUnmounted } from 'vue';
import type { Ref } from 'vue';

export function useMyFeature(input: Ref<string>) {
    const result = ref<string | null>(null);
    let cleanup: (() => void) | undefined;

    watch(input, (val) => {
        result.value = doSomething(val);
    }, { immediate: true });

    onUnmounted(() => {
        cleanup?.();
    });

    return {
        result,                          // expose values
        reset: () => { result.value = null; },  // expose methods
    };
}
```

### Usage

```ts
// In a component's <script setup>
import { useMyFeature } from '@/composables/use-my-feature.js';

const { result, reset } = useMyFeature(someRef);
```

No registration step needed — just import and use. For module-level singletons with shared state, export a module-level `ref`.

---

## Quick Reference: Post-Change Commands

| After changing | Run |
|---|---|
| Backend API endpoint | `pnpm build-misskey-js-with-types` |
| Backend entity (new/changed) | `pnpm --filter backend check-migrations` |
| Frontend/i18n/any | `pnpm lint` (or `pnpm --filter <pkg> lint`) |
| `locales/ja-JP.yml` | (i18n types auto-regenerated) |
| All packages | `pnpm build` |
