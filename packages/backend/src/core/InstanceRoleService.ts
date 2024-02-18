/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { Inject, Injectable } from '@nestjs/common';
import * as Redis from 'ioredis';
import { In } from 'typeorm';
import { ModuleRef } from '@nestjs/core';
import type {
	MiInstanceRole,
	MiInstanceRoleAssignment,
	InstanceRoleAssignmentsRepository,
	InstanceRolesRepository,
	InstanceRepository,
} from '@/models/_.js';
import { MemoryKVCache, MemorySingleCache } from '@/misc/cache.js';
import type { MiUser } from '@/models/User.js';
import { DI } from '@/di-symbols.js';
import { bindThis } from '@/decorators.js';
import { MetaService } from '@/core/MetaService.js';
import { CacheService } from '@/core/CacheService.js';
import type { InstanceRoleCondFormulaValue } from '@/models/InstanceRole.js';
import { UserEntityService } from '@/core/entities/UserEntityService.js';
import type { GlobalEvents } from '@/core/GlobalEventService.js';
import { GlobalEventService } from '@/core/GlobalEventService.js';
import { IdService } from '@/core/IdService.js';
import { ModerationLogService } from '@/core/ModerationLogService.js';
import type { Packed } from '@/misc/json-schema.js';
import { FanoutTimelineService } from '@/core/FanoutTimelineService.js';
import { NotificationService } from '@/core/NotificationService.js';
import type { OnApplicationShutdown, OnModuleInit } from '@nestjs/common';

export type InstanceRolePolicies = {
	followRateLimit: number;
	subscribeRateLimit: number;
	reactionRateLimit: number;
	notificationRateLimit: number;
	noteRateLimit: number;
	newUserRateLimit: number;
};

export const DEFAULT_POLICIES: InstanceRolePolicies = {
	followRateLimit: -1,
	subscribeRateLimit: -1,
  reactionRateLimit: -1,
  notificationRateLimit: -1,
  noteRateLimit: -1,
  newUserRateLimit: -1
};

@Injectable()
export class InstanceRoleService implements OnApplicationShutdown, OnModuleInit {
	private rolesCache: MemorySingleCache<MiInstanceRole[]>;
	private roleAssignmentByInstanceIdCache: MemoryKVCache<MiInstanceRoleAssignment[]>;
	private notificationService: NotificationService;

	public static AlreadyAssignedError = class extends Error {};
	public static NotAssignedError = class extends Error {};

	constructor(
		private moduleRef: ModuleRef,

		@Inject(DI.redis)
		private redisClient: Redis.Redis,

		@Inject(DI.redisForTimelines)
		private redisForTimelines: Redis.Redis,

		@Inject(DI.redisForSub)
		private redisForSub: Redis.Redis,

		@Inject(DI.usersRepository)
		private usersRepository: UsersRepository,

		@Inject(DI.rolesRepository)
		private rolesRepository: InstanceRolesRepository,

		@Inject(DI.roleAssignmentsRepository)
		private roleAssignmentsRepository: InstanceRoleAssignmentsRepository,

		private metaService: MetaService,
		private cacheService: CacheService,
		private userEntityService: UserEntityService,
		private globalEventService: GlobalEventService,
		private idService: IdService,
		private moderationLogService: ModerationLogService,
		private fanoutTimelineService: FanoutTimelineService,
	) {
		//this.onMessage = this.onMessage.bind(this);

		this.rolesCache = new MemorySingleCache<MiInstanceRole[]>(1000 * 60 * 60 * 1);
		this.roleAssignmentByInstanceIdCache = new MemoryKVCache<MiInstanceRoleAssignment[]>(1000 * 60 * 60 * 1);

	}

	async onModuleInit() {
		this.notificationService = this.moduleRef.get(NotificationService.name);
	}

	@bindThis
	private evalCond(instance: MiInstance, value: InstanceRoleCondFormulaValue): boolean {
		try {
			switch (value.type) {
				case 'and': {
					return value.values.every(v => this.evalCond(instance, v));
				}
				case 'or': {
					return value.values.some(v => this.evalCond(instance, v));
				}
				case 'not': {
					return !this.evalCond(instance, value.value);
				}
				case 'createdLessThan': {
					return this.idService.parse(instance.id).date.getTime() > (Date.now() - (value.sec * 1000));
				}
				case 'createdMoreThan': {
					return this.idService.parse(instance.id).date.getTime() < (Date.now() - (value.sec * 1000));
				}
				case 'followersLessThanOrEq': {
					return instance.followersCount <= value.value;
				}
				case 'followersMoreThanOrEq': {
					return instance.followersCount >= value.value;
				}
				case 'followingLessThanOrEq': {
					return instance.followingCount <= value.value;
				}
				case 'followingMoreThanOrEq': {
					return instance.followingCount >= value.value;
				}
				case 'notesLessThanOrEq': {
					return instance.notesCount <= value.value;
				}
				case 'notesMoreThanOrEq': {
					return instance.notesCount >= value.value;
				}
				default:
					return false;
			}
		} catch (err) {
			// TODO: log error
			return false;
		}
	}

	@bindThis
	public async getRoles() {
		const roles = await this.rolesCache.fetch(() => this.rolesRepository.findBy({}));
		return roles;
	}

	@bindThis
	public async getInstanceAssigns(instanceId: MiInstance['id']) {
		const now = Date.now();
		let assigns = await this.roleAssignmentByInstanceIdCache.fetch(instanceId, () => this.roleAssignmentsRepository.findBy({ instanceId }));
		// 期限切れのロールを除外
		assigns = assigns.filter(a => a.expiresAt == null || (a.expiresAt.getTime() > now));
		return assigns;
	}

	@bindThis
	public async getInstanceRoles(instanceId: MiInstance['id']) {
		const roles = await this.rolesCache.fetch(() => this.rolesRepository.findBy({}));
		const assigns = await this.getInstanceAssigns(instanceId);
		const assignedRoles = roles.filter(r => assigns.map(x => x.roleId).includes(r.id));
		const instance = roles.some(r => r.target === 'conditional') ? await this.cacheService.findInstanceById(instanceId) : null;
		const matchedCondRoles = roles.filter(r => r.target === 'conditional' && this.evalCond(user!, r.condFormula));
		return [...assignedRoles, ...matchedCondRoles];
	}

	@bindThis
	public async getInstancePolicies(instanceId: MiInstance['id'] | null): Promise<InstanceRolePolicies> {
		const meta = await this.metaService.fetch();
		const basePolicies = { ...DEFAULT_POLICIES, ...meta.instancePolicies };

		if (instanceId == null) return basePolicies;

		const roles = await this.getInstanceRoles(instanceId);

		function calc<T extends keyof RolePolicies>(name: T, aggregate: (values: RolePolicies[T][]) => RolePolicies[T]) {
			if (roles.length === 0) return basePolicies[name];

			const policies = roles.map(role => role.policies[name] ?? { priority: 0, useDefault: true });

			const p2 = policies.filter(policy => policy.priority === 2);
			if (p2.length > 0) return aggregate(p2.map(policy => policy.useDefault ? basePolicies[name] : policy.value));

			const p1 = policies.filter(policy => policy.priority === 1);
			if (p1.length > 0) return aggregate(p1.map(policy => policy.useDefault ? basePolicies[name] : policy.value));

			return aggregate(policies.map(policy => policy.useDefault ? basePolicies[name] : policy.value));
		}

		return {
	    followRateLimit: -1,
	    subscribeRateLimit: -1,
      reactionRateLimit: -1,
      notificationRateLimit: -1,
      noteRateLimit: -1,
      newUserRateLimit: -1
		};
	}

	@bindThis
	public async assign(instanceId: MiInstance['id'], roldId: MiInstanceRole['id'], expiresAt: Date | null = null, moderator?: MiUser): Promise<void> {
		const now = Date.now();

		const role = await this.rolesRepository.findOneByOrFail({ id: roleId });

		const existing = await this.roleAssignmentsRepository.findOneBy({
			roleId: roleId,
			instanceId: instanceId,
		});

		if (existing) {
			if (existing.expiresAt && (existing.expiresAt.getTime() < now)) {
				await this.roleAssignmentsRepository.delete({
					roleId: roleId,
					instanceId: instanceId,
				});
			} else {
				throw new RoleService.AlreadyAssignedError();
			}
		}

		const created = await this.roleAssignmentsRepository.insert({
			id: this.idService.gen(now),
			expiresAt: expiresAt,
			roleId: roleId,
			instanceId: instanceId,
		}).then(x => this.roleAssignmentsRepository.findOneByOrFail(x.identifiers[0]));

		this.rolesRepository.update(roleId, {
			lastUsedAt: new Date(),
		});

		this.globalEventService.publishInternalEvent('userRoleAssigned', created);

		if (moderator) {
			const instance = await this.instanceRepository.findOneByOrFail({ id: instanceId });
			this.moderationLogService.log(moderator, 'assignInstanceRole', {
				roleId: roleId,
				roleName: role.name,
				instanceId: instanceId,
				instanceHostname: instance.hostname,
				expiresAt: expiresAt ? expiresAt.toISOString() : null,
			});
		}
	}

	@bindThis
	public async unassign(instanceId: MiInstance['id'], roldId: MiInstanceRole['id'], moderator?: MiUser): Promise<void> {
		const now = new Date();

		const existing = await this.roleAssignmentsRepository.findOneBy({ roleId, userId });
		if (existing == null) {
			throw new RoleService.NotAssignedError();
		} else if (existing.expiresAt && (existing.expiresAt.getTime() < now.getTime())) {
			await this.roleAssignmentsRepository.delete({
				roleId: roleId,
				instanceId: instanceId,
			});
			throw new RoleService.NotAssignedError();
		}

		await this.roleAssignmentsRepository.delete(existing.id);

		this.rolesRepository.update(roleId, {
			lastUsedAt: now,
		});

		this.globalEventService.publishInternalEvent('userRoleUnassigned', existing);

		if (moderator) {
			const [instance, role] = await Promise.all([
				this.instanceRepository.findOneByOrFail({ id: instanceId }),
				this.rolesRepository.findOneByOrFail({ id: roleId }),
			]);
			this.moderationLogService.log(moderator, 'unassignInstanceRole', {
				roleId: roleId,
				roleName: role.name,
				instanceId: instanceId,
				instanceHostname: instance.hostname,
			});
		}
	}

	@bindThis
	public async create(values: Partial<MiInstanceRole>, moderator?: MiUser): Promise<MiInstanceRole> {
		const date = new Date();
		const created = await this.rolesRepository.insert({
			id: this.idService.gen(date.getTime()),
			updatedAt: date,
			lastUsedAt: date,
			name: values.name,
			description: values.description,
			color: values.color,
			iconUrl: values.iconUrl,
			target: values.target,
			condFormula: values.condFormula,
			canEditMembersByModerator: values.canEditMembersByModerator,
			displayOrder: values.displayOrder,
			policies: values.policies,
		}).then(x => this.rolesRepository.findOneByOrFail(x.identifiers[0]));

		this.globalEventService.publishInternalEvent('roleCreated', created);

		if (moderator) {
			this.moderationLogService.log(moderator, 'createInstanceRole', {
				roleId: created.id,
				role: created,
			});
		}

		return created;
	}

	@bindThis
	public async update(role: MiInstanceRole, params: Partial<MiInstanceRole>, moderator?: MiUser): Promise<void> {
		const date = new Date();
		await this.rolesRepository.update(role.id, {
			updatedAt: date,
			...params,
		});

		const updated = await this.rolesRepository.findOneByOrFail({ id: role.id });
		this.globalEventService.publishInternalEvent('roleUpdated', updated);

		if (moderator) {
			this.moderationLogService.log(moderator, 'updateInstanceRole', {
				roleId: role.id,
				before: role,
				after: updated,
			});
		}
	}

	@bindThis
	public async delete(role: MiInstanceRole, moderator?: MiUser): Promise<void> {
		await this.rolesRepository.delete({ id: role.id });
		this.globalEventService.publishInternalEvent('roleDeleted', role);

		if (moderator) {
			this.moderationLogService.log(moderator, 'deleteInstanceRole', {
				roleId: role.id,
				role: role,
			});
		}
	}

	@bindThis
	public dispose(): void {
		this.roleAssignmentByInstanceIdCache.dispose();
	}

	@bindThis
	public onApplicationShutdown(signal?: string | undefined): void {
		this.dispose();
	}
}
