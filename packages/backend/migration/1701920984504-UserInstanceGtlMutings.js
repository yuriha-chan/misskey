/*
 * SPDX-FileCopyrightText: syuilo and other misskey contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 */

export class UserInstanceGtlMutings1701920984504 {
	name = 'UserInstanceGtlMutings1701920984504'

	async up(queryRunner) {
		await queryRunner.query(`ALTER TABLE "user_profile" ADD "gtlMutedInstances" jsonb NOT NULL DEFAULT '[]'`);
	}

	async down(queryRunner) {
		await queryRunner.query(`ALTER TABLE "user_profile" DROP COLUMN "gtlMutedInstances"`);
	}
}
